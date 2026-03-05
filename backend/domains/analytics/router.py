# ============================================================
# backend/domains/analytics/router.py — Unified Analytics API
# ============================================================
# Provides cross-domain analytics combining pentest scans
# and SOC alerts for the analytics dashboard.
# ============================================================

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from core.cache import TTL_STANDARD, TTL_SLOW, cache_get, cache_set
from core.dependencies import get_current_user
from domains.auth.models import User
from domains.pentesting.models import Scan
from domains.soc.models import Alert

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

RANGE_DAYS = {"7d": 7, "30d": 30, "90d": 90}


def _level_to_severity(level: int) -> str:
    if level >= 12: return "critical"
    if level >= 8:  return "high"
    if level >= 5:  return "medium"
    if level >= 1:  return "low"
    return "informational"


@router.get("/admin-stats")
async def get_admin_stats(
    range: str = Query("7d", pattern="^(7d|30d|90d)$"),
    current_user: User = Depends(get_current_user),
):
    """
    [Admin] Full aggregated stats for the admin dashboard.

    Returns the complete shape consumed by Admin.tsx:
      scans / alerts / users — KPI counts, trends, per-day breakdowns
      top_scan_users         — top 5 users by scan count in the period
      top_alert_agents       — top 5 Wazuh agents by alert count (all-time)

    Cached for 60 seconds — invalidated on new scan/alert creation.
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    cache_key = f"cs:cache:analytics:admin-stats:{range}"
    if cached := await cache_get(cache_key):
        return cached

    from domains.auth.models import User as UserModel
    from bson import ObjectId

    days = RANGE_DAYS.get(range, 7)
    now = datetime.now(timezone.utc)
    since = now - timedelta(days=days)
    prev_since = now - timedelta(days=days * 2)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # ── Scans ────────────────────────────────────────────────────────────────
    total_scans = await Scan.find().count()
    active_scans = await Scan.find({"status": {"$in": ["running", "pending"]}}).count()
    scans_today = await Scan.find(Scan.created_at >= today_start).count()
    scans_period = await Scan.find(Scan.created_at >= since).count()
    scans_prev = await Scan.find(
        Scan.created_at >= prev_since, Scan.created_at < since
    ).count()
    scans_trend = round((scans_period - scans_prev) / max(scans_prev, 1) * 100, 1)

    # Scans by day + top users — one list fetch, two uses
    period_scans = await Scan.find(Scan.created_at >= since).limit(1000).to_list()
    scans_day_map: dict[str, int] = defaultdict(int)
    user_scan_counts: dict[str, int] = defaultdict(int)
    for s in period_scans:
        if s.created_at:
            ts = s.created_at if s.created_at.tzinfo else s.created_at.replace(tzinfo=timezone.utc)
            scans_day_map[ts.strftime("%m/%d")] += 1
        if s.user_id:
            user_scan_counts[s.user_id] += 1

    scans_by_day = [
        {"date": (now - timedelta(days=i)).strftime("%m/%d"),
         "count": scans_day_map.get((now - timedelta(days=i)).strftime("%m/%d"), 0)}
        for i in range(days - 1, -1, -1)
    ]

    # Top 5 users by scan count
    top_scan_users: list[dict] = []
    for uid, count in sorted(user_scan_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        try:
            u = await UserModel.get(ObjectId(uid))
            top_scan_users.append({"email": u.username if u else uid, "scans": count})
        except Exception as exc:
            log.debug("user lookup failed for analytics uid %s: %s", uid, exc)
            top_scan_users.append({"email": uid, "scans": count})

    # ── Alerts ───────────────────────────────────────────────────────────────
    # All-time severity breakdown — use Motor aggregation to avoid loading everything
    alert_coll = Alert.get_motor_collection()
    sev_pipeline = [
        {"$group": {
            "_id": {
                "$switch": {
                    "branches": [
                        {"case": {"$gte": ["$rule_level", 12]}, "then": "critical"},
                        {"case": {"$gte": ["$rule_level", 8]},  "then": "high"},
                        {"case": {"$gte": ["$rule_level", 5]},  "then": "medium"},
                        {"case": {"$gte": ["$rule_level", 1]},  "then": "low"},
                    ],
                    "default": "informational",
                }
            },
            "count": {"$sum": 1},
        }}
    ]
    sev_raw = await alert_coll.aggregate(sev_pipeline).to_list(length=None)
    sev_counts: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}
    for row in sev_raw:
        if row.get("_id") in sev_counts:
            sev_counts[row["_id"]] = row["count"]
    by_severity = [{"name": k, "count": v} for k, v in sev_counts.items()]
    total_alerts = sum(sev_counts.values())

    alerts_today = await Alert.find(Alert.timestamp >= today_start).count()
    alerts_period = await Alert.find(Alert.timestamp >= since).count()
    alerts_prev = await Alert.find(
        Alert.timestamp >= prev_since, Alert.timestamp < since
    ).count()
    alerts_trend = round((alerts_period - alerts_prev) / max(alerts_prev, 1) * 100, 1)

    # Alerts by day + top agents — one list fetch, two uses
    period_alerts = await Alert.find(Alert.timestamp >= since).limit(1000).to_list()
    alerts_day_map: dict[str, int] = defaultdict(int)
    agent_counts: dict[str, int] = defaultdict(int)
    for a in period_alerts:
        try:
            ts = a.timestamp if a.timestamp.tzinfo else a.timestamp.replace(tzinfo=timezone.utc)
            alerts_day_map[ts.strftime("%m/%d")] += 1
        except Exception as exc:
            log.debug("alert day grouping failed: %s", exc)
        if a.agent_name:
            agent_counts[a.agent_name] += 1

    alerts_by_day = [
        {"date": (now - timedelta(days=i)).strftime("%m/%d"),
         "count": alerts_day_map.get((now - timedelta(days=i)).strftime("%m/%d"), 0)}
        for i in range(days - 1, -1, -1)
    ]
    top_alert_agents = [
        {"agent": agent, "count": count}
        for agent, count in sorted(agent_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    ]

    # ── Users ─────────────────────────────────────────────────────────────────
    total_users = await UserModel.find().count()
    pending_users = await UserModel.find(UserModel.status == "pending").count()
    active_users = await UserModel.find(UserModel.status == "active").count()
    new_today = await UserModel.find(UserModel.created_at >= today_start).count()
    new_period = await UserModel.find(UserModel.created_at >= since).count()
    new_prev = await UserModel.find(
        UserModel.created_at >= prev_since, UserModel.created_at < since
    ).count()
    users_trend = round((new_period - new_prev) / max(new_prev, 1) * 100, 1)

    result = {
        "scans": {
            "total":     total_scans,
            "active":    active_scans,
            "today":     scans_today,
            "period":    scans_period,
            "trend_pct": scans_trend,
            "by_day":    scans_by_day,
        },
        "alerts": {
            "total":       total_alerts,
            "today":       alerts_today,
            "critical":    sev_counts["critical"],
            "period":      alerts_period,
            "trend_pct":   alerts_trend,
            "by_severity": by_severity,
            "by_day":      alerts_by_day,
        },
        "users": {
            "total":      total_users,
            "pending":    pending_users,
            "active":     active_users,
            "new_today":  new_today,
            "new_period": new_period,
            "trend_pct":  users_trend,
        },
        "top_scan_users":   top_scan_users,
        "top_alert_agents": top_alert_agents,
        "range":            range,
        "generated_at":     now.isoformat(),
    }
    await cache_set(cache_key, result, ttl=TTL_STANDARD)
    return result


@router.get("/admin-stats/export")
async def export_admin_stats(
    range: str = Query("7d", pattern="^(7d|30d|90d)$"),
    current_user: User = Depends(get_current_user),
):
    """[Admin] CSV export of admin stats. Returns 501 until implemented."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")
    raise HTTPException(status_code=501, detail="CSV export not yet implemented")


