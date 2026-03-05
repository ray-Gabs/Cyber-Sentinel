# ============================================================
# backend/domains/soc/service.py — SOC Alert Business Logic
# ============================================================

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status

from core.cache import cache_invalidate_analytics
from domains.auth.models import User
from domains.soc.models import Alert, AiVerdict, CustomDetectionRule
from domains.soc.schemas import AnalystOverrideRequest, CustomRuleCreate, CustomRuleUpdate

log = logging.getLogger(__name__)


async def ingest_wazuh_alert(
    raw: dict,
    tenant_id: Optional[str] = None,
) -> Alert:
    """
    Convert a raw Wazuh alert dict → our Alert document and save it.
    Called by the polling task or webhook handler.

    tenant_id is resolved from the per-user wazuh_token by the webhook endpoint.
    """
    # Check if we already ingested this alert
    wazuh_id = raw.get("id", raw.get("_id", ""))
    existing = await Alert.find_one({"wazuh_id": str(wazuh_id)})
    if existing:
        return existing  # Skip duplicates

    rule = raw.get("rule", {})
    agent = raw.get("agent", {})

    # Run custom rule matching — scope to global platform rules + this tenant's personal rules.
    # Loading ALL rules would fire User B's personal patterns against User A's alerts.
    from domains.soc.rule_matcher import match_alert
    rule_conditions: list[dict] = [{"user_id": "system", "enabled": True}]
    if tenant_id:
        rule_conditions.append({"user_id": tenant_id, "project_id": None, "enabled": True})

    # Also load project-scoped rules if the alert came from a known project agent
    cs_group = raw.get("_cs_group", "")
    if tenant_id and cs_group:
        from domains.soc.project_models import SocProject
        project = await SocProject.find_one(
            {
                "owner_id": tenant_id,
                "$or": [
                    {"wazuh_agent_name": cs_group},
                    {"wazuh_agent_id": cs_group},
                    {"slug": {"$regex": re.escape(cs_group), "$options": "i"}},
                ],
            }
        )
        if project:
            rule_conditions.append({
                "user_id": tenant_id,
                "project_id": str(project.id),
                "enabled": True,
            })

    all_rules = await CustomDetectionRule.find({"$or": rule_conditions}).to_list()
    matched_rules = match_alert(raw, all_rules)

    # full_log is absent for many Wazuh alert types (FIM, vuln, syscollector).
    # Fall back to a synthetic line built from location + top-level data fields.
    full_log: str = raw.get("full_log") or raw.get("message") or ""
    if not full_log:
        location = raw.get("location", "")
        data_dict = raw.get("data") or {}
        parts: list[str] = []
        if location:
            parts.append(location)
        parts.extend(
            f"{k}={v}"
            for k, v in data_dict.items()
            if isinstance(v, (str, int, float)) and str(v).strip()
        )
        full_log = "  ".join(parts[:12])

    # Extract MITRE ATT&CK directly from Wazuh's native rule.mitre field.
    # Wazuh tags its own rules with technique IDs, tactics, and names — use
    # these verbatim so the triage pipeline's static mapping becomes a fallback
    # only for alerts where Wazuh hasn't annotated MITRE data.
    from domains.soc.mitre_attack import extract_wazuh_mitre
    wazuh_mitre = extract_wazuh_mitre(raw)

    alert = Alert(
        wazuh_id=str(wazuh_id),
        timestamp=raw.get("timestamp", datetime.now(timezone.utc)),
        agent_id=str(agent.get("id", "")),
        agent_name=agent.get("name", ""),
        agent_ip=agent.get("ip", ""),
        rule_id=str(rule.get("id", "")),
        rule_description=rule.get("description", ""),
        rule_level=rule.get("level", 0),
        rule_groups=rule.get("groups", []),
        full_log=full_log,
        data=raw.get("data"),
        matched_rules=matched_rules,
        tenant_id=tenant_id,
        agent_group=raw.get("_cs_group", ""),
        mitre_techniques=wazuh_mitre,
        mitre_tactics=list({t["tactic"] for t in wazuh_mitre}) if wazuh_mitre else [],
    )
    await alert.insert()

    # Notification is sent post-triage (Stage 6 of triage_pipeline) with richer context.
    # New alert → analytics totals are stale
    await cache_invalidate_analytics()

    return alert


