# Cyber Sentinel — Performance, Security & Reliability Overhaul

> **Spec date:** 2026-05-11
> **Status:** Approved for implementation
> **Target:** Ubuntu VM (4 vCPU / 7.8GB RAM) · 20 concurrent lab users
> **Scope:** k8s cleanup · Docker Compose hardening · Celery concurrency · Security · Reliability

---

## Context

The deployment was migrated from `docker-compose` to k3s and back. During k3s, all three Celery
worker services (`celery`, `celery-soc`, `celery-beat`) lost the `APP_REDIS_URL` and
`CELERY_RESULT_URL` environment variable overrides. Inside Docker, `localhost` resolves to the
container itself — not the Redis container — so every task's `settings.app_redis_url` resolves to
a dead address. This silently disabled every safety mechanism:

| Broken mechanism | Effect |
|---|---|
| Triage dedup SETNX lock | Every alert processed N times |
| Poll distributed lock | Multiple simultaneous Wazuh polls |
| `soc:triage_pending` sorted-set | Falls back to direct dispatch → LLM hammered |
| `scan:active:{user_id}` counter | Per-user scan cap never enforced |

Additionally, both Celery workers run `--pool=solo` (single-threaded), meaning tasks are fully
serialized. With 20 users, scans queue and never finish. ZAP has a 4200s (70 min) timeout that
holds the pentest worker hostage for over an hour per scan.

k3s has been fully uninstalled. Docker has been pruned. Available RAM after cleanup: ~5GB.

---

## Goals

1. Fix the root cause (missing env vars) so all safety mechanisms work
2. Enable real Celery concurrency on Ubuntu (prefork)
3. Add resource limits so ZAP cannot OOM the VM
4. Harden all unauthenticated services (MongoDB, Redis, ZAP)
5. Fix task-level bugs (sleep, timeouts, poll cursor, autoretry scope)
6. Add structured logging, dead-letter audit trail, and circuit breaker
7. Enable Redis AOF persistence so queues survive container restarts
8. Improve `/api/health` to surface real system state
9. Add MongoDB backup script

---

## Non-Goals

- Flower monitoring (adds 150MB overhead on constrained VM — revisit when VM is upgraded)
- MongoDB replica set (single-node lab deployment)
- TLS between internal Docker services
- Priority queues (deferred — not needed at 20 users once concurrency works)

---

## Section 1: Repository Cleanup

### 1.1 Delete k8s/ directory

Remove the entire `k8s/` directory from git. k3s is uninstalled and this directory is dead code.

```bash
git rm -r k8s/
```

### 1.2 Audit GitHub Actions workflows

Check `.github/workflows/deploy-staging.yml` for any `kubectl` or k8s-specific steps. Remove or
replace them. The CI pipeline should only validate code — no k8s deploy steps.

### 1.3 Update .env.example

Add new required variables:

```env
# MongoDB auth (required — no defaults accepted in production)
MONGO_USERNAME=cyber_sentinel
MONGO_PASSWORD=REPLACE_ME

# Redis auth
REDIS_PASSWORD=REPLACE_ME

# ZAP API key (used by backend + celery to authenticate ZAP API calls)
ZAP_API_KEY=REPLACE_ME
```

---

## Section 2: Docker Compose Overhaul

File: `docker-compose.yml`

### 2.1 Root cause fix — missing env vars on all workers

Add to `celery`, `celery-soc`, and `celery-beat` services:

```yaml
- CELERY_RESULT_URL=redis://:${REDIS_PASSWORD}@redis:6379/1
- APP_REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/2
```

This single fix restores: triage dedup, poll locking, rate-limited triage queue, and per-user
scan counters.

### 2.2 Switch Celery pools to prefork

```yaml
# celery (pentest worker)
command: celery -A core.celery_app worker --loglevel=info --pool=prefork --concurrency=2 -Q celery

# celery-soc
command: celery -A core.celery_app worker --loglevel=info --pool=prefork --concurrency=3 -Q soc
```

