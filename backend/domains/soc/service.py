# ============================================================
# backend/domains/soc/service.py — SOC Alert Business Logic
# ============================================================

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException, status

from domains.soc.models import Alert, AiVerdict
from domains.soc.schemas import AnalystOverrideRequest


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
    )
    await alert.insert()
    return alert


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
) -> list[Alert]:
    """List alerts with optional filters, newest first."""
    query: dict = {}
    if rule_level_min is not None:
        query["rule_level"] = {"$gte": rule_level_min}
    if ai_verdict:
        query["ai_verdict"] = ai_verdict
    if agent_name:
        query["agent_name"] = {"$regex": agent_name, "$options": "i"}

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
    latest = await AiVerdict.find_one(
        {"alert_id": str(alert.id)},
        sort=[("created_at", -1)],
    )
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
