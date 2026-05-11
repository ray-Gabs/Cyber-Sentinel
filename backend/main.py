# ============================================================
# backend/main.py — FastAPI Application Entry Point
# ============================================================
# Run with:
#   uvicorn main:app --reload --host 0.0.0.0 --port 8000
# ============================================================

import asyncio
import json
import logging
import pathlib as _pathlib
import re
import subprocess as _subprocess
import time as _time
import uuid
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi.errors import RateLimitExceeded

from core.config import settings
from core.database import init_db, close_db
from core.exceptions import AppError
from core.logging_config import configure_logging
from core.metrics import WS_ACTIVE, metrics_output, record_request
from core.rate_limit import limiter
from core.security import decode_access_token
from core.websocket import ws_manager

log = structlog.get_logger(__name__)

# Record process start time for uptime reporting
_start_time = _time.time()

try:
    _GIT_SHA: str = _subprocess.check_output(
        ["git", "rev-parse", "--short", "HEAD"],
        stderr=_subprocess.DEVNULL,
        text=True,
    ).strip()
except Exception:
    _GIT_SHA = "unknown"

try:
    _VERSION: str = (_pathlib.Path(__file__).parent.parent / "VERSION").read_text().strip()
except FileNotFoundError:
    _VERSION = "1.0.1"


# --------------- WebSocket Redis Relay ---------------

async def _redis_ws_relay() -> None:
    """Subscribe to ws:* Redis pub/sub and forward messages to connected WebSocket clients.

    Celery workers can't call ws_manager directly (different process), so they
    publish to Redis channels (ws:scans, ws:alerts, …) and this relay bridges
    the gap by broadcasting into the in-process ConnectionManager.
    """
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.redis_url)
    pubsub = r.pubsub()
    await pubsub.psubscribe("ws:*")
    log.info("WS relay started — subscribed to ws:* channels")
    try:
        async for message in pubsub.listen():
            if message["type"] != "pmessage":
                continue
            try:
                raw_channel = message["channel"]
                channel = (
                    raw_channel.decode() if isinstance(raw_channel, bytes) else raw_channel
                ).removeprefix("ws:")
                raw_data = message["data"]
                data = json.loads(
                    raw_data.decode() if isinstance(raw_data, bytes) else raw_data
                )
                await ws_manager.broadcast(channel, data)
            except Exception as exc:
                log.warning("WS relay message error: %s", exc)
    except asyncio.CancelledError:
        pass
    finally:
        await pubsub.punsubscribe("ws:*")
        await r.aclose()
        log.info("WS relay stopped")


