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
