# Celery Fixes + k3s Migration Design
**Date:** 2026-05-11  
**Status:** Approved  
**Scope:** Fix AI triage pile-up, LLM rate-limit errors, and scan hangs. Migrate Docker Compose to k3s. Scoped to current Ubuntu VM (7.8GB RAM, 4 CPU, 47GB disk).

---

## Problem Statement

Three active symptoms:
1. **Triage pile-up** — `poll_wazuh_alerts` dispatches up to 100 `triage_single_alert` tasks every 30s. `--pool=solo` processes them serially. Queue grows faster than it drains.
2. **LLM 429 rate-limit errors** — back-to-back LLM calls with no rate guard hit Groq/Claude free-tier TPM limits. Alerts end up with `ai_verdict = "TRIAGE_FAILED"`.
3. **Scan hangs** — ZAP timeout is 4200s. `--pool=solo` means a stalled ZAP scan blocks all other queued scans behind it.

Future concern: duplicate alert ingestion when running multiple k8s replicas.

---

## Constraints

| Resource | Value |
|---|---|
| RAM | 7.8GB total, ~3.1GB available |
| CPU | 4 cores |
| Disk | 47GB, 88% used (~5.5GB free before cleanup) |
| K8s target | k3s single-node on this VM |
| Scale target | ~20-30 concurrent users, 1 concurrent full scan, 2-3 quick scans |

**Prerequisite — disk cleanup before k3s install:**
```bash
docker image prune -a      # reclaims ~10-12GB from overlay2 (unused image layers)
docker volume prune        # removes anonymous volumes only (named volumes untouched)
docker builder prune       # build cache
```

---

## Architecture Decision: No KEDA, No HPA, No ZAP Jobs

Given 7.8GB RAM, these features are deferred to the next project holder:
- **KEDA** (queue-depth autoscaling): adds ~100MB overhead, not worth it at this scale
- **HPA** (CPU-based autoscaling): fixed replicas are simpler and predictable on a single node
- **ZAP as K8s Job per scan**: ZAP already uses 800MB; running 2 simultaneously would consume 1.6GB — leaves no headroom. ZAP stays as a single persistent Deployment.

---

## Section 1: Celery Fixes (6 changes)

### Fix 1 — Redis distributed lock on `poll_wazuh_alerts`
**File:** `backend/domains/soc/tasks.py`

At the start of `_poll_async`, acquire `SET NX PX 55000` on key `lock:poll_wazuh_alerts`. If already held, return immediately. TTL is 55s — covers the full 30s poll window plus buffer. Prevents overlapping polls when Wazuh API is slow.

```python
lock_key = "lock:poll_wazuh_alerts"
r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
acquired = await r.set(lock_key, "1", nx=True, px=55_000)
if not acquired:
    log.debug("[SOC Polling] Previous poll still running — skipping")
    await r.aclose()
    return
```

### Fix 2 — Per-alert Redis dedup on `triage_single_alert`
**File:** `backend/domains/soc/tasks.py`

Before `asyncio.run()`, attempt `SET NX PX 300000` on `triage:lock:{alert_id}`. If key exists, a triage is already in-flight — return immediately. Five-minute TTL covers the full pipeline duration. This is the outermost guard: runs in microseconds, no DB round-trip.

```python
# In triage_single_alert (sync Celery task body, before asyncio.run)
import redis as sync_redis
r = sync_redis.from_url(settings.redis_url, socket_connect_timeout=2)
if not r.set(f"triage:lock:{alert_id}", "1", nx=True, px=300_000):
    log.debug("triage:lock:%s already held — skipping duplicate", alert_id)
    return
```

### Fix 3 — LLM batch triage replaces per-alert dispatch
**File:** `backend/domains/soc/tasks.py`

Replace `triage_single_alert.delay(str(alert.id))` inside `_poll_async` with a Redis sorted-set push:
```python
await r.zadd("soc:triage_pending", {str(alert.id): time.time()})
```

Add a new Beat task `drain_triage_queue` (every 10s) that pops up to 5 alert IDs from `soc:triage_pending` and calls `batch_retriage(alert_ids, concurrency=2)` — which already exists in `triage_pipeline.py`.

High-severity bypass: alerts with `rule_level >= 12` skip the sorted set and dispatch `triage_single_alert.delay()` directly, with `rate_limit="6/m"` on the task.

**Why:** Stops the 100-task-per-poll avalanche. Naturally respects LLM rate limits. `batch_retriage` already has per-batch `asyncio.sleep(2)` between batches.

### Fix 4 — Per-user scan concurrency limit
**File:** `backend/domains/pentesting/router.py`

At `POST /api/scans`, before creating the scan record:
```python
active_key = f"scan:active:{current_user.id}"
active_count = await redis_client.get(active_key)
if int(active_count or 0) >= 2:
    raise HTTPException(429, "Max 2 concurrent scans per user")
await redis_client.incr(active_key)
await redis_client.expire(active_key, 5 * 3600)  # 5hr safety TTL
```
Decrement on scan completion/failure/cancel in `pentesting/tasks.py`.