# --------------- Lifespan ---------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle events."""
    configure_logging(settings.log_level)

    # Startup — fail fast if critical services are unavailable
    try:
        await init_db()
        log.info("Connected to MongoDB (%s)", settings.mongodb_db_name)
    except Exception as exc:
        log.critical("MongoDB connection failed — cannot start: %s", exc)
        raise SystemExit(1) from exc

    # Ensure AI cache TTL index
    from ai.cache import AiCache
    await AiCache().ensure_indexes()

    # Seed default detection rules if none exist
    from domains.soc.rule_matcher import seed_default_rules
    await seed_default_rules()

    # Seed first admin account on fresh DB (uses FIRST_ADMIN_* env vars)
    from domains.auth.service import seed_admin, seed_demo_user
    await seed_admin()
    await seed_demo_user()

    # Seed Juice Shop + DVWA projects for the demo user — idempotent.
    # wazuh_agent_registered=False so the UI shows "Deploy Agent" (not fake "View Alerts").
    # Also auto-generates a wazuh_token for the demo user if not already set, which lab
    # staff can copy into the demo forwarder .env as WAZUH_WEBHOOK_TOKEN.
    import os as _os
    import secrets as _secrets
    _demo_email = _os.getenv("DEMO_USER_EMAIL", "").strip()
    if _demo_email:
        from domains.auth.models import User as _User
        from domains.soc.project_models import SocProject as _SocProject
        _demo = await _User.find_one({"email": _demo_email})
        if _demo:
            if not _demo.wazuh_token:
                _demo.wazuh_token = _secrets.token_urlsafe(32)
                await _demo.save()
                log.info(
                    "Generated wazuh_token for demo user — configure demo forwarder: WAZUH_WEBHOOK_TOKEN=%s",
                    _demo.wazuh_token,
                )
            # Upsert each project atomically — safe across multiple uvicorn workers
            _js_url = _os.getenv("DEMO_JUICESHOP_URL", "http://localhost:3000")
            _dvwa_url = _os.getenv("DEMO_DVWA_URL", "http://localhost:8080")
            from datetime import datetime, timezone as _tz
            _col = _SocProject.get_motor_collection()
            for _slug, _name, _url, _desc in [
                ("juice-shop", "Juice Shop", _js_url,
                 "OWASP Juice Shop — intentionally vulnerable Node.js e-commerce app"),
                ("dvwa", "DVWA", _dvwa_url,
                 "Damn Vulnerable Web Application — PHP/MySQL training target"),
            ]:
                _result = await _col.update_one(
                    {"owner_id": str(_demo.id), "slug": _slug},
                    {"$setOnInsert": {
                        "owner_id": str(_demo.id),
                        "name": _name,
                        "slug": _slug,
                        "target_url": _url,
                        "description": _desc,
                        "wazuh_agent_registered": False,
                        "wazuh_agent_id": None,
                        "wazuh_agent_name": None,
                        "created_at": datetime.now(_tz.utc),
                    }},
                    upsert=True,
                )
                if _result.upserted_id:
                    log.info("Seeded demo project: %s", _slug)

    # Reset scans stuck in "running" from a previously crashed Celery worker.
    # Without this, the per-user concurrent limit blocks all new scans forever.
    # Also catches scans with null started_at (broken records that would never age out).
    try:
        from datetime import datetime, timezone as _tz, timedelta as _td
        from domains.pentesting.models import Scan as _Scan
        _stale_cutoff = datetime.now(_tz.utc) - _td(hours=2)
        _stale_result = await _Scan.get_motor_collection().update_many(
            {"status": "running", "$or": [
                {"started_at": {"$lt": _stale_cutoff}},
                {"started_at": None},
                {"started_at": {"$exists": False}},
            ]},
            {"$set": {
                "status": "failed",
                "error_message": "Worker crashed — scan reset on startup",
                "completed_at": datetime.now(_tz.utc),
            }},
        )
        if _stale_result.modified_count:
            log.warning(
                "Reset %d stale 'running' scan(s) to 'failed' — Celery worker likely crashed",
                _stale_result.modified_count,
            )
    except Exception as _exc:
        log.warning("Stale scan cleanup failed (non-fatal): %s", _exc)

    # Also reset "pending" scans older than 1 h — Celery dropped the task (worker wasn't running).
    # These block the per-user concurrent limit just as badly as stale "running" scans.
    # Also catches scans with null created_at (broken records that would never age out).
    try:
        from datetime import datetime, timezone as _tz, timedelta as _td
        from domains.pentesting.models import Scan as _Scan
        _pending_cutoff = datetime.now(_tz.utc) - _td(hours=1)
        _pending_result = await _Scan.get_motor_collection().update_many(
            {"status": "pending", "$or": [
                {"created_at": {"$lt": _pending_cutoff}},
                {"created_at": None},
                {"created_at": {"$exists": False}},
            ]},
            {"$set": {
                "status": "failed",
                "error_message": "Task never picked up — Celery worker was not running",
                "completed_at": datetime.now(_tz.utc),
            }},
        )
        if _pending_result.modified_count:
            log.warning(
                "Reset %d stale 'pending' scan(s) to 'failed' — Celery worker was not running",
                _pending_result.modified_count,
            )
    except Exception as _exc:
        log.warning("Stale pending-scan cleanup failed (non-fatal): %s", _exc)

    # Sync Redis scan:active:* counters with actual MongoDB state.
    # If the worker crashed mid-task, the counter may have been left incremented
    # without a matching decrement. This reset ensures new scan creation isn't
    # permanently blocked by a stale count.
    try:
        import redis.asyncio as _aioredis
        from core.config import settings as _cfg
        from domains.pentesting.models import Scan as _Scan
        _redis_sync = _aioredis.from_url(_cfg.app_redis_url, socket_connect_timeout=5)
        try:
            _active_keys = await _redis_sync.keys("scan:active:*")
            if _active_keys:
                await _redis_sync.delete(*_active_keys)
            _agg = [
                {"$match": {"status": {"$in": ["running", "pending"]}}},
                {"$group": {"_id": "$user_id", "count": {"$sum": 1}}},
            ]
            _active_rows = await _Scan.get_motor_collection().aggregate(_agg).to_list(None)
            _total_active = 0
            for _row in _active_rows:
                _uid, _cnt = _row["_id"], _row["count"]
                await _redis_sync.set(f"scan:active:{_uid}", _cnt)
                await _redis_sync.expire(f"scan:active:{_uid}", 5 * 3600)
                _total_active += _cnt
            await _redis_sync.set("scan:active:total", _total_active)
            await _redis_sync.expire("scan:active:total", 5 * 3600)
            log.info("Synced Redis scan:active counters — total active: %d", _total_active)
        finally:
            await _redis_sync.aclose()
    except Exception as _exc:
        log.warning("Redis scan:active counter sync failed (non-fatal): %s", _exc)

    _relay_task = asyncio.create_task(_redis_ws_relay())

    yield

    # Shutdown
    _relay_task.cancel()
    try:
        await _relay_task
    except asyncio.CancelledError:
        pass
    await close_db()
    log.info("Disconnected from MongoDB")


