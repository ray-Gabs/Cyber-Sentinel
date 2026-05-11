# Celery Fixes + k3s Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three active Celery failures (triage pile-up, LLM 429s, scan hangs) with six targeted Python changes, then replace docker-compose.yml with hand-written k3s manifests scoped to the current Ubuntu VM (7.8 GB RAM, 4 CPU).

**Architecture:** Redis distributed locks prevent overlapping polls and duplicate triage dispatches. A batch-drain pattern replaces per-alert task explosion. Per-user Redis counters cap concurrent scans. All K8s workloads share a single backend image with overridden commands; Beat and forwarder run as singletons protected by PodDisruptionBudgets.

**Tech Stack:** Python 3.11, FastAPI, Celery 5, redis-py (sync + asyncio), Beanie/Motor, pytest, k3s (v1.28+), Traefik ingress (k3s built-in), kubectl

---

## File Map

### Modified
| File | What changes |
|---|---|
| `backend/core/config.py` | Add `app_redis_url` (DB 2) and `celery_result_url` (DB 1) |
| `backend/core/celery_app.py` | Separate result backend URL, add `drain_triage_queue` route + Beat entry |
| `backend/domains/soc/tasks.py` | Fix 1 (poll lock), Fix 2 (per-alert dedup), Fix 3 (batch drain), Fix 6 (rate_limit) |
| `backend/domains/soc/wazuh_client.py` | Fix 5: `get_alerts_paginated()` wrapper |
| `backend/domains/pentesting/router.py` | Fix 4: concurrent scan check + INCR |
| `backend/domains/pentesting/tasks.py` | Fix 4: DECR on scan completion/failure |

### Created (tests)
| File | Tests |
|---|---|
| `backend/tests/__init__.py` | Empty marker |
| `backend/tests/soc/__init__.py` | Empty marker |
| `backend/tests/soc/test_triage_dedup.py` | Poll lock, per-alert dedup, drain queue |
| `backend/tests/pentesting/__init__.py` | Empty marker |
| `backend/tests/pentesting/test_scan_limit.py` | Concurrent scan limit enforcement |

### Created (K8s manifests)
```
k8s/
├── namespace.yaml
├── configmap.yaml
├── secret.yaml
├── statefulsets/
│   ├── mongodb.yaml
│   └── redis.yaml
├── deployments/
│   ├── backend.yaml
│   ├── frontend.yaml
│   ├── celery-scan.yaml
│   ├── celery-soc.yaml
│   ├── celery-report.yaml
│   ├── celery-beat.yaml
│   ├── forwarder.yaml
│   └── zap.yaml
├── services/
│   ├── backend-svc.yaml
│   ├── frontend-svc.yaml
│   ├── mongodb-svc.yaml
│   ├── redis-svc.yaml
│   └── zap-svc.yaml
├── ingress/
│   └── ingress.yaml
├── pdb/
│   ├── celery-beat-pdb.yaml
│   └── forwarder-pdb.yaml
└── README.md
```

---

## STEP 0 — Prerequisite: Disk Cleanup (manual, on VM)

Run these on the Ubuntu VM before anything else. They reclaim ~10–12 GB from unused Docker image layers. Named volumes (`cyber-sentinel_mongo_data` etc.) are NOT touched.

```bash
docker image prune -a          # removes images not used by any running container
docker volume prune            # removes anonymous (hex-named) volumes only
docker builder prune           # removes build cache
df -h /                        # verify ≥ 15 GB free before proceeding
```

---

## Task 1 — Config: add `app_redis_url` and `celery_result_url`

**Files:**
- Modify: `backend/core/config.py` (after line 41, the `redis_url` field)

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/soc/test_triage_dedup.py
from core.config import settings

def test_app_redis_url_is_db2():
    assert settings.app_redis_url.endswith("/2"), (
        f"app_redis_url must target DB 2, got: {settings.app_redis_url}"
    )

def test_celery_result_url_is_db1():
    assert settings.celery_result_url.endswith("/1"), (
        f"celery_result_url must target DB 1, got: {settings.celery_result_url}"
    )
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd backend && python -m pytest tests/soc/test_triage_dedup.py::test_app_redis_url_is_db2 tests/soc/test_triage_dedup.py::test_celery_result_url_is_db1 -v
```
Expected: `AttributeError: 'Settings' object has no attribute 'app_redis_url'`

- [ ] **Step 3: Add fields to `backend/core/config.py`**

Insert after line 41 (after `redis_url`):

```python
    # Celery result backend — DB 1 (separate from broker DB 0 to allow independent flush)
    celery_result_url: str = "redis://localhost:6379/1"

    # App-level Redis: locks, WS pub/sub, rate limiting, triage sorted set — DB 2
    app_redis_url: str = "redis://localhost:6379/2"
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
cd backend && python -m pytest tests/soc/test_triage_dedup.py::test_app_redis_url_is_db2 tests/soc/test_triage_dedup.py::test_celery_result_url_is_db1 -v
```
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/core/config.py backend/tests/
git commit -m "feat(config): add app_redis_url (DB 2) and celery_result_url (DB 1)"
```

---

## Task 2 — Celery app: separate result backend + drain task routing

**Files:**
- Modify: `backend/core/celery_app.py`

- [ ] **Step 1: Update celery init, task_routes, and beat_schedule**

Replace the `celery = Celery(...)` block and the two `celery.conf` calls in `backend/core/celery_app.py`:

```python
celery = Celery(
    "cyber_sentinel",
    broker=settings.redis_url,          # DB 0 — broker
    backend=settings.celery_result_url, # DB 1 — result backend (separated)
)
```

In `celery.conf.task_routes`, add the drain task:

```python
celery.conf.task_routes = {
    "domains.soc.tasks.poll_wazuh_alerts":     {"queue": "soc"},
    "domains.soc.tasks.triage_single_alert":   {"queue": "soc"},
    "domains.soc.tasks.drain_triage_queue":    {"queue": "soc"},
}
```

