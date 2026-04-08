# ============================================================
# backend/core/rate_limit.py — Centralised Rate Limiter
# ============================================================
# Uses slowapi (backed by Redis) so limits are shared across
# all Celery/uvicorn workers — accurate in multi-process setups.
#
# Usage in routers:
#   from fastapi import Request
#   from core.rate_limit import limiter
#
#   @router.post("/login")
#   @limiter.limit("10/minute")
#   async def login(request: Request, data: LoginRequest):
#       ...
#
# The `request: Request` parameter MUST be present for slowapi
# to extract the client IP — add it even if you don't use it.
# ============================================================

from slowapi import Limiter
from slowapi.util import get_remote_address

from core.config import settings

# Redis-backed limiter — shared across all workers/processes.
# Falls back to in-memory if Redis is unavailable (development only).
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=[],
)