# ── Custom Detection Rules CRUD ──────────────────────────────────────────────

def _validate_regex(pattern: str) -> None:
    """Raise ValueError if pattern is not a valid regex or appears unsafe (ReDoS)."""
    from domains.soc.rule_matcher import _compile
    if _compile(pattern) is None:
        raise ValueError("Invalid or unsafe regex pattern — check syntax and avoid catastrophic backtracking")


async def get_rules(
    user_id: str,
    owned_project_ids: list[str] | None = None,
    is_admin: bool = False,
) -> list[CustomDetectionRule]:
    """
    Return detection rules visible to this user.

    Admin → all rules.
    Everyone else:
      - Global platform rules (user_id="system", project_id=None)
      - Their own personal rules (user_id=<uid>, project_id=None)
      - Rules tied to projects they own (project_id in owned_project_ids)
    """
    if is_admin:
        return await CustomDetectionRule.find().sort(-CustomDetectionRule.created_at).to_list()

    project_ids = owned_project_ids or []
    conditions: list[dict] = [
        {"user_id": "system", "project_id": None},
        {"user_id": user_id, "project_id": None},
    ]
    if project_ids:
        conditions.append(
            {"user_id": {"$in": ["system", user_id]}, "project_id": {"$in": project_ids}}
        )

    return await CustomDetectionRule.find(
        {"$or": conditions}
    ).sort(-CustomDetectionRule.created_at).to_list()


async def create_rule(user_id: str, data: CustomRuleCreate) -> CustomDetectionRule:
    _validate_regex(data.pattern)
    rule = CustomDetectionRule(
        user_id=user_id,
        project_id=data.project_id,
        name=data.name,
        description=data.description or "",
        pattern=data.pattern,
        severity=data.severity,
        enabled=data.enabled,
    )
    await rule.insert()
    return rule


async def update_rule(rule_id: str, user_id: str, data: CustomRuleUpdate, is_admin: bool = False) -> CustomDetectionRule:
    from bson import ObjectId
    rule = await CustomDetectionRule.get(ObjectId(rule_id))
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.user_id == "system" and not is_admin:
        raise HTTPException(status_code=403, detail="Platform rules cannot be modified")
    if rule.user_id != user_id and not is_admin:
        raise HTTPException(status_code=403, detail="Not authorized to edit this rule")
    if data.pattern is not None:
        _validate_regex(data.pattern)
    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    await rule.save()
    return rule


async def delete_rule(rule_id: str, user_id: str, is_admin: bool = False) -> None:
    from bson import ObjectId
    rule = await CustomDetectionRule.get(ObjectId(rule_id))
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.user_id != user_id and not (is_admin and rule.user_id == "system"):
        raise HTTPException(status_code=403, detail="Cannot delete this rule")
    await rule.delete()


async def delete_all_rules(user_id: str) -> int:
    """Delete all user-owned rules (not system defaults)."""
    rules = await CustomDetectionRule.find(
        CustomDetectionRule.user_id == user_id
    ).to_list()
    count = len(rules)
    for r in rules:
        await r.delete()
    return count