In `celery.conf.beat_schedule`, add the drain schedule:

```python
celery.conf.beat_schedule = {
    "poll-wazuh-alerts": {
        "task": "domains.soc.tasks.poll_wazuh_alerts",
        "schedule": 30.0,
        "options": {"expires": 25},
    },
    "drain-triage-queue": {
        "task": "domains.soc.tasks.drain_triage_queue",
        "schedule": 10.0,          # every 10 seconds
        "options": {"expires": 8}, # discard if worker is busy
    },
}
```

- [ ] **Step 2: Verify import is clean**

```bash
cd backend && python -c "from core.celery_app import celery; print('OK', celery.backend)"
```
Expected: `OK redis://localhost:6379/1`

- [ ] **Step 3: Commit**

```bash
git add backend/core/celery_app.py
git commit -m "feat(celery): separate result backend to DB 1, add drain_triage_queue beat entry"
```

---

## Task 3 — Fix 1: Redis poll lock + Fix 6: rate_limit on triage

**Files:**
- Modify: `backend/domains/soc/tasks.py`

- [ ] **Step 1: Write failing test for poll lock**

Add to `backend/tests/soc/test_triage_dedup.py`:

```python
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

def test_poll_skips_when_lock_held():
    """Second poll call returns immediately when lock is already acquired."""
    import importlib
    import domains.soc.tasks as soc_tasks

    mock_redis = AsyncMock()
    # First call: lock not held (returns True), second call: lock held (returns None)
    mock_redis.set = AsyncMock(return_value=None)  # simulate lock already held
    mock_redis.aclose = AsyncMock()

    with patch("domains.soc.tasks.settings") as mock_settings:
        mock_settings.redis_url = "redis://localhost:6379/0"
        mock_settings.wazuh_api_password = ""
        with patch("redis.asyncio.from_url", return_value=mock_redis):
            asyncio.run(soc_tasks._poll_async())

    # wazuh_api_password is empty so it would return early anyway,
    # but the lock check runs first — verify set was called with NX=True
    mock_redis.set.assert_called_once()
    call_kwargs = mock_redis.set.call_args
    assert call_kwargs.kwargs.get("nx") is True or call_args[1].get("nx") is True
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd backend && python -m pytest tests/soc/test_triage_dedup.py::test_poll_skips_when_lock_held -v
```
Expected: `FAILED` (no lock code exists yet)

- [ ] **Step 3: Add poll lock at start of `_poll_async` in `backend/domains/soc/tasks.py`**

Replace the opening lines of `_poll_async` (after `async def _poll_async():`):

```python
async def _poll_async():
    from core.database import init_db
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

    await init_db()
    # ... rest of existing _poll_async body unchanged below this point
```

- [ ] **Step 4: Add `rate_limit="6/m"` to `triage_single_alert` decorator**

In `backend/domains/soc/tasks.py`, update the `@celery.task` decorator for `triage_single_alert`:

```python
@celery.task(
    name="domains.soc.tasks.triage_single_alert",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=3,
    soft_time_limit=120,
    time_limit=180,
    rate_limit="6/m",   # Fix 6: 6 LLM calls/min max — stays within Groq free-tier TPM
)
def triage_single_alert(alert_id: str):
```

- [ ] **Step 5: Run test — confirm it passes**

```bash
cd backend && python -m pytest tests/soc/test_triage_dedup.py::test_poll_skips_when_lock_held -v
```
Expected: `1 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/domains/soc/tasks.py
git commit -m "fix(soc): add Redis poll lock (Fix 1) and rate_limit 6/m on triage task (Fix 6)"
```

---

## Task 4 — Fix 2: per-alert Redis dedup in `triage_single_alert`

**Files:**
- Modify: `backend/domains/soc/tasks.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/soc/test_triage_dedup.py`:

```python
def test_triage_skips_duplicate_alert():
    """triage_single_alert returns immediately when alert lock is already held."""
    import redis as sync_redis
    from unittest.mock import patch, MagicMock

    mock_r = MagicMock()
    mock_r.set.return_value = None  # lock already held — SETNX returns None/False

    with patch("redis.from_url", return_value=mock_r):
        with patch("asyncio.run") as mock_run:
            from domains.soc.tasks import triage_single_alert
            # Call the underlying function (bypass Celery task wrapper)
            triage_single_alert.__wrapped__("fake-alert-id-123")
            mock_run.assert_not_called()  # asyncio.run must NOT be called
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd backend && python -m pytest tests/soc/test_triage_dedup.py::test_triage_skips_duplicate_alert -v
```
Expected: `FAILED` (asyncio.run is called because no dedup exists)

- [ ] **Step 3: Add Redis SETNX guard to `triage_single_alert`**

In `backend/domains/soc/tasks.py`, replace the body of `triage_single_alert`:

```python
def triage_single_alert(alert_id: str):
    """
    Full triage pipeline for a single alert.
    Fix 2: Redis SETNX guard prevents duplicate processing across workers.
    Fix 6: rate_limit="6/m" caps LLM calls (see decorator).
    """
    import redis as _sync_redis

    # Fix 2 — per-alert dedup: acquire a 5-minute lock before doing any work.
    # Covers both webhook + poll delivering the same alert, and K8s multi-replica SOC workers
    # picking up a duplicate task dispatch.
    _dedup_r = None
    try:
        _dedup_r = _sync_redis.from_url(settings.app_redis_url, socket_connect_timeout=2)
        acquired = _dedup_r.set(
            f"triage:lock:{alert_id}", "1", nx=True, px=300_000  # 5 min TTL
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
```

- [ ] **Step 4: Run test — confirm it passes**

```bash
cd backend && python -m pytest tests/soc/test_triage_dedup.py::test_triage_skips_duplicate_alert -v
```
Expected: `1 passed`

