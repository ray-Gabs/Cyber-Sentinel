# ============================================================
# backend/domains/soc/tasks.py — Celery Background Tasks
# ============================================================
# Periodic task: poll Wazuh for new alerts, ingest, and analyse.
# ============================================================

import asyncio
import json
import logging
from core.celery_app import celery
from core.config import settings

log = logging.getLogger(__name__)


async def _ws_publish(channel: str, payload: dict) -> None:
    """Publish a WebSocket event to Redis so the FastAPI relay can broadcast it."""
    import redis.asyncio as aioredis
    try:
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        await r.publish(f"ws:{channel}", json.dumps(payload))
        await r.aclose()
    except Exception as exc:
        log.warning("WS publish to Redis failed: %s", exc)


def _get_event_loop():
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop


@celery.task(
    name="domains.soc.tasks.triage_single_alert",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=3,
    soft_time_limit=120,
    time_limit=180,
)
def triage_single_alert(alert_id: str):
    """
    Triage a single alert:
      MITRE mapping → AI classify (severity, verdict, recommendations, IOCs) →
      playbook → threat intel → WebSocket notify.
    Called by the webhook endpoint after a new alert is ingested.
    """
    loop = _get_event_loop()
    loop.run_until_complete(_triage_async(alert_id))


async def _triage_async(alert_id: str):
    from core.database import init_db
    await init_db()

    from domains.soc.service import get_alert, apply_ai_verdict, apply_mitre_mapping
    from domains.soc.wazuh_client import wazuh_client
    from ai.llm_service import llm_service

    try:
        alert = await get_alert(alert_id)
    except Exception as e:
        log.warning("[SOC Triage] Alert %s not found: %s", alert_id, e)
        return

    # 1. MITRE ATT&CK mapping
    if not alert.mitre_techniques:
        try:
            alert = await apply_mitre_mapping(alert)
        except Exception as e:
            log.warning("[SOC Triage] MITRE mapping failed for alert %s: %s", alert.wazuh_id, e)

    # 2. AI analysis (v2 — severity_label, recommendations, IOCs, FP indicators)
    if alert.ai_verdict is None and alert.rule_level >= 4:
        try:
            agent_info = None
            if alert.agent_id:
                try:
                    agent_info = await wazuh_client.get_agent(alert.agent_id)
                except Exception:
                    pass
            context = {
                "agent_name": alert.agent_name,
                "agent_os": agent_info.get("os", {}).get("name", "unknown") if agent_info else "unknown",
                "mitre_techniques": alert.mitre_techniques,
            }
            verdict = await llm_service.analyse_alert(
                alert_dict={
                    "rule_id": alert.rule_id,
                    "rule_description": alert.rule_description,
                    "rule_level": alert.rule_level,
                    "rule_groups": alert.rule_groups,
                    "full_log": alert.full_log[:3000],
                    "data": alert.data,
                    "timestamp": str(alert.timestamp),
                },
                context=context,
                use_v2_prompt=True,
            )
            alert = await apply_ai_verdict(str(alert.id), verdict)

            # Persist v2 extended fields
            alert.severity_label = verdict.get("severity_label")
            alert.response_recommendations = verdict.get("response_recommendations") or []
            alert.false_positive_indicators = verdict.get("false_positive_indicators") or []
            alert.iocs = verdict.get("iocs")
            alert.triage_notes = verdict.get("triage_notes") or ""
            alert.triage_version = "v2"
            await alert.save()

        except Exception as e:
            log.warning("[SOC Triage] AI analysis failed for alert %s: %s", alert.wazuh_id, e)

    # Broadcast AI verdict to connected SOC dashboard clients
    await _ws_publish("alerts", {
        "type": "alert_triaged",
        "alert_id": str(alert.id),
        "wazuh_id": alert.wazuh_id,
        "rule_level": alert.rule_level,
        "severity_label": alert.severity_label,
        "ai_verdict": alert.ai_verdict,
        "ai_action": alert.ai_action,
        "ai_confidence": alert.ai_confidence,
    })

    # 3. Automated playbook for escalated true positives
    if alert.ai_verdict == "TRUE_POSITIVE" and alert.ai_action == "ESCALATE":
        try:
            from domains.soc.playbook import playbook_engine
            pb_id = playbook_engine.find_matching_playbook(alert)
            if pb_id:
                await playbook_engine.execute_playbook(alert, pb_id)
        except Exception as e:
            log.warning("[SOC Triage] Playbook failed for alert %s: %s", alert.wazuh_id, e)

    # 4. Threat intel enrichment for high-severity
    if alert.rule_level >= 10 and not alert.threat_intel:
        try:
            from domains.soc.threat_intel import threat_intel_service
            results = await threat_intel_service.enrich_alert(alert)
            if any(results.values()):
                alert.threat_intel = results
                await alert.save()
        except Exception as e:
            log.warning("[SOC Triage] Threat intel failed for alert %s: %s", alert.wazuh_id, e)


