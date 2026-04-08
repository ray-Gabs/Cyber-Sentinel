# ============================================================
# backend/domains/soc/service.py — SOC Alert Business Logic
# ============================================================

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status

from domains.auth.models import User
from domains.soc.models import Alert, AiVerdict, CustomDetectionRule
from domains.soc.schemas import AnalystOverrideRequest, CustomRuleCreate, CustomRuleUpdate

log = logging.getLogger(__name__)


async def ingest_wazuh_alert(raw: dict) -> Alert:
    """
    Convert a raw Wazuh alert dict → our Alert document and save it.
    Called by the polling task or webhook handler.
    """
    # Check if we already ingested this alert
    wazuh_id = raw.get("id", raw.get("_id", ""))
    existing = await Alert.find_one({"wazuh_id": str(wazuh_id)})
    if existing:
        return existing  # Skip duplicates

    rule = raw.get("rule", {})
    agent = raw.get("agent", {})

    # Run custom rule matching
    from domains.soc.rule_matcher import match_alert
    all_rules = await CustomDetectionRule.find(
        CustomDetectionRule.enabled == True  # noqa: E712
    ).to_list()
    matched_rules = match_alert(raw, all_rules)

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
        full_log=raw.get("full_log", ""),
        data=raw.get("data"),
        matched_rules=matched_rules,
    )
    await alert.insert()

    # ── Targeted notification ──────────────────────────────────────────────
    # If this alert's agent_name matches a user's linked agent and it's
    # medium+ severity (Wazuh level >= 7), notify that student in real time.
    if alert.agent_name and alert.rule_level >= 7:
        try:
            owner = await User.find_one(User.wazuh_agent_name == alert.agent_name)
            if owner:
                from domains.notifications.service import create_notification
                notif_type = "soc_critical" if alert.rule_level >= 12 else "soc_alert"
                await create_notification(
                    user_id=str(owner.id),
                    type=notif_type,
                    title=f"[{alert.agent_name}] {alert.rule_description}",
                    body=f"Wazuh rule {alert.rule_id} · level {alert.rule_level} · {alert.full_log[:120]}",
                )
        except Exception as exc:
            log.warning("[SOC] Agent-owner notification failed for %s: %s", alert.wazuh_id, exc)

    return alert


# ── Custom Detection Rules CRUD ──────────────────────────────────────────────

def _validate_regex(pattern: str) -> None:
    """Raise ValueError if pattern is not a valid regex."""
    try:
        re.compile(pattern)
    except re.error as exc:
        raise ValueError(f"Invalid regex pattern: {exc}") from exc


async def get_rules(user_id: str) -> list[CustomDetectionRule]:
    """Return all custom rules for a user (includes system defaults)."""
    return await CustomDetectionRule.find(
        {"user_id": {"$in": [user_id, "system"]}}
    ).sort(-CustomDetectionRule.created_at).to_list()


async def create_rule(user_id: str, data: CustomRuleCreate) -> CustomDetectionRule:
    _validate_regex(data.pattern)
    rule = CustomDetectionRule(
        user_id=user_id,
        name=data.name,
        description=data.description,
        pattern=data.pattern,
        severity=data.severity,
        enabled=data.enabled,
    )
    await rule.insert()
    return rule


async def update_rule(rule_id: str, user_id: str, data: CustomRuleUpdate) -> CustomDetectionRule:
    from bson import ObjectId
    rule = await CustomDetectionRule.get(ObjectId(rule_id))
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.user_id not in (user_id, "system"):
        raise HTTPException(status_code=403, detail="Not authorized")
    if data.pattern is not None:
        _validate_regex(data.pattern)
    update_data = data.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(rule, field, value)
    await rule.save()
    return rule


async def delete_rule(rule_id: str, user_id: str) -> None:
    from bson import ObjectId
    rule = await CustomDetectionRule.get(ObjectId(rule_id))
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    if rule.user_id != user_id:
        raise HTTPException(status_code=403, detail="Cannot delete system default rules")
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


