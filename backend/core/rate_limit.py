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

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

from core.config import settings


def get_user_or_ip_key(request: Request) -> str:
    """Per-user rate limiting for authenticated routes.

    Extracts the user_id from the Bearer JWT so every user has their own
    bucket — preventing one user (or one IP behind NAT) from exhausting
    a shared limit.  Falls back to the client IP when no valid token is
    present (covers public / unauthenticated endpoints automatically).
    """
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        try:
            from core.security import decode_access_token
            payload = decode_access_token(auth[7:])
            uid = payload.get("sub")
            if uid:
                return f"user:{uid}"
        except Exception:  # noqa: S110 — token decode failure falls back to IP-based rate limiting
            pass
    return get_remote_address(request)


# Redis-backed limiter — shared across all workers/processes.
# Falls back to in-memory if Redis is unavailable (development only).
# default key_func = IP — use get_user_or_ip_key on authenticated routes.
limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.redis_url,
    default_limits=[],
)
