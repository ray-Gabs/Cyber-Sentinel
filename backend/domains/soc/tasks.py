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
    Full triage pipeline for a single alert.
    Delegates to triage_pipeline.run_triage_pipeline:
      context build → MITRE mapping → LLM analysis → playbook → threat intel → notify.
    Called by the webhook endpoint and poll task after a new alert is ingested.
    """
    asyncio.run(_triage_async(alert_id))


async def _triage_async(alert_id: str):
    from core.database import init_db
    await init_db()
    from domains.soc.triage_pipeline import run_triage_pipeline
    await run_triage_pipeline(alert_id)


@celery.task(
    name="domains.soc.tasks.poll_wazuh_alerts",
    soft_time_limit=60,
    time_limit=90,
)
def poll_wazuh_alerts():
    """
    Periodic fallback task (every 30 seconds via Celery Beat).
    Fetches alerts directly from the Wazuh REST API when the forwarder is not in use.
    Primary ingestion path is the webhook (wazuh_forwarder.py → POST /api/alerts/webhook).
    """
    asyncio.run(_poll_async())


async def _poll_async():
    from core.database import init_db
    await init_db()

    from domains.soc.wazuh_client import wazuh_client
    from domains.soc.service import ingest_wazuh_alert
    from domains.auth.models import User

    # Skip gracefully when Wazuh REST API is not configured
    if not settings.wazuh_api_password:
        log.debug("[SOC Polling] wazuh_api_password not set — skipping REST poll")
        return

    try:
        raw_alerts = await wazuh_client.get_alerts(limit=100)
    except Exception as e:
        log.warning("[SOC Polling] Wazuh API error: %s", e)
        return

    # Build agent_group → tenant_id map from users who have wazuh_agent_group set.
    # This ensures polled alerts are scoped to the correct tenant rather than dumped into
    # the admin bucket (tenant_id=None).
    group_to_tenant: dict[str, str] = {}
    try:
        async for u in User.find({"wazuh_agent_group": {"$ne": None, "$exists": True}}):
            if u.wazuh_agent_group:
                group_to_tenant[u.wazuh_agent_group] = str(u.id)
    except Exception as e:
        log.warning("[SOC Polling] Failed to build tenant map: %s", e)

    for raw in raw_alerts:
        try:
            # Resolve tenant_id from the alert's Wazuh agent group
            agent_groups = raw.get("agent", {}).get("group", [])
            if isinstance(agent_groups, str):
                agent_groups = [agent_groups]
            tenant_id = next(
                (group_to_tenant[g] for g in agent_groups if g in group_to_tenant),
                None,
            )

            alert = await ingest_wazuh_alert(raw, tenant_id=tenant_id)

            await _ws_publish("alerts", {
                "type": "alert_new",
                "alert_id": str(alert.id),
                "wazuh_id": alert.wazuh_id,
                "rule_level": alert.rule_level,
                "rule_description": alert.rule_description,
                "agent_name": alert.agent_name,
                "timestamp": alert.timestamp.isoformat(),
            })

            # Dispatch the full triage pipeline as a non-blocking Celery task
            triage_single_alert.delay(str(alert.id))

        except Exception as e:
            log.warning("[SOC Polling] Failed to process alert: %s", e)
