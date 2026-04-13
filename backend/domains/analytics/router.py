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
async def get_admin_stats(current_user: User = Depends(get_current_user)):
    """[Admin] Aggregated chart data: scans per day (7d) + alerts by severity."""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required")

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    # Scans per day — last 7 days (all users, admin view)
    recent_scans = await Scan.find(Scan.created_at >= seven_days_ago).to_list()
    scans_by_day: dict[str, int] = defaultdict(int)
    for scan in recent_scans:
        if scan.created_at:
            ts = scan.created_at
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            scans_by_day[ts.strftime("%m/%d")] += 1

    days_list = []
    for i in range(6, -1, -1):
        d = datetime.now(timezone.utc) - timedelta(days=i)
        label = d.strftime("%m/%d")
        days_list.append({"date": label, "count": scans_by_day.get(label, 0)})

    # Alerts by severity (all alerts, classified from rule_level)
    all_alerts = await Alert.find().to_list()
    sev_counts: dict[str, int] = {"critical": 0, "high": 0, "medium": 0, "low": 0, "informational": 0}
    for alert in all_alerts:
        key = _level_to_severity(alert.rule_level)
        sev_counts[key] += 1

    by_severity = [{"name": k, "count": v} for k, v in sev_counts.items()]

    return {
        "scans":  {"by_day": days_list},
        "alerts": {"by_severity": by_severity},
    }


@router.get("")
async def get_analytics(
    range: str = Query("30d", pattern="^(7d|30d|90d)$"),
    current_user: User = Depends(get_current_user),
):
    """
    Unified analytics endpoint combining pentest and SOC data.
    Query param: range = 7d | 30d | 90d (default 30d)
    """
    days = RANGE_DAYS.get(range, 30)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    user_id = str(current_user.id)

    # ── Pentest analytics ────────────────────────────────────
    scans = await Scan.find(
        Scan.user_id == user_id,
        Scan.created_at >= since,
    ).to_list()

    scans_by_day: dict[str, int] = {}
    findings_by_severity: dict[str, int] = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "Info": 0}
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
                sev = str(sev).capitalize() if sev else "Info"
                if sev not in findings_by_severity:
                    sev = "Info"
                findings_by_severity[sev] += 1

                # Target vulnerability counts
                target = getattr(scan, "target", None) or "unknown"
                target_counts[target] = target_counts.get(target, 0) + 1
            except Exception:
                pass

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
                except Exception:
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
        except Exception:
            pass

    avg_duration = round(sum(durations) / len(durations), 1) if durations else 0.0
    top_targets = sorted(target_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    scans_over_time = [{"date": k, "count": v} for k, v in sorted(scans_by_day.items())]

    # ── SOC analytics ────────────────────────────────────────
    try:
        alerts = await Alert.find(Alert.timestamp >= since).to_list()
    except Exception:
        alerts = []

    alerts_by_day: dict[str, int] = {}
    for alert in alerts:
        try:
            ts = alert.timestamp
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            day = ts.strftime("%Y-%m-%d")
            alerts_by_day[day] = alerts_by_day.get(day, 0) + 1
        except Exception:
            pass

    alerts_over_time = [{"date": k, "count": v} for k, v in sorted(alerts_by_day.items())]

    return {
        "scans_over_time": scans_over_time,
        "findings_by_severity": findings_by_severity,
        "top_vulnerable_targets": [{"target": t, "count": c} for t, c in top_targets],
        "scanner_success_rate": scanner_stats,
        "avg_scan_duration_seconds": avg_duration,
        "alerts_over_time": alerts_over_time,
        "range": range,
        "total_scans": len(scans),
        "total_alerts": len(alerts),
    }