- [ ] **Step 5: Commit**

```bash
git add backend/domains/soc/tasks.py
git commit -m "fix(soc): add per-alert Redis SETNX dedup to triage_single_alert (Fix 2)"
```

---

## Task 5 — Fix 3: batch triage drain task

**Files:**
- Modify: `backend/domains/soc/tasks.py`

- [ ] **Step 1: Write failing test**

Add to `backend/tests/soc/test_triage_dedup.py`:

```python
def test_drain_pops_from_sorted_set():
    """drain_triage_queue pops alert IDs from soc:triage_pending and calls batch_retriage."""
    import asyncio
    from unittest.mock import AsyncMock, patch, MagicMock

    mock_redis = AsyncMock()
    # Simulate 3 alerts in the sorted set: (member, score) tuples
    mock_redis.zpopmin = AsyncMock(return_value=[
        (b"alert-id-1", 1000.0),
        (b"alert-id-2", 1001.0),
        (b"alert-id-3", 1002.0),
    ])
    mock_redis.aclose = AsyncMock()

    captured_ids = []

    async def fake_batch_retriage(alert_ids, concurrency=2):
        captured_ids.extend(alert_ids)
        return []

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        with patch("domains.soc.triage_pipeline.batch_retriage", side_effect=fake_batch_retriage):
            with patch("core.database.init_db", new_callable=AsyncMock):
                from domains.soc import tasks as soc_tasks
                asyncio.run(soc_tasks._drain_async())

    assert captured_ids == ["alert-id-1", "alert-id-2", "alert-id-3"]
    mock_redis.zpopmin.assert_called_once_with("soc:triage_pending", count=5)
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd backend && python -m pytest tests/soc/test_triage_dedup.py::test_drain_pops_from_sorted_set -v
```
Expected: `FAILED` (`_drain_async` does not exist yet)

- [ ] **Step 3: Add `_push_triage_pending`, `drain_triage_queue`, and `_drain_async` to `backend/domains/soc/tasks.py`**

Add these three functions after the existing `_triage_async` function:

```python
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
    This replaces per-alert triage_single_alert.delay() calls from the poll task,
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
```

- [ ] **Step 4: Replace `triage_single_alert.delay(str(alert.id))` in `_poll_async`**

In `_poll_async`, find the line that reads:
```python
triage_single_alert.delay(str(alert.id))
```

Replace it with:
```python
# Fix 3 — batch triage: high-severity alerts bypass the queue for immediate dispatch;
# everything else goes into the sorted set for drain_triage_queue to process.
if alert.rule_level >= 12:
    triage_single_alert.delay(str(alert.id))
else:
    await _push_triage_pending(str(alert.id))
```

- [ ] **Step 5: Run all soc tests**

```bash
cd backend && python -m pytest tests/soc/ -v
```
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add backend/domains/soc/tasks.py
git commit -m "fix(soc): batch triage drain replaces per-alert dispatch, add _push_triage_pending (Fix 3)"
```

---

## Task 6 — Fix 5: Wazuh alert pagination

**Files:**
- Modify: `backend/domains/soc/wazuh_client.py`
- Modify: `backend/domains/soc/tasks.py` (call site)

- [ ] **Step 1: Write failing test**

Create `backend/tests/soc/test_wazuh_pagination.py`:

```python
import asyncio
from unittest.mock import AsyncMock, patch

def test_get_alerts_paginated_fetches_multiple_pages():
    """get_alerts_paginated loops until max_alerts reached or empty page returned."""
    from domains.soc.wazuh_client import WazuhClient

    # Simulate: page 1 returns 100, page 2 returns 80 (total 180, stops)
    call_count = 0
    async def fake_get_alerts(limit=100, offset=0, **kwargs):
        nonlocal call_count
        call_count += 1
        if offset == 0:
            return [{"id": str(i)} for i in range(100)]
        elif offset == 100:
            return [{"id": str(i)} for i in range(100, 180)]
        return []

    client = WazuhClient.__new__(WazuhClient)
    with patch.object(client, "get_alerts", side_effect=fake_get_alerts):
        result = asyncio.run(client.get_alerts_paginated(max_alerts=500))

    assert len(result) == 180
    assert call_count == 3  # page 1 (100), page 2 (80), page 3 (0 — stops)
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd backend && python -m pytest tests/soc/test_wazuh_pagination.py -v
```
Expected: `FAILED` (`get_alerts_paginated` does not exist)

- [ ] **Step 3: Add `get_alerts_paginated` to `backend/domains/soc/wazuh_client.py`**

Add after the existing `get_alerts_since` method:

```python
    async def get_alerts_paginated(
        self,
        max_alerts: int = 500,
        batch_size: int = 100,
        **kwargs,
    ) -> list[dict]:
        """
        Fetch up to max_alerts from Wazuh using offset-based pagination.
        Stops early when a page returns fewer items than batch_size.
        Accepts the same keyword args as get_alerts (level_min, level_max, q).
        """
        results: list[dict] = []
        offset = 0
        while len(results) < max_alerts:
            fetch = min(batch_size, max_alerts - len(results))
            chunk = await self.get_alerts(limit=fetch, offset=offset, **kwargs)
            if not chunk:
                break
            results.extend(chunk)
            if len(chunk) < fetch:
                break  # last page — no more data
            offset += len(chunk)
        return results
