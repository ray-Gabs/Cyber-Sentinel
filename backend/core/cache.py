# ============================================================
# backend/core/cache.py — Redis Cache Primitives
# ============================================================
# Provides cache_get / cache_set / cache_invalidate for any
# async function that returns JSON-serializable data.
#
# All functions silently degrade — a Redis outage never breaks
# the endpoint, it just returns uncached results.
#
# Naming convention for cache keys:
#   cs:cache:<domain>:<endpoint>:<discriminator>
# Examples:
#   cs:cache:analytics:admin-stats:30d
#   cs:cache:analytics:user-stats:user_id:30d
#   cs:cache:soc:alert-stats:tenant_id
# ============================================================

import json
import logging
from typing import Any

import redis.asyncio as aioredis

from core.config import settings

log = logging.getLogger(__name__)

_redis: aioredis.Redis | None = None

# ---- TTL constants (seconds) -----------------------------------------------
# These are the defaults — individual call sites can override.

TTL_REALTIME  = 10    # Alert list, scan status — near-realtime data
TTL_FAST      = 30    # Scan list, notification counts
TTL_STANDARD  = 60    # Analytics overviews, admin KPIs
TTL_SLOW      = 300   # Rarely-changing aggregates (all-time totals)
TTL_STATIC    = 3600  # Config-like data (detection rules list)

# ----------------------------------------------------------------------------


def _get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
        )
    return _redis


async def cache_get(key: str) -> Any | None:
    """
    Fetch a cached value. Returns None on cache miss OR Redis error.
    Never raises — callers should treat None as "compute the value".
    """
    try:
        raw = await _get_redis().get(key)
        return json.loads(raw) if raw is not None else None
    except Exception as exc:
        log.debug("cache_get miss key=%s error=%s", key, exc)
        return None


async def cache_set(key: str, value: Any, ttl: int = TTL_STANDARD) -> None:
    """
    Store a value as JSON with an expiry. Silently ignores Redis errors.
    Non-serializable values are coerced via default=str.
    """
    try:
        await _get_redis().setex(key, ttl, json.dumps(value, default=str))
    except Exception as exc:
        log.debug("cache_set error key=%s error=%s", key, exc)


async def cache_invalidate(pattern: str) -> int:
    """
    Delete all keys matching a glob pattern (e.g. "cs:cache:analytics:*").
    Returns the number of keys deleted. Silently ignores Redis errors.
    """
    try:
        r = _get_redis()
        keys = await r.keys(pattern)
        if keys:
            deleted = await r.delete(*keys)
            log.debug("cache_invalidate pattern=%s deleted=%d", pattern, deleted)
            return deleted
    except Exception as exc:
        log.debug("cache_invalidate error pattern=%s error=%s", pattern, exc)
    return 0


async def cache_invalidate_analytics() -> None:
    """Invalidate all analytics caches — call after new scan or alert is created."""
    await cache_invalidate("cs:cache:analytics:*")


async def cache_invalidate_user(user_id: str) -> None:
    """Invalidate all caches scoped to a specific user."""
    await cache_invalidate(f"cs:cache:*:{user_id}:*")