2 concurrent pentest tasks = 2 simultaneous scans. 3 SOC slots handle poll + drain + triage
bursts without starving each other.

### 2.3 Resource limits

```yaml
# ZAP — idle 807MB, active scan can hit 2GB
zap:
  deploy:
    resources:
      limits:
        memory: 1536m
      reservations:
        memory: 512m

# Backend
backend:
  deploy:
    resources:
      limits:
        memory: 512m

# Celery pentest — 2 concurrent scans, each tool spawns subprocesses
celery:
  deploy:
    resources:
      limits:
        memory: 768m

# Celery SOC — I/O bound, mostly LLM API calls
celery-soc:
  deploy:
    resources:
      limits:
        memory: 384m

# Celery beat — just a scheduler, negligible
celery-beat:
  deploy:
    resources:
      limits:
        memory: 128m

# MongoDB
mongo:
  deploy:
    resources:
      limits:
        memory: 512m

# Redis
redis:
  deploy:
    resources:
      limits:
        memory: 128m
```

### 2.4 Log rotation on all services

Add to every service:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"
```

Disk is at 80% — uncapped logs will fill it within days of active scanning.

### 2.5 Graceful shutdown for Celery workers

```yaml
celery:
  stop_grace_period: 120s

celery-soc:
  stop_grace_period: 60s
```

Gives in-flight scans 2 minutes to checkpoint before Docker force-kills the container.

### 2.6 MongoDB authentication

```yaml
mongo:
  environment:
    MONGO_INITDB_ROOT_USERNAME: ${MONGO_USERNAME}
    MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
```

Update all `MONGODB_URI` references across every service:

```yaml
MONGODB_URI: mongodb://${MONGO_USERNAME}:${MONGO_PASSWORD}@mongo:27017
```

**Migration note (one-time, run before restarting with auth enabled):**

```bash
# Connect to existing unauthenticated MongoDB and create the admin user
docker exec -it cyber-sentinel-mongo mongosh --eval "
  db.getSiblingDB('admin').createUser({
    user: 'cyber_sentinel',
    pwd: '<your_password>',
    roles: [{ role: 'root', db: 'admin' }]
  })
"
# Then restart with auth enabled
docker compose up -d mongo
```

### 2.7 Redis authentication

```yaml
redis:
  command: >
    redis-server
    --requirepass ${REDIS_PASSWORD}
    --appendonly yes
    --appendfsync everysec
```

Update all Redis URL env vars across every service to include the password:

```yaml
REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/0
CELERY_RESULT_URL: redis://:${REDIS_PASSWORD}@redis:6379/1
APP_REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379/2
```

The `--appendonly yes --appendfsync everysec` flags also cover Section 6 (Redis persistence) —
no separate change needed.

### 2.8 ZAP API key

```yaml
zap:
  command: >
    zap.sh -daemon -host 0.0.0.0 -port 8080
    -config api.addrs.addr.name=.*
    -config api.addrs.addr.regex=true
    -config api.key=${ZAP_API_KEY}