```

- [ ] **Step 4: Update call site in `_poll_async` (`backend/domains/soc/tasks.py`)**

Find:
```python
raw_alerts = await wazuh_client.get_alerts(limit=100)
```
Replace with:
```python
raw_alerts = await wazuh_client.get_alerts_paginated(max_alerts=500)
```

- [ ] **Step 5: Run tests**

```bash
cd backend && python -m pytest tests/soc/test_wazuh_pagination.py -v
```
Expected: `1 passed`

- [ ] **Step 6: Commit**

```bash
git add backend/domains/soc/wazuh_client.py backend/domains/soc/tasks.py
git commit -m "fix(soc): add get_alerts_paginated (max 500/poll) replacing hardcoded limit=100 (Fix 5)"
```

---

## Task 7 — Fix 4: per-user concurrent scan limit

**Files:**
- Modify: `backend/domains/pentesting/router.py`
- Modify: `backend/domains/pentesting/tasks.py`

- [ ] **Step 1: Write failing test**

Create `backend/tests/pentesting/test_scan_limit.py`:

```python
import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi import HTTPException

def test_concurrent_scan_limit_blocks_when_full():
    """_check_concurrent_scans raises 429 when user already has max concurrent scans."""
    from domains.pentesting.router import _check_concurrent_scans

    mock_user = MagicMock()
    mock_user.id = "user-123"

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=b"3")  # 3 active — at limit
    mock_redis.aclose = AsyncMock()

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        with patch("domains.pentesting.router.settings") as mock_settings:
            mock_settings.app_redis_url = "redis://localhost:6379/2"
            mock_settings.max_concurrent_scans_per_user = 3
            with pytest.raises(HTTPException) as exc_info:
                asyncio.run(_check_concurrent_scans(mock_user))

    assert exc_info.value.status_code == 429

def test_concurrent_scan_limit_allows_when_under():
    """_check_concurrent_scans does not raise when user is under the limit."""
    from domains.pentesting.router import _check_concurrent_scans

    mock_user = MagicMock()
    mock_user.id = "user-123"

    mock_redis = AsyncMock()
    mock_redis.get = AsyncMock(return_value=b"1")  # 1 active — under limit
    mock_redis.aclose = AsyncMock()

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        with patch("domains.pentesting.router.settings") as mock_settings:
            mock_settings.app_redis_url = "redis://localhost:6379/2"
            mock_settings.max_concurrent_scans_per_user = 3
            # Should not raise
            asyncio.run(_check_concurrent_scans(mock_user))
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd backend && python -m pytest tests/pentesting/test_scan_limit.py -v
```
Expected: `FAILED` (`_check_concurrent_scans` does not exist)

- [ ] **Step 3: Add `_check_concurrent_scans` and `_increment_active_scans` to `backend/domains/pentesting/router.py`**

First, add a logger at the top of `backend/domains/pentesting/router.py` (after the existing imports):

```python
import logging
log = logging.getLogger(__name__)
```

Then add these two functions after the existing `_check_rate_limit` function (around line 52):

```python
async def _check_concurrent_scans(user: User) -> None:
    """
    Fix 4 — Enforce settings.max_concurrent_scans_per_user using a Redis counter.
    Counter key: scan:active:{user_id}  — incremented on scan create, decremented on finish.
    """
    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
    try:
        key = f"scan:active:{user.id}"
        raw = await r.get(key)
        active = int(raw or 0)
        if active >= settings.max_concurrent_scans_per_user:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"You already have {active} scan(s) running. "
                    f"Max {settings.max_concurrent_scans_per_user} concurrent scans per user. "
                    "Wait for a scan to complete before starting another."
                ),
            )
    finally:
        await r.aclose()


async def _increment_active_scans(user_id: str) -> None:
    """Atomically increment the active scan counter for user_id."""
    import redis.asyncio as aioredis

    r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
    try:
        key = f"scan:active:{user_id}"
        await r.incr(key)
        await r.expire(key, 5 * 3600)  # 5-hour safety TTL — clears stale counters
    except Exception as exc:
        log.warning("Failed to increment scan:active for %s: %s", user_id, exc)
    finally:
        await r.aclose()
```

- [ ] **Step 4: Call both in `create_scan` endpoint in `backend/domains/pentesting/router.py`**

In `create_scan`, after the existing `await _check_rate_limit(user)` call (line ~68), add:

```python
    await _check_rate_limit(user)
    await _check_concurrent_scans(user)   # Fix 4: concurrent limit
    scan = await service.create_scan(data, user)
    await _increment_active_scans(str(user.id))  # Fix 4: track active count
```

- [ ] **Step 5: Add `_decrement_active_scans` to `backend/domains/pentesting/tasks.py`**

Add this helper after the existing `_ws_publish` function:

```python
async def _decrement_active_scans(user_id: str) -> None:
    """Fix 4: decrement the Redis scan:active counter when a scan reaches a terminal state."""
    import redis.asyncio as aioredis
    try:
        r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
        key = f"scan:active:{user_id}"
        val = await r.decr(key)
        if val < 0:
            await r.set(key, "0")  # clamp — never go negative
        await r.aclose()
    except Exception as exc:
        log.warning("Failed to decrement scan:active for %s: %s", user_id, exc)
```

- [ ] **Step 6: Call `_decrement_active_scans` at every terminal state in `_run_scan_async`**

In `backend/domains/pentesting/tasks.py`, wrap the final `scan.status = "completed"` block in a try/finally:

```python
    try:
        # Mark completed
        scan.status = "completed"
        scan.progress = 100
        scan.current_stage = None
        scan.completed_at = datetime.now(timezone.utc)
        await scan.save()
        await _ws_publish(...)
        # ... notification + email blocks (unchanged)
    finally:
        await _decrement_active_scans(str(scan.user_id))
```

Also call it in `_timeout_scan` before returning:

```python
async def _timeout_scan(scan_id: str):
    from core.database import init_db
    await init_db()
    from domains.pentesting.models import Scan
    scan = await Scan.get(scan_id)
    if scan and scan.status == "running":
        scan.status = "failed"
        scan.error_message = "Scan timed out (exceeded 1 hour limit)"
        scan.completed_at = datetime.now(timezone.utc)
        await scan.save()
        await _ws_publish(f"user:{scan.user_id}", {...})
        await _decrement_active_scans(str(scan.user_id))   # Fix 4
