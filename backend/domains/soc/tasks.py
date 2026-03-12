# ============================================================
# backend/domains/soc/tasks.py — Celery Background Tasks
# ============================================================
# Periodic task: poll Wazuh for new alerts, ingest, and analyse.
# ============================================================

import asyncio
from core.celery_app import celery


def _get_event_loop():
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop


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
    from domains.soc.mitre_attack import map_alert_to_attack
    from ai.llm_service import llm_service as gemini_service

    try:
        raw_alerts = await wazuh_client.get_alerts(limit=100)
    except Exception as e:
        print(f"[SOC Polling] Wazuh API error: {e}")
        return

    for raw in raw_alerts:
        # 1. Ingest
        alert = await ingest_wazuh_alert(raw)

        # 2. Apply MITRE ATT&CK mapping
        if not alert.mitre_techniques:
            try:
                await apply_mitre_mapping(alert)
            except Exception as e:
                print(f"[SOC Polling] MITRE mapping failed for alert {alert.wazuh_id}: {e}")

        # 3. Only run AI analysis on alerts that:
        #    - Haven't been analysed yet
        #    - Have rule_level >= 7 (medium+ severity in Wazuh)
        if alert.ai_verdict is None and alert.rule_level >= 7:
            try:
                # Build context for LLM
                agent_info = await wazuh_client.get_agent(alert.agent_id)
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
                await apply_ai_verdict(str(alert.id), verdict)

            except Exception as e:
                print(f"[SOC Polling] AI analysis failed for alert {alert.wazuh_id}: {e}")

        # 4. Run automated playbook for high-severity alerts with AI verdict
        if alert.ai_verdict == "TRUE_POSITIVE" and alert.ai_action == "ESCALATE":
            try:
                from domains.soc.playbook import playbook_engine
                pb_id = playbook_engine.find_matching_playbook(alert)
                if pb_id:
                    await playbook_engine.execute_playbook(alert, pb_id)
            except Exception as e:
                print(f"[SOC Polling] Playbook execution failed for alert {alert.wazuh_id}: {e}")

        # 5. Threat intel enrichment for high-severity alerts
        if alert.rule_level >= 10 and not alert.threat_intel:
            try:
                from domains.soc.threat_intel import threat_intel_service
                results = await threat_intel_service.enrich_alert(alert)
                if any(results.values()):
                    alert.threat_intel = results
                    await alert.save()
            except Exception as e:
                print(f"[SOC Polling] Threat intel failed for alert {alert.wazuh_id}: {e}")