```

Remove `api.disablekey=true`. Pass `ZAP_API_KEY` only to services that call ZAP:

```yaml
# backend and celery (pentest) only
- ZAP_API_KEY=${ZAP_API_KEY}
```

### 2.9 Secret scoping

Remove broad `env_file: .env` from Celery workers. Replace with explicit env vars per service:

| Secret | backend | celery (pentest) | celery-soc | celery-beat |
|---|---|---|---|---|
| MONGODB_URI | ✓ | ✓ | ✓ | ✓ |
| REDIS_URL | ✓ | ✓ | ✓ | ✓ |
| JWT_SECRET | ✓ | ✗ | ✗ | ✗ |
| AI keys | ✓ | ✓ | ✓ | ✗ |
| WAZUH credentials | ✓ | ✗ | ✓ | ✗ |
| ZAP_API_KEY | ✓ | ✓ | ✗ | ✗ |
| FIRST_ADMIN_* | ✓ | ✗ | ✗ | ✗ |
| NVD/VT/AbuseIPDB | ✓ | ✓ | ✗ | ✗ |

---

## Section 3: Backend Dockerfile — Non-root User

File: `backend/Dockerfile`

Add after dependency installation:

```dockerfile
RUN addgroup --system appuser && adduser --system --ingroup appuser appuser
USER appuser
```

All Celery workers use the same image so this covers them automatically.

**Note:** If any tool (Nmap, Nuclei) requires root for raw socket access, wrap only that tool's
subprocess call with explicit capability grants rather than running the whole container as root.
Check and document which tools require elevated privileges in the Dockerfile comment.

---

## Section 4: Celery App Config

File: `backend/core/celery_app.py`

Add to `celery.conf.update(...)`:

```python
# Re-queue tasks if a worker dies mid-execution
task_reject_on_worker_lost=True,
# Give in-flight tasks time to finish on SIGTERM before worker exits
worker_shutdown_timeout=120,
```

`task_reject_on_worker_lost=True` combined with `task_acks_late=True` (already set) means: if a
worker process dies mid-task, the task is returned to the queue and picked up by another worker
rather than being lost silently.

---

## Section 5: Pentest Task Fixes

File: `backend/domains/pentesting/tasks.py`

### 5.1 Remove asyncio.sleep(20)

Remove the `await asyncio.sleep(20)` between AI summary and narrative generation calls (currently
at line ~565). Rate limiting is already handled by `rate_limit="6/m"` on `triage_single_alert`.
The sleep blocks the entire worker process for 20 seconds per scan.

### 5.2 Reduce ZAP timeout

Change in `TOOL_TIMEOUTS`:

```python
"zap": 600,   # was 4200 — 10 min is enough for lab targets
```

A 70-minute ZAP timeout on a 4-core shared VM means one full scan freezes the pentest worker
for over an hour. 10 minutes is appropriate for student lab targets.

### 5.3 Fix autoretry scope

Change:

```python
autoretry_for=(Exception,),
```

To:

```python
autoretry_for=(httpx.HTTPError, ConnectionError, TimeoutError, OSError),
```

Retrying on `ValueError`, `KeyError`, or `AttributeError` from malformed data wastes task slots
and masks real bugs. Only retry on transient network and I/O errors.

### 5.4 init_db() singleton — module-level initialization

Currently `_run_scan_async` calls `await init_db()` on every task execution. This creates a new
Motor connection pool each time.

Use Celery's `worker_process_init` signal to call `init_db()` once per worker process startup:

```python
from celery.signals import worker_process_init

@worker_process_init.connect
def init_worker_db(**kwargs):
    import asyncio
    asyncio.run(init_db())
```

Guard `init_db()` with an `_initialized` module-level flag so it's idempotent if called again.

### 5.5 System-wide concurrent scan cap

File: `backend/domains/pentesting/router.py`

Before creating a scan, check total active scans:

```python
total_active = int(await redis.get("scan:active:total") or 0)
if total_active >= settings.max_concurrent_scans:   # default: 2
    raise HTTPException(
        status_code=429,
        detail="System is at capacity (2 scans running). Please wait for a scan to complete."
    )
```

Increment `scan:active:total` atomically when a scan starts; decrement in `_decrement_active_scans`.
Add `max_concurrent_scans: int = 2` to `Settings`.

---

## Section 6: SOC Task Fixes

File: `backend/domains/soc/tasks.py`

### 6.1 Poll cursor — stop re-fetching old alerts

Currently `poll_wazuh_alerts` calls `get_alerts_paginated(max_alerts=500)` with no time filter,
fetching already-ingested alerts every 30 seconds. The dedup lock catches duplicates but wastes
API calls and Redis ops.

Replace with cursor-based fetching:

```python
# Load last-polled timestamp from Redis
last_poll_key = "soc:last_poll_ts"
raw = await r.get(last_poll_key)
since = datetime.fromisoformat(raw.decode()) if raw else datetime.now(timezone.utc) - timedelta(minutes=5)

# Only fetch alerts newer than last poll
alerts = await wazuh_client.get_alerts_since(since, limit=200, level_min=3)