**Why:** Prevents one user from queuing 20 scans and starving everyone else. Enforced at API boundary.

### Fix 5 — Wazuh alert pagination
**File:** `backend/domains/soc/wazuh_client.py`

Replace the hardcoded `limit=100` with cursor-based pagination: fetch up to 500 alerts per poll in batches of 100 using Wazuh's `offset` parameter. This ensures a breach simulation generating 300+ alerts is fully ingested.

```python
async def get_alerts(self, limit: int = 500) -> list[dict]:
    results = []
    offset = 0
    batch = 100
    while len(results) < limit:
        chunk = await self._fetch_alerts(limit=batch, offset=offset)
        if not chunk:
            break
        results.extend(chunk)
        offset += len(chunk)
    return results[:limit]
```

### Fix 6 — `rate_limit` on `triage_single_alert`
**File:** `backend/domains/soc/tasks.py`

Add `rate_limit="6/m"` to the `@celery.task` decorator. This is the safety net for the high-severity bypass path (Fix 3). 6 calls/minute = 1 every 10s, safely within Groq free tier.

---

## Section 2: K8s Manifest Structure

### File layout
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
│   └── redis-svc.yaml
├── ingress/
│   └── ingress.yaml
└── pdb/
    ├── celery-beat-pdb.yaml
    └── forwarder-pdb.yaml
```

### RAM budget
| Workload | Replicas | Limit each | Total |
|---|---|---|---|
| k3s overhead | — | — | ~700 Mi |
| backend | 2 | 256 Mi | 512 Mi |
| frontend | 1 | 64 Mi | 64 Mi |
| celery-scan | 2 | 128 Mi | 256 Mi |
| celery-soc | 2 | 128 Mi | 256 Mi |
| celery-report | 1 | 64 Mi | 64 Mi |
| celery-beat | 1 | 64 Mi | 64 Mi |
| forwarder | 1 | 32 Mi | 32 Mi |
| mongodb | 1 | 512 Mi | 512 Mi |
| redis | 1 | 128 Mi | 128 Mi |
| zap | 1 | 800 Mi | 800 Mi |
| **Total** | | | **~3.39 GB** |

Remaining ~4.4 GB for OS + kernel buffers + headroom.

### Redis DB separation
Single Redis instance, three logical databases:
- `DB 0` — Celery broker (`REDIS_URL=redis://redis-svc:6379/0`)
- `DB 1` — Celery result backend (`CELERY_RESULT_BACKEND=redis://redis-svc:6379/1`)
- `DB 2` — app locks, WS pub/sub, rate limiting, triage sorted set (`APP_REDIS_URL=redis://redis-svc:6379/2`)

### Singleton guarantees
- `celery-beat`: `replicas: 1` + `PodDisruptionBudget minAvailable: 1`. Running two Beat instances = every poll task dispatched twice. The Redis lock (Fix 1) is a second line of defence, not a substitute.
- `forwarder`: `replicas: 1` + PDB. Two forwarders reading the same log file = duplicate alert ingestion.

### Ingress
k3s ships with Traefik. Use Traefik IngressRoute:
- `/api` → `backend-svc:8000`
- `/ws` → `backend-svc:8000` (WebSocket upgrade header passthrough)
- `/` → `frontend-svc:80`

### Alert deduplication in k8s
Multiple `celery-soc` replicas (2) can both pick up triage tasks from the `soc` queue. Deduplication is guaranteed by Fix 2 (Redis SETNX per alert_id) — the second worker finds the lock held and returns in microseconds. No DB reads, no LLM calls wasted.

### ZAP
Single persistent Deployment (1 replica, 800Mi limit). Not scaled. Not spawned as Jobs. Concurrent scans that include ZAP are serialised by the per-user limit (Fix 4) and the Celery `zap` queue routing. The ZAP container is the VM's practical concurrency ceiling for full scans.

---

## Section 3: Celery Queue Routing (updated)

```python
celery.conf.task_routes = {
    "domains.soc.tasks.poll_wazuh_alerts":     {"queue": "soc"},
    "domains.soc.tasks.triage_single_alert":   {"queue": "soc"},
    "domains.soc.tasks.drain_triage_queue":    {"queue": "soc"},
    "domains.pentesting.tasks.run_scan":       {"queue": "celery"},
}
```

Beat schedule additions:
```python
"drain-triage-queue": {
    "task": "domains.soc.tasks.drain_triage_queue",
    "schedule": 10.0,
    "options": {"expires": 8},
},
```

---

## Implementation Order

1. **Disk cleanup** (prerequisite, manual step on VM)
2. **Celery fixes** — all 6 changes in Python code
3. **k8s manifests** — write all YAML files
4. **k3s install** on VM
5. **Deploy** — `kubectl apply -f k8s/`
6. **Smoke test** — verify triage processes, scan completes, no duplicates

---

## Out of Scope (next project holder)

- KEDA queue-depth autoscaling
- HPA on workers
- ZAP as K8s Job per scan (needs 16GB+ RAM)
- Multi-node k3s cluster
- MongoDB replica set
- Redis Sentinel / Cluster
- Persistent Beat via `redbeat`