async def get_alert(alert_id: str) -> Alert:
    alert = await Alert.get(alert_id)
    if not alert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    return alert


async def list_alerts(
    page: int = 1,
    size: int = 50,
    rule_level_min: Optional[int] = None,
    ai_verdict: Optional[str] = None,
    agent_name: Optional[str] = None,
    current_user: Optional[User] = None,
) -> list[Alert]:
    """
    List alerts with optional filters, newest first.

    Scoping rules:
    - Admin role: sees ALL alerts (instructor / SOC analyst view).
    - Non-admin with a linked wazuh_agent_name: sees ONLY their agent's alerts.
    - Non-admin without a linked agent: sees all alerts (fallback — student hasn't linked yet).
    - The explicit agent_name filter param (from the request) always narrows further.
    """
    query: dict = {}

    # Agent-owner scoping for non-admin users
    if current_user and current_user.role != "admin" and current_user.wazuh_agent_name:
        query["agent_name"] = current_user.wazuh_agent_name

    if rule_level_min is not None:
        query["rule_level"] = {"$gte": rule_level_min}
    if ai_verdict:
        query["ai_verdict"] = ai_verdict
    # Explicit agent_name filter narrows on top of any scope already set
    if agent_name and "agent_name" not in query:
        query["agent_name"] = {"$regex": re.escape(agent_name), "$options": "i"}

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


async def override_verdict(alert_id: str, data: AnalystOverrideRequest) -> Alert:
    """
    Human analyst overrides the AI's classification.
    This feeds back into future prompts (few-shot learning).
    """
    alert = await get_alert(alert_id)
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


async def enrich_alert_threat_intel(alert_id: str) -> Alert:
    """Enrich an alert with VirusTotal + AbuseIPDB threat intelligence."""
    from domains.soc.threat_intel import threat_intel_service

    alert = await get_alert(alert_id)
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


async def get_alert_stats() -> dict:
    """Get aggregated alert statistics for the analytics dashboard."""
    total = await Alert.find().count()
    by_verdict = {
        "true_positive": await Alert.find({"ai_verdict": "TRUE_POSITIVE"}).count(),
        "false_positive": await Alert.find({"ai_verdict": "FALSE_POSITIVE"}).count(),
        "unknown": await Alert.find({"ai_verdict": "UNKNOWN"}).count(),
        "unanalysed": await Alert.find({"ai_verdict": None}).count(),
    }
    by_action = {
        "escalate": await Alert.find({"ai_action": "ESCALATE"}).count(),
        "monitor": await Alert.find({"ai_action": "MONITOR"}).count(),
        "dismiss": await Alert.find({"ai_action": "DISMISS"}).count(),
    }

    # Severity distribution (Wazuh levels grouped)
    by_severity = {
        "critical": await Alert.find({"rule_level": {"$gte": 12}}).count(),
        "high": await Alert.find({"rule_level": {"$gte": 8, "$lt": 12}}).count(),
        "medium": await Alert.find({"rule_level": {"$gte": 4, "$lt": 8}}).count(),
        "low": await Alert.find({"rule_level": {"$lt": 4}}).count(),
    }

    # Recent alerts (last 7 days) per day
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    daily_counts = []
    for days_ago in range(6, -1, -1):
        day_start = (now - timedelta(days=days_ago)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        count = await Alert.find({"timestamp": {"$gte": day_start, "$lt": day_end}}).count()
        daily_counts.append({"date": day_start.strftime("%Y-%m-%d"), "count": count})

    # Top rule IDs
    pipeline = [
        {"$group": {"_id": "$rule_id", "count": {"$sum": 1}, "desc": {"$first": "$rule_description"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_rules = await Alert.aggregate(pipeline).to_list()

    # Top agents
    agent_pipeline = [
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
    }