# After successful ingest, update cursor
await r.set(last_poll_key, datetime.now(timezone.utc).isoformat())
```

`get_alerts_since()` is already implemented in `wazuh_client.py`.

### 6.2 Circuit breaker for Wazuh API

Track consecutive failures in Redis:

```python
fail_key = "soc:wazuh_failures"
failures = int(await r.get(fail_key) or 0)

if failures >= 3:
    # Back off — check if backoff period has passed
    backoff_key = "soc:wazuh_backoff_until"
    until_raw = await r.get(backoff_key)
    if until_raw and datetime.now(timezone.utc) < datetime.fromisoformat(until_raw.decode()):
        log.info("[SOC Polling] Circuit open — skipping poll (Wazuh unreachable)")
        return

# On success: reset failure counter
await r.delete(fail_key)

# On exception: increment counter, set 5-minute backoff after 3 failures
await r.incr(fail_key)
if failures + 1 >= 3:
    until = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    await r.set(backoff_key, until, ex=300)
```

### 6.3 Dead-letter logging

When `triage_single_alert` exhausts all retries, log to MongoDB instead of silently dropping:

```python
@triage_single_alert.on_failure
def on_triage_failure(exc, task_id, args, kwargs, einfo):
    asyncio.run(_log_task_failure(
        task_name="triage_single_alert",
        task_id=task_id,
        args=args,
        error=str(exc),
        traceback=str(einfo),
    ))
