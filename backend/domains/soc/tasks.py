# ============================================================
# backend/domains/soc/tasks.py — Celery Background Tasks
# ============================================================
# Periodic task: poll Wazuh for new alerts, ingest, and analyse.
# ============================================================

import asyncio
import json
from datetime import datetime, timedelta, timezone

import structlog
from celery.signals import worker_process_init

from core.celery_app import celery
from core.config import settings

log = structlog.get_logger()

_db_initialized = False


@worker_process_init.connect
def _init_worker_db(**kwargs):
    """Initialize Beanie once per prefork child process at startup."""
    global _db_initialized
    if not _db_initialized:
        from core.database import init_db
        asyncio.run(init_db())
        _db_initialized = True


async def _ws_publish(channel: str, payload: dict) -> None:
    """Publish a WebSocket event to Redis so the FastAPI relay can broadcast it."""
    import redis.asyncio as aioredis
    try:
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        await r.publish(f"ws:{channel}", json.dumps(payload))
        await r.aclose()
    except Exception as exc:
        log.warning("WS publish to Redis failed", error=str(exc))


async def _log_task_failure(
    task_name: str, task_id: str, alert_id: str, error: str, traceback: str
) -> None:
    """Write a dead-letter record to MongoDB for audit and manual replay."""
    try:
        from core.database import init_db, get_database
        await init_db()
        db = get_database()
        await db["task_failures"].insert_one({
            "task_name": task_name,
            "task_id": task_id,
            "alert_id": alert_id,
            "error": error,
            "traceback": traceback,
            "failed_at": datetime.now(timezone.utc),
        })
    except Exception as exc:
        log.warning("Failed to write dead-letter record", alert_id=alert_id, error=str(exc))


class _TriageTask(celery.Task):
    """Custom task base that writes a dead-letter record on final failure."""

    def on_failure(self, exc, task_id, args, kwargs, einfo):
        alert_id = args[0] if args else kwargs.get("alert_id", "unknown")
        try:
            asyncio.run(_log_task_failure(
                task_name="triage_single_alert",
                task_id=str(task_id),
                alert_id=str(alert_id),
                error=str(exc),
                traceback=str(einfo),
            ))
        except Exception as e:
            log.warning("Dead-letter write failed", error=str(e))


@celery.task(
    base=_TriageTask,
    bind=True,
    name="domains.soc.tasks.triage_single_alert",
    autoretry_for=(ConnectionError, TimeoutError, OSError),
    retry_backoff=True,
    max_retries=3,
    soft_time_limit=120,
    time_limit=180,
    rate_limit="6/m",  # 6 LLM calls/min — stays within Groq free-tier TPM
)
def triage_single_alert(self, alert_id: str):
    """
    Full triage pipeline for a single alert.
    SETNX guard prevents duplicate processing across workers.
    Dead-letter written to task_failures collection on final failure.
    """
    task_log = log.bind(task_id=self.request.id, alert_id=alert_id, service="celery-soc")

    import redis as _sync_redis

    # Per-alert dedup: acquire a 5-minute lock before doing any work.
    _dedup_r = None
    try:
        _dedup_r = _sync_redis.from_url(settings.app_redis_url, socket_connect_timeout=2)
        acquired = _dedup_r.set(
            f"triage:lock:{alert_id}", "1", nx=True, px=300_000  # 5-min TTL
        )
        if not acquired:
            task_log.debug("triage lock already held — skipping duplicate")
            return
    except Exception as exc:
        task_log.warning("Redis dedup check failed — proceeding anyway", error=str(exc))
    finally:
        if _dedup_r:
            try:
                _dedup_r.close()
            except Exception:
                pass

    task_log.info("triage started")
    asyncio.run(_triage_async(alert_id))
    task_log.info("triage complete")


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
            "Failed to push to soc:triage_pending — dispatching directly",
            alert_id=alert_id, error=str(exc),
        )
        triage_single_alert.delay(alert_id)