```

- [ ] **Step 7: Run all tests**

```bash
cd backend && python -m pytest tests/ -v
```
Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add backend/domains/pentesting/router.py backend/domains/pentesting/tasks.py
git commit -m "fix(pentesting): enforce max_concurrent_scans_per_user via Redis counter (Fix 4)"
```

---

## Task 8 — Build and import images into k3s

Run these on the Ubuntu VM after k3s is installed.

**k3s install (if not yet done):**
```bash
curl -sfL https://get.k3s.io | sh -
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
kubectl get nodes   # should show Ready
```

**Build and import images:**
```bash
# From the project root on the VM
docker build -t cyber-sentinel/backend:latest ./backend
docker build -t cyber-sentinel/frontend:latest ./frontend

# Import to k3s containerd (bypasses registry entirely)
docker save cyber-sentinel/backend:latest | sudo k3s ctr images import -
docker save cyber-sentinel/frontend:latest | sudo k3s ctr images import -

# Verify
sudo k3s ctr images list | grep cyber-sentinel
```
Expected: both images listed.

**Data migration (MongoDB):**
```bash
# Dump from Docker container while docker-compose is still up
docker exec cyber-sentinel-mongo mongodump --out /tmp/mongodump
docker cp cyber-sentinel-mongo:/tmp/mongodump ./mongodump-backup

# After k3s MongoDB pod is running (Task 9), restore:
kubectl cp ./mongodump-backup cyber-sentinel/mongodb-0:/tmp/mongodump
kubectl exec -n cyber-sentinel mongodb-0 -- mongorestore /tmp/mongodump
```

- [ ] **Step 1: Run k3s install + verify**
- [ ] **Step 2: Build and import both images**
- [ ] **Step 3: Take MongoDB dump while Docker Compose is still running**
- [ ] **Step 4: Commit** (no files changed — commit the mongodump note to README)

```bash
git commit --allow-empty -m "chore: k3s installed and images imported to containerd"
```

---

## Task 9 — K8s: namespace, ConfigMap, Secret, StatefulSets, Services

**Files:**
- Create: `k8s/namespace.yaml`
- Create: `k8s/configmap.yaml`
- Create: `k8s/secret.yaml`
- Create: `k8s/statefulsets/mongodb.yaml`
- Create: `k8s/statefulsets/redis.yaml`
- Create: `k8s/services/mongodb-svc.yaml`
- Create: `k8s/services/redis-svc.yaml`

- [ ] **Step 1: Create `k8s/namespace.yaml`**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: cyber-sentinel
```

- [ ] **Step 2: Create `k8s/configmap.yaml`**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cyber-sentinel-config
  namespace: cyber-sentinel
data:
  MONGODB_URI: "mongodb://mongodb-svc:27017"
  REDIS_URL: "redis://redis-svc:6379/0"
  CELERY_RESULT_URL: "redis://redis-svc:6379/1"
  APP_REDIS_URL: "redis://redis-svc:6379/2"
  ZAP_API_URL: "http://zap-svc:8080"
  PYTHONPATH: "/app"
  PYTHONUNBUFFERED: "1"
  ALLOW_PRIVATE_TARGETS: "true"
  WAZUH_API_URL: "https://10.4.89.178:55000"
  WAZUH_VERIFY_SSL: "false"
  FRONTEND_URL: "http://10.4.89.178"
  CORS_EXTRA_ORIGINS: "http://10.4.89.178,http://localhost:5173,http://localhost:3000"
  AI_PROVIDER: "groq"
```

- [ ] **Step 3: Create `k8s/secret.yaml`**

All values must be base64-encoded. Use `echo -n "value" | base64` for each.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: cyber-sentinel-secrets
  namespace: cyber-sentinel
type: Opaque
stringData:
  # stringData accepts plain text — k8s encodes it automatically at apply time.
  # Copy values from your .env file.
  JWT_SECRET: "REPLACE_ME"
  CLAUDE_API_KEY: ""
  GROQ_API_KEY: "REPLACE_ME"
  GEMINI_API_KEY: ""
  OPENAI_API_KEY: ""
  WAZUH_API_USER: "wazuh-wui"
  WAZUH_API_PASSWORD: "REPLACE_ME"
  WAZUH_WEBHOOK_TOKEN: "REPLACE_ME"
  NVD_API_KEY: ""
  VIRUSTOTAL_API_KEY: ""
  ABUSEIPDB_API_KEY: ""
  FIRST_ADMIN_USERNAME: "admin"
  FIRST_ADMIN_EMAIL: "REPLACE_ME"
  FIRST_ADMIN_PASSWORD: "REPLACE_ME"
```

- [ ] **Step 4: Create `k8s/statefulsets/mongodb.yaml`**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mongodb
  namespace: cyber-sentinel
spec:
  serviceName: mongodb-svc
  replicas: 1
  selector:
    matchLabels:
      app: mongodb
  template:
    metadata:
      labels:
        app: mongodb
    spec:
      containers:
      - name: mongodb
        image: mongo:7
        ports:
        - containerPort: 27017
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "1000m"
        volumeMounts:
        - name: mongo-data
          mountPath: /data/db
        readinessProbe:
          exec:
            command: ["mongosh", "--eval", "db.adminCommand('ping')"]
          initialDelaySeconds: 15
          periodSeconds: 10
          timeoutSeconds: 5
          failureThreshold: 5
        livenessProbe:
          exec:
            command: ["mongosh", "--eval", "db.adminCommand('ping')"]
          initialDelaySeconds: 30
          periodSeconds: 30
          timeoutSeconds: 5
          failureThreshold: 3
  volumeClaimTemplates:
  - metadata:
      name: mongo-data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: local-path
      resources:
        requests:
          storage: 10Gi
```

- [ ] **Step 5: Create `k8s/statefulsets/redis.yaml`**

