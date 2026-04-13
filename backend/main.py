# ============================================================
# backend/main.py — FastAPI Application Entry Point
# ============================================================
# Run with:
#   uvicorn main:app --reload --host 0.0.0.0 --port 8000
# ============================================================

import asyncio
import logging
import re
import time as _time
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from core.config import settings
from core.database import init_db, close_db
from core.rate_limit import limiter
from core.websocket import ws_manager

log = logging.getLogger(__name__)

# Record process start time for uptime reporting
_start_time = _time.time()


# --------------- Lifespan ---------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle events."""
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

    yield

    # Shutdown
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
    allow_methods=["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    max_age=600,
)

# --------------- Request Logging Middleware ---------------

@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = _time.monotonic()
    response = await call_next(request)
    duration_ms = int((_time.monotonic() - start) * 1000)
    log.info(
        "REQUEST method=%s path=%s status=%d duration_ms=%d",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    return response


# --------------- Routers ---------------

from domains.auth.router import router as auth_router
from domains.pentesting.router import router as pentest_router
from domains.soc.router import router as soc_router
from domains.correlation.router import router as correlation_router
from domains.notifications.router import router as notifications_router
from domains.analytics.router import router as analytics_router
from domains.audit.router import router as audit_router

app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(pentest_router, prefix="/api/scans", tags=["Pentesting"])
app.include_router(soc_router, prefix="/api/alerts", tags=["SOC"])
app.include_router(correlation_router, prefix="/api/correlations", tags=["Correlation"])
app.include_router(notifications_router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(analytics_router, tags=["Analytics"])
app.include_router(audit_router, prefix="/api/audit", tags=["Audit"])

# --------------- Health Check ---------------

@app.get("/api/health", tags=["System"])
async def health():
    """
    Dependency-aware health check.
    Returns 200 only when MongoDB and Redis are reachable.
    Returns 503 if any critical dependency is down (used by UptimeRobot / load balancers).
    """
    from core.database import get_database

    dep_status: dict[str, str] = {}
    all_ok = True

    # Check MongoDB
    try:
        db = get_database()
        await asyncio.wait_for(db.command("ping"), timeout=2.0)
        dep_status["mongodb"] = "ok"
    except Exception:
        dep_status["mongodb"] = "down"
        all_ok = False

    # Check Redis
    try:
        import redis.asyncio as aioredis
        r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
        await asyncio.wait_for(r.ping(), timeout=2.0)
        await r.aclose()
        dep_status["redis"] = "ok"
    except Exception:
        dep_status["redis"] = "down"
        all_ok = False

    return JSONResponse(
        status_code=200 if all_ok else 503,
        content={
            "status": "ok" if all_ok else "degraded",
            "service": "Cyber Sentinel",
            "version": "1.0.1",
            "uptime_seconds": int(_time.time() - _start_time),
            **dep_status,
        },
    )


# --------------- Version Endpoint ---------------

@app.get("/api/version", tags=["System"])
async def version():
    """Return current app version and git commit hash."""
    import subprocess
    try:
        commit = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            text=True,
        ).strip()
    except Exception:
        commit = "unknown"

    version_str = "1.0.1"
    try:
        import pathlib
        version_file = pathlib.Path(__file__).parent.parent / "VERSION"
        if version_file.exists():
            version_str = version_file.read_text().strip()
    except Exception:
        pass

    return {"version": version_str, "commit": commit}


# --------------- Global Error Handler ---------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch any unhandled error and return a clean JSON response."""
    # HTTPExceptions are already handled by FastAPI — this catches everything else
    if isinstance(exc, HTTPException):
        raise exc
    log.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "code": "INTERNAL_ERROR",
        },
    )


# --------------- WebSocket Endpoint ---------------

@app.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str):
    """
    Generic WebSocket endpoint.
    Channels:
        - "scans"  → real-time scan progress updates
        - "alerts" → live Wazuh alert feed
    """
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            # Keep connection alive — client can send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, channel)