async def get_alert(alert_id: str, current_user: Optional[User] = None) -> Alert:
    alert = await Alert.get(alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    if current_user and current_user.role != "admin":
        user_id = str(current_user.id)
        authorized = alert.tenant_id == user_id
        if not authorized and current_user.wazuh_agent_name:
            authorized = alert.agent_name == current_user.wazuh_agent_name
        if not authorized:
            try:
                from domains.soc.project_models import SocProject
                user_projects = await SocProject.find(
                    SocProject.owner_id == user_id
                ).limit(100).to_list()
                agent_names = {p.wazuh_agent_name or p.slug for p in user_projects}
                authorized = bool(alert.agent_name and alert.agent_name in agent_names)
            except Exception:
                pass
        if not authorized:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Alert not found")
    return alert


async def list_alerts(
    page: int = 1,
    size: int = 50,
    rule_level_min: Optional[int] = None,
    ai_verdict: Optional[str] = None,
    agent_name: Optional[str] = None,
    agent_group: Optional[str] = None,
    project_id: Optional[str] = None,
    mitre_technique: Optional[str] = None,
    current_user: Optional[User] = None,
) -> list[Alert]:
    """
    List alerts with optional filters, newest first.

    Scoping rules:
    - Admin role: sees ALL alerts (instructor / SOC analyst view).
    - Non-admin with a wazuh_token: sees ONLY their tenant_id alerts (primary isolation).
    - Non-admin with only wazuh_agent_name: sees that agent's alerts (legacy binding).
    - Non-admin with wazuh_token OR wazuh_agent_name OR projects: tenant-scoped.
    - Non-admin with none of the above (demo/unconfigured): sees all platform alerts.
    - Explicit filter params always narrow further on top of tenant scope.
    """
    query: dict = {}

    if current_user and current_user.role != "admin":
        user_id = str(current_user.id)
        has_token = bool(getattr(current_user, "wazuh_token", None))
        has_agent = bool(current_user.wazuh_agent_name)

        conditions: list[dict] = []
        if has_token:
            conditions.append({"tenant_id": user_id})
        if has_agent:
            conditions.append({"agent_name": current_user.wazuh_agent_name})

        try:
            from domains.soc.project_models import SocProject
            user_projects = await SocProject.find(
                SocProject.owner_id == user_id
            ).limit(100).to_list()
            proj_agent_names = [p.wazuh_agent_name or p.slug for p in user_projects]
            if proj_agent_names:
                conditions.append({"agent_name": {"$in": proj_agent_names}})
        except Exception as exc:
            log.debug("Failed to fetch user projects for alert scoping: %s", exc)

        # Only apply tenant scope if the user has a Wazuh link configured.
        # Unconfigured (demo) accounts see all platform alerts, same as admin.
        if conditions:
            query = {"$or": conditions} if len(conditions) > 1 else conditions[0]

    if rule_level_min is not None:
        query["rule_level"] = {"$gte": rule_level_min}
    if ai_verdict:
        query["ai_verdict"] = ai_verdict
    if agent_name:
        query["agent_name"] = {"$regex": re.escape(agent_name), "$options": "i"}
    if agent_group:
        query["agent_group"] = {"$regex": re.escape(agent_group), "$options": "i"}
    if project_id:
        query["project_id"] = project_id
    if mitre_technique:
        query["mitre_techniques.technique"] = {"$regex": re.escape(mitre_technique), "$options": "i"}

    return (
        await Alert.find(query)
        .sort("-timestamp")
        .skip((page - 1) * size)
        .limit(size)
        .to_list()
    )


async def apply_ai_verdict(alert_id: str, verdict: dict) -> Alert:
    """
    Store the AI's verdict on an alert.
    Called after Gemini analysis in the polling task.
    """
    alert = await get_alert(alert_id)
    alert.ai_verdict = verdict.get("classification", "UNKNOWN")
    alert.ai_confidence = verdict.get("confidence", 0.0)
    alert.ai_reasoning = verdict.get("reasoning", "")
    alert.ai_action = verdict.get("action", "MONITOR")
    alert.analysed_at = datetime.now(timezone.utc)
    await alert.save()

    # Also record in the separate audit trail
    await AiVerdict(
        alert_id=str(alert.id),
        rule_id=alert.rule_id,
        verdict=alert.ai_verdict,
        confidence=alert.ai_confidence,
        reasoning=alert.ai_reasoning,
        action=alert.ai_action,
    ).insert()

    return alert


async def override_verdict(alert_id: str, data: AnalystOverrideRequest, current_user: Optional[User] = None) -> Alert:
    """
    Human analyst overrides the AI's classification.
    This feeds back into future prompts (few-shot learning).
    """
    alert = await get_alert(alert_id, current_user=current_user)
    alert.analyst_override = data.override
    alert.analyst_notes = data.notes
    await alert.save()

    # Update the AI verdict audit trail
    latest = await AiVerdict.find(
        {"alert_id": str(alert.id)}
    ).sort("-created_at").first_or_none()
    if latest:
        latest.analyst_agreed = (latest.verdict == data.override)
        await latest.save()

    return alert


async def enrich_alert_threat_intel(alert_id: str, current_user: Optional[User] = None) -> Alert:
    """Enrich an alert with VirusTotal + AbuseIPDB threat intelligence."""
    from domains.soc.threat_intel import threat_intel_service

    alert = await get_alert(alert_id, current_user=current_user)
    results = await threat_intel_service.enrich_alert(alert)
    alert.threat_intel = results
    await alert.save()
    return alert


async def apply_mitre_mapping(alert: Alert) -> Alert:
    """Apply MITRE ATT&CK mapping to an alert."""
    from domains.soc.mitre_attack import map_alert_to_attack

    techniques = map_alert_to_attack(alert)
    alert.mitre_techniques = techniques
    alert.mitre_tactics = list({t["tactic"] for t in techniques})
    await alert.save()
    return alert


async def get_alert_stats(
    project_id: Optional[str] = None,
    current_user: Optional[User] = None,
) -> dict:
    """
    Get aggregated alert statistics for the analytics dashboard.

    Args:
        project_id: If provided, restrict all counts to alerts tagged with
                    this project (e.g. a specific intern/class project scope).
        current_user: Scopes all counts to the user's tenant when non-admin,
                      using the same rules as list_alerts.
    """
    base: dict = {}
    if current_user and current_user.role != "admin":
        user_id = str(current_user.id)
        has_token = bool(getattr(current_user, "wazuh_token", None))
        has_agent = bool(current_user.wazuh_agent_name)

        conditions: list[dict] = []
        if has_token:
            conditions.append({"tenant_id": user_id})
        if has_agent:
            conditions.append({"agent_name": current_user.wazuh_agent_name})
        try:
            from domains.soc.project_models import SocProject
            user_projects = await SocProject.find(
                SocProject.owner_id == user_id
            ).limit(100).to_list()
            proj_agent_names = [p.wazuh_agent_name or p.slug for p in user_projects]
            if proj_agent_names:
                conditions.append({"agent_name": {"$in": proj_agent_names}})
        except Exception as exc:
            log.debug("Failed to fetch user projects for stats scoping: %s", exc)
        # Unconfigured (demo) accounts see all platform stats
        if conditions:
            base = {"$or": conditions} if len(conditions) > 1 else conditions[0]
    if project_id:
        base["project_id"] = project_id

    def _q(**extra: object) -> dict:
        return {**base, **extra}

    total = await Alert.find(base).count()
    by_verdict = {
        "TRUE_POSITIVE": await Alert.find(_q(ai_verdict="TRUE_POSITIVE")).count(),
        "FALSE_POSITIVE": await Alert.find(_q(ai_verdict="FALSE_POSITIVE")).count(),
        "UNKNOWN": await Alert.find(_q(ai_verdict="UNKNOWN")).count(),
        "UNANALYSED": await Alert.find(_q(ai_verdict=None)).count(),
    }
    by_action = {
        "ESCALATE": await Alert.find(_q(ai_action="ESCALATE")).count(),
        "MONITOR": await Alert.find(_q(ai_action="MONITOR")).count(),
        "DISMISS": await Alert.find(_q(ai_action="DISMISS")).count(),
    }

    # Severity distribution (Wazuh levels grouped)
    by_severity = {
        "critical": await Alert.find(_q(rule_level={"$gte": 12})).count(),
        "high": await Alert.find(_q(rule_level={"$gte": 8, "$lt": 12})).count(),
        "medium": await Alert.find(_q(rule_level={"$gte": 4, "$lt": 8})).count(),
        "low": await Alert.find(_q(rule_level={"$lt": 4})).count(),
    }

    # Recent alerts (last 7 days) per day
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    daily_counts = []
    for days_ago in range(6, -1, -1):
        day_start = (now - timedelta(days=days_ago)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = await Alert.find(_q(timestamp={"$gte": day_start, "$lt": day_end})).count()
        daily_counts.append({"date": day_start.strftime("%Y-%m-%d"), "count": count})

    # Top rule IDs
    match_stage = {"$match": base} if base else {"$match": {}}
    pipeline = [
        match_stage,
        {"$group": {"_id": "$rule_id", "count": {"$sum": 1}, "desc": {"$first": "$rule_description"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_rules = await Alert.aggregate(pipeline).to_list()

    # Top agents
    agent_pipeline = [
        match_stage,
        {"$group": {"_id": "$agent_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_agents = await Alert.aggregate(agent_pipeline).to_list()

    return {
        "total": total,
        "by_verdict": by_verdict,
        "by_action": by_action,
        "by_severity": by_severity,
        "daily_counts": daily_counts,
        "top_rules": top_rules,
        "top_agents": top_agents,
        "project_id": project_id,
    }