```yaml
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: cyber-sentinel
spec:
  serviceName: redis-svc
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        command:
        - redis-server
        - --appendonly
        - "yes"
        - --maxmemory
        - "100mb"
        - --maxmemory-policy
        - allkeys-lru
        ports:
        - containerPort: 6379
        resources:
          requests:
            memory: "64Mi"
            cpu: "100m"
          limits:
            memory: "128Mi"
            cpu: "250m"
        volumeMounts:
        - name: redis-data
          mountPath: /data
        readinessProbe:
          exec:
            command: ["redis-cli", "ping"]
          initialDelaySeconds: 5
          periodSeconds: 10
          timeoutSeconds: 3
          failureThreshold: 5
        livenessProbe:
          exec:
            command: ["redis-cli", "ping"]
          initialDelaySeconds: 15
          periodSeconds: 30
          timeoutSeconds: 3
          failureThreshold: 3
  volumeClaimTemplates:
  - metadata:
      name: redis-data
    spec:
      accessModes: ["ReadWriteOnce"]
      storageClassName: local-path
      resources:
        requests:
          storage: 2Gi
```

- [ ] **Step 6: Create `k8s/services/mongodb-svc.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: mongodb-svc
  namespace: cyber-sentinel
spec:
  clusterIP: None   # headless — enables StatefulSet DNS (mongodb-svc:27017)
  selector:
    app: mongodb
  ports:
  - port: 27017
    targetPort: 27017
```

- [ ] **Step 7: Create `k8s/services/redis-svc.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: redis-svc
  namespace: cyber-sentinel
spec:
  clusterIP: None   # headless — enables StatefulSet DNS (redis-svc:6379)
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
```

- [ ] **Step 8: Apply and verify**

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/statefulsets/
kubectl apply -f k8s/services/mongodb-svc.yaml k8s/services/redis-svc.yaml

# Wait for pods to be ready
kubectl -n cyber-sentinel get pods -w
```
Expected: `mongodb-0` and `redis-0` reach `Running` state.

**Restore MongoDB data:**
```bash
kubectl cp ./mongodump-backup cyber-sentinel/mongodb-0:/tmp/mongodump
kubectl exec -n cyber-sentinel mongodb-0 -- mongorestore /tmp/mongodump
```

- [ ] **Step 9: Commit**

```bash
git add k8s/
git commit -m "feat(k8s): namespace, configmap, secret, mongodb and redis statefulsets + services"
```

---

## Task 10 — K8s: backend + frontend deployments + services

**Files:**
- Create: `k8s/deployments/backend.yaml`
- Create: `k8s/deployments/frontend.yaml`
- Create: `k8s/services/backend-svc.yaml`
- Create: `k8s/services/frontend-svc.yaml`

- [ ] **Step 1: Create `k8s/deployments/backend.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: cyber-sentinel
spec:
  replicas: 2
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      containers:
      - name: backend
        image: cyber-sentinel/backend:latest
        imagePullPolicy: Never
        ports:
        - containerPort: 8000
        envFrom:
        - configMapRef:
            name: cyber-sentinel-config
        - secretRef:
            name: cyber-sentinel-secrets
        resources:
          requests:
            memory: "128Mi"
            cpu: "125m"
          limits:
            memory: "256Mi"
            cpu: "500m"
        readinessProbe:
          httpGet:
            path: /api/health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 15
          timeoutSeconds: 5
          failureThreshold: 5
        livenessProbe:
          httpGet:
            path: /api/health
            port: 8000
          initialDelaySeconds: 60
          periodSeconds: 30
          timeoutSeconds: 5
          failureThreshold: 3
```

- [ ] **Step 2: Create `k8s/deployments/frontend.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: frontend
  namespace: cyber-sentinel
spec:
  replicas: 1
  selector:
    matchLabels:
      app: frontend
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
      - name: frontend
        image: cyber-sentinel/frontend:latest
        imagePullPolicy: Never
        ports:
        - containerPort: 80
        resources:
          requests:
            memory: "32Mi"
            cpu: "50m"
          limits:
            memory: "64Mi"
            cpu: "100m"
```

- [ ] **Step 3: Create `k8s/services/backend-svc.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend-svc
  namespace: cyber-sentinel
spec:
  selector:
    app: backend
  ports:
  - port: 8000
    targetPort: 8000
```

- [ ] **Step 4: Create `k8s/services/frontend-svc.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend-svc
  namespace: cyber-sentinel
spec:
  selector:
    app: frontend
  ports:
  - port: 80
    targetPort: 80
```

- [ ] **Step 5: Apply and verify**

```bash
kubectl apply -f k8s/deployments/backend.yaml k8s/deployments/frontend.yaml
kubectl apply -f k8s/services/backend-svc.yaml k8s/services/frontend-svc.yaml
kubectl -n cyber-sentinel rollout status deployment/backend
kubectl -n cyber-sentinel rollout status deployment/frontend
```
Expected: both rollouts complete. Check health: `kubectl -n cyber-sentinel exec deploy/backend -- curl -sf http://localhost:8000/api/health`

- [ ] **Step 6: Commit**

```bash
git add k8s/deployments/backend.yaml k8s/deployments/frontend.yaml k8s/services/backend-svc.yaml k8s/services/frontend-svc.yaml
git commit -m "feat(k8s): backend and frontend deployments + services"
```

---

## Task 11 — K8s: Celery worker deployments (scan, soc, report)

**Files:**
- Create: `k8s/deployments/celery-scan.yaml`
- Create: `k8s/deployments/celery-soc.yaml`
- Create: `k8s/deployments/celery-report.yaml`