@router.get("")
async def get_analytics(
    range: str = Query("30d", pattern="^(7d|30d|90d)$"),
    current_user: User = Depends(get_current_user),
):
    """
    Unified analytics endpoint combining pentest and SOC data.
    Query param: range = 7d | 30d | 90d (default 30d)
    Cached per user+range for 60 seconds.
    """
    days = RANGE_DAYS.get(range, 30)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    user_id = str(current_user.id)

    cache_key = f"cs:cache:analytics:user-stats:{user_id}:{range}"
    if cached := await cache_get(cache_key):
        return cached

    # ── Pentest analytics ────────────────────────────────────
    scans = await Scan.find(
        Scan.user_id == user_id,
        Scan.created_at >= since,
    ).to_list()

    scans_by_day: dict[str, int] = {}
    findings_by_severity: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    scanner_stats: dict[str, dict[str, int]] = {}
    target_counts: dict[str, int] = {}
    durations: list[float] = []

    for scan in scans:
        # Scans per day
        if scan.created_at:
            ts = scan.created_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            day = ts.strftime("%Y-%m-%d")
            scans_by_day[day] = scans_by_day.get(day, 0) + 1

        # Findings by severity
        for finding in (getattr(scan, "findings", None) or []):
            try:
                sev = (
                    finding.severity if hasattr(finding, "severity")
                    else finding.get("severity", "Info")
                )
                sev = str(sev).lower() if sev else "info"
                if sev not in findings_by_severity:
                    sev = "info"
                findings_by_severity[sev] += 1

                # Target vulnerability counts
                target = getattr(scan, "target", None) or "unknown"
                target_counts[target] = target_counts.get(target, 0) + 1
            except Exception as exc:
                log.debug("scan finding parse failed: %s", exc)

        # Scanner success / fail rates
        tool_results = getattr(scan, "tool_results", None) or {}
        if isinstance(tool_results, dict):
            for tool_name, tool_result in tool_results.items():
                if tool_name not in scanner_stats:
                    scanner_stats[tool_name] = {"success": 0, "failed": 0}
                try:
                    status = (
                        tool_result.get("status", "success")
                        if isinstance(tool_result, dict)
                        else "success"
                    )
                    key = "failed" if status == "failed" else "success"
                    scanner_stats[tool_name][key] += 1
                except Exception as exc:
                    log.debug("scanner stat parse failed for %s: %s", tool_name, exc)
                    scanner_stats[tool_name]["success"] += 1

        # Scan duration
        try:
            ca = getattr(scan, "completed_at", None)
            cr = getattr(scan, "created_at", None)
            if ca and cr:
                if ca.tzinfo is None:
                    ca = ca.replace(tzinfo=timezone.utc)
                if cr.tzinfo is None:
                    cr = cr.replace(tzinfo=timezone.utc)
                duration = (ca - cr).total_seconds()
                if 0 < duration < 86400:
                    durations.append(duration)
        except Exception as exc:
            log.debug("scan duration calculation failed: %s", exc)

    avg_duration = round(sum(durations) / len(durations), 1) if durations else 0.0
    top_targets = sorted(target_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    scans_over_time = [{"date": k, "count": v} for k, v in sorted(scans_by_day.items())]
    scanner_success_rate = [
        {
            "scanner": tool,
            "completed": counts["success"],
            "failed": counts["failed"],
            "rate": round(
                counts["success"] / max(counts["success"] + counts["failed"], 1), 3
            ),
        }
        for tool, counts in scanner_stats.items()
    ]

    # ── SOC analytics ────────────────────────────────────────
    # Scope alerts to this user: tenant_id bucket OR project agent names.
    # Admin sees all alerts (they use /admin-stats); regular users see only their own.
    try:
        from domains.soc.project_models import SocProject
        is_admin = current_user.role == "admin"
        if is_admin:
            alert_filter: dict = {"timestamp": {"$gte": since}}
        else:
            has_token = bool(getattr(current_user, "wazuh_token", None))
            has_agent = bool(current_user.wazuh_agent_name)
            user_projects = await SocProject.find(
                SocProject.owner_id == user_id
            ).limit(500).to_list()
            agent_names = [p.wazuh_agent_name or p.slug for p in user_projects]
            conditions: list[dict] = []
            if has_token:
                conditions.append({"tenant_id": user_id})
            if has_agent:
                conditions.append({"agent_name": current_user.wazuh_agent_name})
            if agent_names:
                conditions.append({"agent_name": {"$in": agent_names}})
            # Unconfigured (demo) accounts see all platform alerts in analytics
            if conditions:
                tenant_filter = {"$or": conditions} if len(conditions) > 1 else conditions[0]
                alert_filter = {**tenant_filter, "timestamp": {"$gte": since}}
            else:
                alert_filter = {"timestamp": {"$gte": since}}

        alerts = await Alert.find(alert_filter).limit(1000).to_list()
    except Exception as exc:
        log.warning("alert fetch failed for analytics: %s", exc)
        alerts = []

    alerts_by_day: dict[str, int] = {}
    for alert in alerts:
        try:
            ts = alert.timestamp
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            day = ts.strftime("%Y-%m-%d")
            alerts_by_day[day] = alerts_by_day.get(day, 0) + 1
        except Exception as exc:
            log.debug("alert timestamp parse failed: %s", exc)

    alerts_over_time = [{"date": k, "count": v} for k, v in sorted(alerts_by_day.items())]

    result = {
        "scans_over_time": scans_over_time,
        "findings_by_severity": findings_by_severity,
        "top_vulnerable_targets": [{"target": t, "findings": c} for t, c in top_targets],
        "scanner_success_rate": scanner_success_rate,
        "avg_scan_duration_seconds": avg_duration,
        "alerts_over_time": alerts_over_time,
        "range": range,
        "total_scans": len(scans),
        "total_alerts": len(alerts),
    }
    await cache_set(cache_key, result, ttl=TTL_STANDARD)
    return result
