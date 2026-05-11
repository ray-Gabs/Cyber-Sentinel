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
    rate_limit="6/m",  # Fix 6: 6 LLM calls/min max — stays within Groq free-tier TPM
)
def triage_single_alert(alert_id: str):
    """
    Full triage pipeline for a single alert.
    Fix 2: Redis SETNX guard prevents duplicate processing across workers.
    Fix 6: rate_limit="6/m" caps LLM calls (see decorator).
    """
    import redis as _sync_redis

    # Fix 2 — per-alert dedup: acquire a 5-minute lock before doing any work.
    # Covers both webhook + poll delivering the same alert, and K8s multi-replica SOC
    # workers picking up a duplicate task dispatch.
    _dedup_r = None
    try:
        _dedup_r = _sync_redis.from_url(settings.app_redis_url, socket_connect_timeout=2)
        acquired = _dedup_r.set(
            f"triage:lock:{alert_id}", "1", nx=True, px=300_000  # 5-min TTL
        )
        if not acquired:
            log.debug("triage:lock:%s already held — skipping duplicate", alert_id)
            return
    except Exception as exc:
        log.warning("Redis dedup check failed for %s: %s — proceeding anyway", alert_id, exc)
    finally:
        if _dedup_r:
            try:
                _dedup_r.close()
            except Exception:
                pass

    asyncio.run(_triage_async(alert_id))


async def _triage_async(alert_id: str):
    from core.database import init_db
    await init_db()
    from domains.soc.triage_pipeline import run_triage_pipeline
    await run_triage_pipeline(alert_id)


async def _push_triage_pending(alert_id: str) -> None:
    """Push alert_id into the sorted set for batch processing by drain_triage_queue."""
    import redis.asyncio as aioredis
    import time
    try:
        r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
        await r.zadd("soc:triage_pending", {alert_id: time.time()})
        await r.aclose()
    except Exception as exc:
        log.warning(
            "Failed to push %s to soc:triage_pending: %s — dispatching directly",
            alert_id, exc,
        )
        triage_single_alert.delay(alert_id)  # fallback: direct dispatch


@celery.task(
    name="domains.soc.tasks.drain_triage_queue",
    soft_time_limit=55,
    time_limit=60,
)
def drain_triage_queue():
    """
    Beat task (every 10s): pop up to 5 alert IDs from soc:triage_pending
    and run batch_retriage with concurrency=2.
    Replaces per-alert triage_single_alert.delay() calls from the poll task,
    naturally throttling LLM usage to stay within free-tier rate limits.
    """
    asyncio.run(_drain_async())


async def _drain_async():
    from core.database import init_db
    await init_db()

    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
    try:
        items = await r.zpopmin("soc:triage_pending", count=5)
        if not items:
            return
        alert_ids = [
            item[0].decode() if isinstance(item[0], bytes) else item[0]
            for item in items
        ]
        log.info("[SOC Drain] Processing batch of %d alerts", len(alert_ids))
        from domains.soc.triage_pipeline import batch_retriage
        await batch_retriage(alert_ids, concurrency=2)
    except Exception as exc:
        log.warning("[SOC Drain] Failed: %s", exc)
    finally:
        await r.aclose()


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
    import redis.asyncio as aioredis

    # Fix 1 — distributed lock: only one poll runs at a time.
    # TTL=55s covers the full 30s schedule + network buffer.
    _lock_r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
    try:
        acquired = await _lock_r.set(
            "lock:poll_wazuh_alerts", "1", nx=True, px=55_000
        )
        if not acquired:
            log.debug("[SOC Polling] Previous poll still running — skipping")
            return
    except Exception as exc:
        log.warning("[SOC Polling] Lock check failed: %s — proceeding anyway", exc)
    finally:
        await _lock_r.aclose()

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
        raw_alerts = await wazuh_client.get_alerts_paginated(max_alerts=500)
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

            # Fix 3 — batch triage: high-severity alerts bypass the queue for immediate
            # dispatch; everything else goes into the sorted set for drain_triage_queue.
            if alert.rule_level >= 12:
                triage_single_alert.delay(str(alert.id))
            else:
                await _push_triage_pending(str(alert.id))

        except Exception as e:
            log.warning("[SOC Polling] Failed to process alert: %s", e)