# --------------- App ---------------

app = FastAPI(
    title="Cyber Sentinel API",
    description="Unified Pentesting & SOC Platform",
    version="1.0.1",
    lifespan=lifespan,
)

# --------------- Rate Limiting ---------------

app.state.limiter = limiter


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Return a JSON 429 with Retry-After and X-RateLimit headers."""
    detail_str = str(exc.detail)
    limit_match = re.match(r"(\d+)", detail_str)
    limit_value = limit_match.group(1) if limit_match else "unknown"
    response = JSONResponse(
        status_code=429,
        content={
            "error": "Rate limit exceeded",
            "code": "RATE_LIMITED",
            "detail": detail_str,
        },
    )
    response.headers["Retry-After"] = "60"
    response.headers["X-RateLimit-Limit"] = limit_value
    response.headers["X-RateLimit-Remaining"] = "0"
    return response


app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)

# --------------- CORS ---------------
# Origins are built from FRONTEND_URL + CORS_EXTRA_ORIGINS env vars.
# Wildcards are never permitted. Methods and headers are explicit.

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

# --------------- Request ID + Observability Middleware ---------------

@app.middleware("http")
async def request_id_middleware(request: Request, call_next):
    """Propagate or generate X-Request-ID; bind it to structlog context."""
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())

    # Bind to structlog context so every log line in this request includes trace_id
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        trace_id=request_id,
        service="cyber-sentinel",
    )

    start = _time.monotonic()
    response = await call_next(request)
    duration_s = _time.monotonic() - start

    record_request(
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_s=duration_s,
    )

    log.info(
        "request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=round(duration_s * 1000),
    )

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time-Ms"] = str(round(duration_s * 1000))
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    return response


# --------------- Routers ---------------

from domains.auth.router import router as auth_router
from domains.pentesting.router import router as pentest_router
from domains.soc.router import router as soc_router
from domains.correlation.router import router as correlation_router
from domains.notifications.router import router as notifications_router
from domains.analytics.router import router as analytics_router
from domains.audit.router import router as audit_router
from domains.soc.projects_router import router as soc_projects_router
from domains.search.router import router as search_router

app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(pentest_router, prefix="/api/scans", tags=["Pentesting"])
app.include_router(soc_router, prefix="/api/alerts", tags=["SOC"])
app.include_router(correlation_router, prefix="/api/correlations", tags=["Correlation"])
app.include_router(notifications_router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(analytics_router, tags=["Analytics"])
app.include_router(audit_router, prefix="/api/audit", tags=["Audit"])
app.include_router(soc_projects_router, prefix="/api/soc", tags=["SOC Projects"])
app.include_router(search_router)

# --------------- Health Check ---------------

@app.get("/api/health", tags=["System"])
async def health():
    """
    Component-aware health check. All checks run concurrently (max ~3s total latency).

    Status rules:
      - mongodb or redis down → status="error", HTTP 503 (critical — app cannot function)
      - celery_* or wazuh down → status="degraded", HTTP 200 (reads still work)
      - all ok → status="ok", HTTP 200
    """
    from core.database import get_database

    async def _check_mongodb() -> str:
        try:
            db = get_database()
            await asyncio.wait_for(db.command("ping"), timeout=2.0)
            return "ok"
        except Exception:
            return "down"

    async def _check_redis() -> str:
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.redis_url, socket_connect_timeout=1)
            await asyncio.wait_for(r.ping(), timeout=1.0)
            await r.aclose()
            return "ok"
        except Exception:
            return "down"

    async def _check_celery() -> str:
        try:
            from core.celery_app import celery as _celery
            loop = asyncio.get_event_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(None, lambda: _celery.control.inspect(timeout=3).ping() or {}),
                timeout=4.0,
            )
            return "ok" if result else "down"
        except Exception:
            return "down"

    async def _check_wazuh() -> str:
        if not settings.wazuh_api_password:
            return "not_configured"
        try:
            from domains.soc.wazuh_client import wazuh_client
            reachable = await asyncio.wait_for(wazuh_client.check_reachable(), timeout=2.0)
            return "reachable" if reachable else "unreachable"
        except Exception:
            return "unreachable"

    mongo_s, redis_s, celery_s, wazuh_s = await asyncio.gather(
        _check_mongodb(), _check_redis(), _check_celery(), _check_wazuh(),
    )

    checks = {
        "mongodb": mongo_s,
        "redis": redis_s,
        "celery_pentest": celery_s,
        "celery_soc": celery_s,
        "wazuh": wazuh_s,
    }

    critical_down = mongo_s == "down" or redis_s == "down"
    degraded = celery_s == "down" or wazuh_s == "unreachable"

    if critical_down:
        overall, http_code = "error", 503
    elif degraded:
        overall, http_code = "degraded", 200
    else:
        overall, http_code = "ok", 200

    return JSONResponse(
        status_code=http_code,
        content={
            "status": overall,
            "service": "Cyber Sentinel",
            "version": "1.0.1",
            "uptime_seconds": int(_time.time() - _start_time),
            "checks": checks,
        },
    )


# --------------- Metrics Endpoint (Prometheus scrape) ---------------

@app.get("/api/metrics", tags=["System"], include_in_schema=False)
async def prometheus_metrics():
    """
    Prometheus-compatible metrics endpoint.
    Scrape with Grafana → Prometheus datasource pointed at /api/metrics.
    Returns: http_requests_total, http_request_duration_seconds,
             websocket_connections_active, celery_tasks_total
    """
    body, content_type = metrics_output()
    return Response(content=body, media_type=content_type)


# --------------- Version Endpoint ---------------

@app.get("/api/version", tags=["System"])
async def version():
    """Return current app version and git commit hash."""
    return {"version": _VERSION, "commit": _GIT_SHA}


# --------------- Exception Handlers ---------------

_HTTP_ERROR_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Map typed domain exceptions to structured HTTP responses."""
    log.warning(
        "app_error",
        code=exc.error_code,
        message=exc.message,
        path=request.url.path,
    )
    return JSONResponse(status_code=exc.status_code, content=exc.to_dict())


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Map FastAPI HTTPExceptions to the standard envelope format with trace_id."""
    code = _HTTP_ERROR_CODES.get(exc.status_code, "HTTP_ERROR")
    log.info("http_exception", status=exc.status_code, code=code, path=request.url.path)
    ctx = structlog.contextvars.get_contextvars()
    content: dict = {"error": code, "message": str(exc.detail)}
    if trace_id := ctx.get("trace_id"):
        content["trace_id"] = trace_id
    return JSONResponse(status_code=exc.status_code, content=content)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch any unhandled error and return a clean JSON response."""
    if isinstance(exc, HTTPException):
        raise exc
    log.exception(
        "unhandled_error",
        method=request.method,
        path=request.url.path,
        exc_type=type(exc).__name__,
    )
    ctx = structlog.contextvars.get_contextvars()
    content: dict = {"error": "INTERNAL_ERROR", "message": "An unexpected error occurred"}
    if trace_id := ctx.get("trace_id"):
        content["trace_id"] = trace_id
    return JSONResponse(status_code=500, content=content)


# --------------- WebSocket Endpoint ---------------

@app.websocket("/ws/{channel}")
async def websocket_endpoint(
    websocket: WebSocket,
    channel: str,
    token: str = Query(None),
):
    """
    Generic WebSocket endpoint. Requires a valid JWT via ?token= query param.
    Channels:
        - "scans"  → real-time scan progress updates
        - "alerts" → live Wazuh alert feed
    """
    if not token:
        await websocket.close(code=1008)
        return
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub", "")
    except Exception:
        await websocket.close(code=1008)
        return

    # Scope scan/alert channels to the authenticated user so users only
    # receive their own real-time events (not every other user's).
    if channel in ("scans", "alerts"):
        channel = f"user:{user_id}"

    await ws_manager.connect(websocket, channel)
    WS_ACTIVE.inc()
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(websocket, channel)
        WS_ACTIVE.dec()