```

`_log_task_failure` inserts into a `task_failures` MongoDB collection with `task_name`,
`task_id`, `args`, `error`, `traceback`, `failed_at`. No retry — purely an audit trail.

### 6.4 Fix autoretry scope

Same as Section 5.3 — replace `autoretry_for=(Exception,)` with specific transient exceptions.

---

## Section 7: Structured Logging in Celery Workers

Both `pentesting/tasks.py` and `soc/tasks.py`:

Replace:

```python
log = logging.getLogger(__name__)
log.info("message")
```

With:

```python
import structlog
log = structlog.get_logger()
log.info("message", service="celery-pentest", task_id=self.request.id)
```

Bind `service` and `task_id` at the start of each task so all log lines from that task include
them automatically. Matches the backend's existing structlog format, making log correlation
possible across backend + worker logs.

---

## Section 8: Health Check Improvements

File: `backend/main.py` (or `backend/domains/health/router.py` if it exists)

Extend `GET /api/health` to return per-component status:

```json
{
  "status": "ok",
  "checks": {
    "mongodb": "ok",
    "redis": "ok",
    "celery_pentest": "ok",
    "celery_soc": "ok",
    "wazuh": "reachable"
  }
}
```

Rules:
- `mongodb` and `redis` failure → overall `status: "error"` (HTTP 503)
- `celery_*` failure → overall `status: "degraded"` (HTTP 200 — app still serves reads)
- `wazuh` failure → `status: "degraded"` (HTTP 200 — SOC features unavailable, pentest works)

Timeouts: Celery inspect ping max 3s, Wazuh check max 2s, MongoDB ping max 2s, Redis ping max 1s.

All checks run concurrently via `asyncio.gather` to keep total health check latency under 3s.

---

## Section 9: MongoDB Backup Script

File: `scripts/backup_mongo.sh`

```bash
#!/usr/bin/env bash
# Daily MongoDB backup — run via cron on the VM host
# Retention: 7 days
BACKUP_DIR="/opt/cyber-sentinel/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DEST="${BACKUP_DIR}/mongo_${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"
docker exec cyber-sentinel-mongo mongodump \
  --username "${MONGO_USERNAME}" \
  --password "${MONGO_PASSWORD}" \
  --out "/tmp/mongodump_${TIMESTAMP}"

docker cp "cyber-sentinel-mongo:/tmp/mongodump_${TIMESTAMP}" "${DEST}"
docker exec cyber-sentinel-mongo rm -rf "/tmp/mongodump_${TIMESTAMP}"

# Prune backups older than 7 days
find "${BACKUP_DIR}" -maxdepth 1 -name "mongo_*" -mtime +7 -exec rm -rf {} +

echo "Backup complete: ${DEST}"
```

Add to crontab on the VM (`crontab -e`):

```
0 2 * * * MONGO_USERNAME=cyber_sentinel MONGO_PASSWORD=<pass> /opt/cyber-sentinel/scripts/backup_mongo.sh >> /var/log/mongo_backup.log 2>&1
```

Restore command (for reference):

```bash
docker cp <backup_dir> cyber-sentinel-mongo:/tmp/restore
docker exec cyber-sentinel-mongo mongorestore \
  --username "${MONGO_USERNAME}" \
  --password "${MONGO_PASSWORD}" \
  --drop /tmp/restore
```

---

## Full File Map

| File | Change |
|---|---|
| `k8s/` | **Delete entirely** |
| `.github/workflows/deploy-staging.yml` | Remove k8s deploy steps |
| `.env.example` | Add MONGO_USERNAME, MONGO_PASSWORD, REDIS_PASSWORD, ZAP_API_KEY |
| `docker-compose.yml` | Env vars, pools, limits, auth, logging, graceful shutdown, secret scoping |
| `backend/Dockerfile` | Add non-root appuser |
| `backend/core/config.py` | Add `max_concurrent_scans: int = 2`, `mongo_username: str = ""`, `mongo_password: str = ""`, `redis_password: str = ""`, `zap_api_key: str = ""` fields to `Settings` class |
| `backend/core/celery_app.py` | task_reject_on_worker_lost, worker_shutdown_timeout |
| `backend/domains/pentesting/tasks.py` | Remove sleep(20), ZAP timeout, autoretry, init_db signal, structlog |
| `backend/domains/pentesting/router.py` | System-wide scan cap (HTTP 429) |
| `backend/domains/soc/tasks.py` | Poll cursor, circuit breaker, dead-letter, autoretry, structlog |
| `backend/main.py` | Extended /api/health |
| `scripts/backup_mongo.sh` | New file |

---

## Implementation Order

Implement in this order to ship the most impactful fixes first:

1. **k8s cleanup** — delete directory, clean workflows
2. **Root cause env vars** — add APP_REDIS_URL + CELERY_RESULT_URL to workers (unblocks everything)
3. **Celery pools + resource limits + log rotation + graceful shutdown** — docker-compose.yml
4. **Pentest task fixes** — sleep, ZAP timeout, autoretry, init_db, scan cap
5. **SOC task fixes** — poll cursor, circuit breaker, dead-letter, autoretry
6. **Structured logging** — both task files
7. **Security hardening** — MongoDB auth, Redis auth, ZAP key, secret scoping
8. **Backend Dockerfile** — non-root user
9. **Health check** — extend /api/health
10. **Backup script** — scripts/backup_mongo.sh

Security hardening (step 7) comes after task fixes so there's a working baseline to test against
before adding auth complexity.

---

## Testing Plan

| Test | How |
|---|---|
| Env var fix | Submit 1 alert via webhook; confirm triage runs exactly once (check `triage:lock:*` in Redis) |
| Concurrency | Submit 3 scans simultaneously; confirm only 2 run, 1 returns HTTP 429 |
| ZAP timeout | Run full scan against lab target; confirm ZAP phase completes or times out within 10 min |
| Poll cursor | Watch `soc:last_poll_ts` in Redis; confirm it advances each cycle |
| Circuit breaker | Stop Wazuh manager; confirm 3 failures → 5-min backoff in logs |
| Dead-letter | Force-fail a triage task (bad alert_id); confirm record in `task_failures` collection |
| Redis persistence | Restart Redis container mid-scan; confirm scan resumes from queue |
| MongoDB auth | Attempt unauthenticated `mongosh` connection; confirm rejection |
| Health check | Stop celery-soc; confirm `/api/health` returns `degraded` not `error` |
| Non-root | `docker exec cyber-sentinel-backend whoami` → `appuser` |