- [ ] **Step 1: Create `k8s/deployments/celery-scan.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: celery-scan
  namespace: cyber-sentinel
spec:
  replicas: 2
  selector:
    matchLabels:
      app: celery-scan
  template:
    metadata:
      labels:
        app: celery-scan
    spec:
      containers:
      - name: celery-scan
        image: cyber-sentinel/backend:latest
        imagePullPolicy: Never
        command:
        - celery
        - -A
        - core.celery_app
        - worker
        - --loglevel=info
        - --pool=prefork
        - --concurrency=2
        - -Q
        - celery
        - -n
        - scan@%h
        envFrom:
        - configMapRef:
            name: cyber-sentinel-config
        - secretRef:
            name: cyber-sentinel-secrets
        resources:
          requests:
            memory: "64Mi"
            cpu: "125m"
          limits:
            memory: "128Mi"
            cpu: "500m"
```

- [ ] **Step 2: Create `k8s/deployments/celery-soc.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: celery-soc
  namespace: cyber-sentinel
spec:
  replicas: 2
  selector:
    matchLabels:
      app: celery-soc
  template:
    metadata:
      labels:
        app: celery-soc
    spec:
      containers:
      - name: celery-soc
        image: cyber-sentinel/backend:latest
        imagePullPolicy: Never
        command:
        - celery
        - -A
        - core.celery_app
        - worker
        - --loglevel=info
        - --pool=prefork
        - --concurrency=1
        - -Q
        - soc
        - -n
        - soc@%h
        envFrom:
        - configMapRef:
            name: cyber-sentinel-config
        - secretRef:
            name: cyber-sentinel-secrets
        resources:
          requests:
            memory: "64Mi"
            cpu: "125m"
          limits:
            memory: "128Mi"
            cpu: "250m"
```

- [ ] **Step 3: Create `k8s/deployments/celery-report.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: celery-report
  namespace: cyber-sentinel
spec:
  replicas: 1
  selector:
    matchLabels:
      app: celery-report
  template:
    metadata:
      labels:
        app: celery-report
    spec:
      containers:
      - name: celery-report
        image: cyber-sentinel/backend:latest
        imagePullPolicy: Never
        command:
        - celery
        - -A
        - core.celery_app
        - worker
        - --loglevel=info
        - --pool=solo
        - -Q
        - report
        - -n
        - report@%h
        envFrom:
        - configMapRef:
            name: cyber-sentinel-config
        - secretRef:
            name: cyber-sentinel-secrets
        resources:
          requests:
            memory: "32Mi"
            cpu: "50m"
          limits:
            memory: "64Mi"
            cpu: "250m"
```

- [ ] **Step 4: Apply and verify**

```bash
kubectl apply -f k8s/deployments/celery-scan.yaml k8s/deployments/celery-soc.yaml k8s/deployments/celery-report.yaml
kubectl -n cyber-sentinel get pods -l 'app in (celery-scan,celery-soc,celery-report)'
```
Expected: 2 celery-scan pods, 2 celery-soc pods, 1 celery-report pod, all Running.

- [ ] **Step 5: Commit**

```bash
git add k8s/deployments/celery-scan.yaml k8s/deployments/celery-soc.yaml k8s/deployments/celery-report.yaml
git commit -m "feat(k8s): celery scan, soc, and report worker deployments"
```

---

## Task 12 — K8s: singletons (beat, forwarder, zap) + PDBs + ingress

**Files:**
- Create: `k8s/deployments/celery-beat.yaml`
- Create: `k8s/deployments/forwarder.yaml`
- Create: `k8s/deployments/zap.yaml`
- Create: `k8s/services/zap-svc.yaml`
- Create: `k8s/pdb/celery-beat-pdb.yaml`
- Create: `k8s/pdb/forwarder-pdb.yaml`
- Create: `k8s/ingress/ingress.yaml`

- [ ] **Step 1: Create `k8s/deployments/celery-beat.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: celery-beat
  namespace: cyber-sentinel
spec:
  replicas: 1    # NEVER increase — two Beat instances = duplicate task dispatch
  selector:
    matchLabels:
      app: celery-beat
  template:
    metadata:
      labels:
        app: celery-beat
    spec:
      containers:
      - name: celery-beat
        image: cyber-sentinel/backend:latest
        imagePullPolicy: Never
        command:
        - celery
        - -A
        - core.celery_app
        - beat
        - --loglevel=info
        - --scheduler
        - celery.beat.PersistentScheduler
        - --pidfile
        - /tmp/celerybeat.pid
        envFrom:
        - configMapRef:
            name: cyber-sentinel-config
        - secretRef:
            name: cyber-sentinel-secrets
        resources:
          requests:
            memory: "32Mi"
            cpu: "50m"
          limits:
            memory: "64Mi"
            cpu: "100m"
```

- [ ] **Step 2: Create `k8s/pdb/celery-beat-pdb.yaml`**

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: celery-beat-pdb
  namespace: cyber-sentinel
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: celery-beat
```

- [ ] **Step 3: Create `k8s/deployments/forwarder.yaml`**

Replace `/opt/cyber-sentinel` with the actual project path on the VM.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: forwarder
  namespace: cyber-sentinel
spec:
  replicas: 1    # NEVER increase — two forwarders = duplicate alert ingestion
  selector:
    matchLabels:
      app: forwarder
  template:
    metadata:
      labels:
        app: forwarder
    spec:
      containers:
      - name: forwarder
        image: python:3.11-alpine
        command: ["python3", "/app/scripts/wazuh_forwarder.py"]
        env:
        - name: CYBER_SENTINEL_URL
          value: "http://backend-svc:8000"
        - name: ALERTS_FILE
          value: "/var/ossec/logs/alerts/alerts.json"
        - name: STATE_FILE
          value: "/state/wazuh_forwarder.state"
        - name: MIN_LEVEL
          value: "3"
        - name: TENANT_GROUP
          value: "tenant_lab"
        envFrom:
        - secretRef:
            name: cyber-sentinel-secrets
        volumeMounts:
        - name: scripts
          mountPath: /app/scripts
          readOnly: true
        - name: wazuh-logs
          mountPath: /var/ossec/logs
          readOnly: true
        - name: forwarder-state
          mountPath: /state
        resources:
          requests:
            memory: "16Mi"
            cpu: "25m"
          limits:
            memory: "32Mi"
            cpu: "50m"
      volumes:
      - name: scripts
        hostPath:
          path: /opt/cyber-sentinel/scripts   # UPDATE to actual project scripts/ path on VM
          type: Directory
      - name: wazuh-logs
        hostPath:
          path: /var/ossec/logs
          type: Directory
      - name: forwarder-state
        persistentVolumeClaim:
          claimName: forwarder-state-pvc
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: forwarder-state-pvc
  namespace: cyber-sentinel
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 100Mi
```