@celery.task(
    name="domains.soc.tasks.poll_wazuh_alerts",
    soft_time_limit=60,
    time_limit=90,
)
def poll_wazuh_alerts():
    """
    Periodic task (every 30 seconds via Celery Beat).
    1. Fetch latest alerts from Wazuh API
    2. Ingest new ones into MongoDB
    3. Run AI triage on new high-severity alerts
    """
    loop = _get_event_loop()
    loop.run_until_complete(_poll_async())


async def _poll_async():
    from core.database import init_db
    await init_db()

    from domains.soc.wazuh_client import wazuh_client
    from domains.soc.service import ingest_wazuh_alert, apply_ai_verdict, apply_mitre_mapping
    from ai.llm_service import llm_service

    try:
        raw_alerts = await wazuh_client.get_alerts(limit=100)
    except Exception as e:
        log.warning("[SOC Polling] Wazuh API error: %s", e)
        return

    for raw in raw_alerts:
        # 1. Ingest — skip bad entries silently
        try:
            alert = await ingest_wazuh_alert(raw)
        except Exception as e:
            log.warning("[SOC Polling] Failed to ingest alert: %s", e)
            continue

        # Notify connected clients of the new alert immediately
        await _ws_publish("alerts", {
            "type": "alert_new",
            "alert_id": str(alert.id),
            "wazuh_id": alert.wazuh_id,
            "rule_level": alert.rule_level,
            "rule_description": alert.rule_description,
            "agent_name": alert.agent_name,
            "timestamp": alert.timestamp.isoformat(),
        })

        # 2. Apply MITRE ATT&CK mapping
        if not alert.mitre_techniques:
            try:
                alert = await apply_mitre_mapping(alert)
            except Exception as e:
                log.warning("[SOC Polling] MITRE mapping failed for alert %s: %s", alert.wazuh_id, e)

        # 3. AI analysis — unanalysed alerts at level >= 4
        if alert.ai_verdict is None and alert.rule_level >= 4:
            try:
                agent_info = None
                if alert.agent_id:
                    try:
                        agent_info = await wazuh_client.get_agent(alert.agent_id)
                    except Exception as exc:
                        log.debug("agent lookup failed for %s: %s", alert.agent_id, exc)
                context = {
                    "agent_name": alert.agent_name,
                    "agent_os": agent_info.get("os", {}).get("name", "unknown") if agent_info else "unknown",
                    "mitre_techniques": alert.mitre_techniques,
                }

                verdict = await llm_service.analyse_alert(
                    alert_dict={
                        "rule_id": alert.rule_id,
                        "rule_description": alert.rule_description,
                        "rule_level": alert.rule_level,
                        "rule_groups": alert.rule_groups,
                        "full_log": alert.full_log[:3000],
                        "data": alert.data,
                        "timestamp": str(alert.timestamp),
                    },
                    context=context,
                    use_v2_prompt=True,
                )
                alert = await apply_ai_verdict(str(alert.id), verdict)

                # Persist v2 extended fields
                alert.severity_label = verdict.get("severity_label")
                alert.response_recommendations = verdict.get("response_recommendations") or []
                alert.false_positive_indicators = verdict.get("false_positive_indicators") or []
                alert.iocs = verdict.get("iocs")
                alert.triage_notes = verdict.get("triage_notes") or ""
                alert.triage_version = "v2"
                await alert.save()

                await _ws_publish("alerts", {
                    "type": "alert_triaged",
                    "alert_id": str(alert.id),
                    "wazuh_id": alert.wazuh_id,
                    "rule_level": alert.rule_level,
                    "severity_label": alert.severity_label,
                    "ai_verdict": alert.ai_verdict,
                    "ai_action": alert.ai_action,
                    "ai_confidence": alert.ai_confidence,
                })

            except Exception as e:
                log.warning("[SOC Polling] AI analysis failed for alert %s: %s", alert.wazuh_id, e)

        # 4. Automated playbook for escalated true positives
        if alert.ai_verdict == "TRUE_POSITIVE" and alert.ai_action == "ESCALATE":
            try:
                from domains.soc.playbook import playbook_engine
                pb_id = playbook_engine.find_matching_playbook(alert)
                if pb_id:
                    await playbook_engine.execute_playbook(alert, pb_id)
            except Exception as e:
                log.warning("[SOC Polling] Playbook execution failed for alert %s: %s", alert.wazuh_id, e)

        # 5. Threat intel enrichment for high-severity alerts
        if alert.rule_level >= 10 and not alert.threat_intel:
            try:
                from domains.soc.threat_intel import threat_intel_service
                results = await threat_intel_service.enrich_alert(alert)
                if any(results.values()):
                    alert.threat_intel = results
                    await alert.save()
            except Exception as e:
                log.warning("[SOC Polling] Threat intel failed for alert %s: %s", alert.wazuh_id, e)