@celery.task(
    name="domains.soc.tasks.drain_triage_queue",
    soft_time_limit=55,
    time_limit=60,
)
def drain_triage_queue():
    """
    Beat task (every 10s): pop up to 5 alert IDs from soc:triage_pending
    and run batch_retriage with concurrency=2.
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
        log.info("SOC drain processing batch", count=len(alert_ids), service="celery-soc")
        # Use run_triage_pipeline directly — not batch_retriage, which resets
        # existing verdicts. Freshly ingested alerts should be triaged for the
        # first time, not have their state wiped before pipeline runs.
        from domains.soc.triage_pipeline import run_triage_pipeline
        for i in range(0, len(alert_ids), 2):
            batch = alert_ids[i : i + 2]
            await asyncio.gather(
                *[run_triage_pipeline(aid) for aid in batch],
                return_exceptions=True,
            )
    except Exception as exc:
        log.warning("SOC drain failed", error=str(exc), service="celery-soc")
    finally:
        await r.aclose()


@celery.task(
    name="domains.soc.tasks.run_correlation_for_scan",
    soft_time_limit=120,
    time_limit=180,
)
def run_correlation_for_scan(scan_id: str):
    """Run the correlation engine for a specific scan (triggered on scan completion or alert ingestion)."""
    asyncio.run(_correlate_scan_async(scan_id))


async def _correlate_scan_async(scan_id: str):
    from core.database import init_db
    await init_db()
    from domains.correlation.service import run_correlation
    try:
        await run_correlation(scan_id)
        log.info("Correlation complete for scan", scan_id=scan_id, service="celery-soc")
    except Exception as exc:
        log.warning("Correlation failed for scan", scan_id=scan_id, error=str(exc), service="celery-soc")


@celery.task(
    name="domains.soc.tasks.weekly_alert_tuning",
    soft_time_limit=300,
    time_limit=360,
)
def weekly_alert_tuning(days: int = 7):
    """
    Weekly beat task: analyze alert patterns and generate tuning recommendations.
    Runs every Monday at 02:00 UTC via Celery Beat.
    """
    asyncio.run(_tuning_async(days))


async def _tuning_async(days: int):
    from core.database import init_db
    await init_db()
    from domains.soc.tuning import tuning_analyzer
    try:
        recs = await tuning_analyzer.analyze(days=days)
        log.info("Tuning analysis complete", recommendations=len(recs), days=days, service="celery-soc")
    except Exception as exc:
        log.warning("Tuning analysis failed", error=str(exc), days=days, service="celery-soc")


@celery.task(
    name="domains.soc.tasks.poll_wazuh_alerts",
    soft_time_limit=60,
    time_limit=90,
)
def poll_wazuh_alerts():
    """
    Periodic fallback task (every 30 seconds via Celery Beat).
    Fetches only new alerts since the last poll (cursor-based).
    Primary ingestion path is the webhook (wazuh_forwarder.py → POST /api/alerts/webhook).
    """
    asyncio.run(_poll_async())


async def _poll_async():
    import redis.asyncio as aioredis

    poll_log = log.bind(service="celery-soc", task="poll_wazuh_alerts")

    r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
    try:
        # Distributed lock: only one poll runs at a time (TTL=55s covers 30s schedule + buffer)
        try:
            acquired = await r.set("lock:poll_wazuh_alerts", "1", nx=True, px=55_000)
            if not acquired:
                poll_log.debug("previous poll still running — skipping")
                return
        except Exception as exc:
            poll_log.warning("lock check failed — proceeding anyway", error=str(exc))

        # Circuit breaker: back off after 3 consecutive Wazuh API failures
        fail_key = "soc:wazuh_failures"
        backoff_key = "soc:wazuh_backoff_until"
        try:
            failures = int(await r.get(fail_key) or 0)
            if failures >= 3:
                until_raw = await r.get(backoff_key)
                if until_raw:
                    until = datetime.fromisoformat(until_raw.decode())
                    if datetime.now(timezone.utc) < until:
                        poll_log.info("circuit open — skipping poll (Wazuh unreachable)")
                        return
        except Exception as exc:
            poll_log.warning("circuit breaker check failed", error=str(exc))

        from core.database import init_db
        await init_db()

        from domains.soc.wazuh_client import wazuh_client
        from domains.soc.service import ingest_wazuh_alert
        from domains.auth.models import User

        if not settings.wazuh_api_password:
            poll_log.debug("wazuh_api_password not set — skipping REST poll")
            return

        # Cursor-based fetch: only pull alerts newer than the last successful poll
        last_poll_key = "soc:last_poll_ts"
        try:
            raw = await r.get(last_poll_key)
            since = (
                datetime.fromisoformat(raw.decode())
                if raw
                else datetime.now(timezone.utc) - timedelta(minutes=5)
            )
        except Exception:
            since = datetime.now(timezone.utc) - timedelta(minutes=5)

        try:
            raw_alerts = await wazuh_client.get_alerts_since(since, limit=200, level_min=3)
            # Reset failure counter on success
            await r.delete(fail_key)
        except Exception as exc:
            poll_log.warning("Wazuh API error", error=str(exc))
            try:
                new_failures = await r.incr(fail_key)
                if new_failures >= 3:
                    until = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
                    await r.set(backoff_key, until, ex=300)
                    poll_log.warning(
                        "circuit breaker tripped — backing off 5 min",
                        failures=new_failures,
                    )
            except Exception:
                pass
            return

        # Build agent_group → tenant_id map
        group_to_tenant: dict[str, str] = {}
        try:
            async for u in User.find({"wazuh_agent_group": {"$ne": None, "$exists": True}}):
                if u.wazuh_agent_group:
                    group_to_tenant[u.wazuh_agent_group] = str(u.id)
        except Exception as exc:
            poll_log.warning("failed to build tenant map", error=str(exc))

        ingested = 0
        for raw in raw_alerts:
            try:
                agent_groups = raw.get("agent", {}).get("group", [])
                if isinstance(agent_groups, str):
                    agent_groups = [agent_groups]
                tenant_id = next(
                    (group_to_tenant[g] for g in agent_groups if g in group_to_tenant),
                    None,
                )
                alert = await ingest_wazuh_alert(raw, tenant_id=tenant_id)
                ingested += 1

                await _ws_publish("alerts", {
                    "type": "alert_new",
                    "alert_id": str(alert.id),
                    "wazuh_id": alert.wazuh_id,
                    "rule_level": alert.rule_level,
                    "rule_description": alert.rule_description,
                    "agent_name": alert.agent_name,
                    "timestamp": alert.timestamp.isoformat(),
                })

                if alert.rule_level >= 12:
                    triage_single_alert.delay(str(alert.id))
                else:
                    await _push_triage_pending(str(alert.id))

            except Exception as exc:
                poll_log.warning("failed to process alert", error=str(exc))

        if ingested:
            poll_log.info("poll complete", ingested=ingested)

        # Advance cursor to now so next poll only fetches new alerts
        await r.set(last_poll_key, datetime.now(timezone.utc).isoformat())

    finally:
        await r.aclose()