- [ ] **Step 4: Create `k8s/pdb/forwarder-pdb.yaml`**

```yaml
apiVersion: policy/v1
kind: PodDisruptionBudget
metadata:
  name: forwarder-pdb
  namespace: cyber-sentinel
spec:
  minAvailable: 1
  selector:
    matchLabels:
      app: forwarder
```

- [ ] **Step 5: Create `k8s/deployments/zap.yaml`**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: zap
  namespace: cyber-sentinel
spec:
  replicas: 1
  selector:
    matchLabels:
      app: zap
  template:
    metadata:
      labels:
        app: zap
    spec:
      containers:
      - name: zap
        image: ghcr.io/zaproxy/zaproxy:stable
        command:
        - zap.sh
        - -daemon
        - -host
        - "0.0.0.0"
        - -port
        - "8080"
        - -config
        - api.addrs.addr.name=.*
        - -config
        - api.addrs.addr.regex=true
        - -config
        - api.disablekey=true
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "800Mi"
            cpu: "1000m"
        readinessProbe:
          httpGet:
            path: /JSON/core/view/version/
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 15
          timeoutSeconds: 10
          failureThreshold: 5
```

- [ ] **Step 6: Create `k8s/services/zap-svc.yaml`**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: zap-svc
  namespace: cyber-sentinel
spec:
  selector:
    app: zap
  ports:
  - port: 8080
    targetPort: 8080
```

- [ ] **Step 7: Create `k8s/ingress/ingress.yaml`**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: cyber-sentinel
  namespace: cyber-sentinel
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
  - http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: backend-svc
            port:
              number: 8000
      - path: /ws
        pathType: Prefix
        backend:
          service:
            name: backend-svc
            port:
              number: 8000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend-svc
            port:
              number: 80
```

- [ ] **Step 8: Apply everything**

```bash
kubectl apply -f k8s/deployments/celery-beat.yaml
kubectl apply -f k8s/deployments/forwarder.yaml
kubectl apply -f k8s/deployments/zap.yaml
kubectl apply -f k8s/services/zap-svc.yaml
kubectl apply -f k8s/pdb/
kubectl apply -f k8s/ingress/ingress.yaml
kubectl -n cyber-sentinel get pods -w
```
Expected: all pods Running. PDBs listed: `kubectl -n cyber-sentinel get pdb`

- [ ] **Step 9: Commit**

```bash
git add k8s/
git commit -m "feat(k8s): beat, forwarder, zap deployments + PDBs + traefik ingress"
```

---

## Task 13 — Smoke test

- [ ] **Step 1: Verify all pods are Running**

```bash
kubectl -n cyber-sentinel get pods
```
Expected: `mongodb-0`, `redis-0`, `backend-*` (×2), `frontend-*`, `celery-scan-*` (×2), `celery-soc-*` (×2), `celery-report-*`, `celery-beat-*`, `forwarder-*`, `zap-*` — all `Running`.

- [ ] **Step 2: Check API health**

```bash
curl -sf http://10.4.89.178/api/health
```
Expected: `{"status":"ok"}`

- [ ] **Step 3: Verify Beat is dispatching tasks**

```bash
kubectl -n cyber-sentinel logs deploy/celery-beat --tail=20
```
Expected: log lines showing `drain-triage-queue` and `poll-wazuh-alerts` firing every 10s/30s.

- [ ] **Step 4: Verify SOC worker drains without 429**

```bash
kubectl -n cyber-sentinel logs deploy/celery-soc --tail=30
```
Expected: `[SOC Drain]` log lines — no `TRIAGE_FAILED` or `429` errors.

- [ ] **Step 5: Verify scan does not hang**

Submit a quick scan via the API and watch it complete:
```bash
# Get a JWT first (login via /api/auth/login)
curl -sf http://10.4.89.178/api/scans | head -5
```

- [ ] **Step 6: Verify no duplicate alerts**

```bash
# Check MongoDB — alert count should not double after a poll cycle
kubectl -n cyber-sentinel exec mongodb-0 -- mongosh cyber_sentinel --eval \
  'db.alerts.countDocuments()' --quiet
# Wait 35s, check again — count should increase by new alerts only, not double
```

- [ ] **Step 7: Shutdown Docker Compose (after confirming k3s is stable)**

```bash
# On the VM, in the project directory
docker compose down
```

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat(k8s): complete k3s migration — all services verified"
```

---

## Notes for the next project holder

The following are explicitly out of scope and left for the next engineer:

- **KEDA** (`helm install keda kedacore/keda`) — scales Celery workers on Redis queue depth instead of fixed replicas
- **HPA on backend** — add `kubectl autoscale deployment backend --cpu-percent=70 --min=2 --max=4`
- **ZAP as K8s Job per scan** — requires 16 GB RAM to run 2+ simultaneous ZAP containers; current VM has 7.8 GB
- **Multi-node k3s** — add a second VM with `k3s agent --server https://10.4.89.178:6443 --token <node-token>`
- **MongoDB replica set** — enables read scaling and automatic failover
- **redbeat** — Redis-backed Beat scheduler with distributed leader election (replaces `replicas: 1` constraint)
