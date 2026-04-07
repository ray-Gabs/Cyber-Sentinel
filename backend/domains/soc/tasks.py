# ============================================================
# backend/domains/soc/tasks.py — Celery Background Tasks
# ============================================================
# Periodic task: poll Wazuh for new alerts, ingest, and analyse.
# ============================================================

import asyncio
import logging
from core.celery_app import celery

log = logging.getLogger(__name__)


def _get_event_loop():
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop


@celery.task(name="domains.soc.tasks.triage_single_alert")
def triage_single_alert(alert_id: str):
    """
    Triage a single alert: MITRE mapping → AI analysis → playbook → threat intel.
    Called by the webhook endpoint after a new alert is ingested.
    """
    loop = _get_event_loop()
    loop.run_until_complete(_triage_async(alert_id))


async def _triage_async(alert_id: str):
    from core.database import init_db
    await init_db()

    from domains.soc.service import get_alert, apply_ai_verdict, apply_mitre_mapping
    from domains.soc.wazuh_client import wazuh_client
    from ai.llm_service import llm_service as gemini_service

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

    # 2. AI analysis for medium+ severity alerts
    if alert.ai_verdict is None and alert.rule_level >= 7:
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
            verdict = await gemini_service.analyse_alert(
                alert_dict={
                    "rule_id": alert.rule_id,
                    "rule_description": alert.rule_description,
                    "rule_level": alert.rule_level,
                    "rule_groups": alert.rule_groups,
                    "full_log": alert.full_log[:2000],
                    "data": alert.data,
                    "timestamp": str(alert.timestamp),
                },
                context=context,
            )
            alert = await apply_ai_verdict(str(alert.id), verdict)
        except Exception as e:
            log.warning("[SOC Triage] AI analysis failed for alert %s: %s", alert.wazuh_id, e)

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


@celery.task(name="domains.soc.tasks.poll_wazuh_alerts")
def poll_wazuh_alerts():
    """
    Periodic task (every 30 seconds via Celery Beat).
    1. Fetch latest alerts from Wazuh API
    2. Ingest new ones into MongoDB
    3. Run Gemini AI analysis on high-severity alerts
    """
    loop = _get_event_loop()
    loop.run_until_complete(_poll_async())


async def _poll_async():
    from core.database import init_db
    await init_db()

    from domains.soc.wazuh_client import wazuh_client
    from domains.soc.service import ingest_wazuh_alert, apply_ai_verdict, apply_mitre_mapping
    from ai.llm_service import llm_service as gemini_service

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

        # 2. Apply MITRE ATT&CK mapping
        if not alert.mitre_techniques:
            try:
                alert = await apply_mitre_mapping(alert)
            except Exception as e:
                log.warning("[SOC Polling] MITRE mapping failed for alert %s: %s", alert.wazuh_id, e)

        # 3. Only run AI analysis on alerts that:
        #    - Haven't been analysed yet
        #    - Have rule_level >= 7 (medium+ severity in Wazuh)
        if alert.ai_verdict is None and alert.rule_level >= 7:
            try:
                # Build context for LLM (agent lookup is best-effort)
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

                verdict = await gemini_service.analyse_alert(
                    alert_dict={
                        "rule_id": alert.rule_id,
                        "rule_description": alert.rule_description,
                        "rule_level": alert.rule_level,
                        "rule_groups": alert.rule_groups,
                        "full_log": alert.full_log[:2000],  # Truncate to save tokens
                        "data": alert.data,
                        "timestamp": str(alert.timestamp),
                    },
                    context=context,
                )
                # Capture return value so the updated ai_verdict is visible below
                alert = await apply_ai_verdict(str(alert.id), verdict)

            except Exception as e:
                log.warning("[SOC Polling] AI analysis failed for alert %s: %s", alert.wazuh_id, e)

        # 4. Run automated playbook for high-severity alerts with AI verdict
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
