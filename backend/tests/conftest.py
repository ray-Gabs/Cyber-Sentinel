"""Shared test fixtures for Cyber Sentinel integration tests.

Sets required env vars at module level (before any app import) so config.py
validation passes. Replaces the Redis-backed rate limiter with an in-memory
one and swaps out the heavy lifespan (DB/Redis init) with a no-op so tests
run without live infrastructure.
"""
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest

# ── Environment setup (MUST precede all app imports) ──────────────────────────
os.environ["JWT_SECRET"] = "cs-pytest-secret-must-be-at-least-32-chars-xxxxxxxx"
os.environ.setdefault("AI_PROVIDER", "groq")
os.environ.setdefault("GROQ_API_KEY", "test-key-not-used-in-tests")
os.environ.setdefault("MONGODB_URI", "mongodb://localhost:27017")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("APP_REDIS_URL", "redis://localhost:6379/2")
# Fix UnicodeEncodeError from structlog ANSI codes on Windows cp1252 consoles
os.environ.setdefault("PYTHONIOENCODING", "utf-8")

# Add backend/ dir to sys.path so bare `from core.x import y` works in tests
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)


# ── App fixture ───────────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def app():
    """FastAPI app configured for testing: in-memory rate limiter, no-op lifespan."""
    from slowapi import Limiter
    from slowapi.util import get_remote_address

    import core.rate_limit as _rl

    # Swap Redis-backed limiter with in-memory so tests don't need a Redis server
    _mem_limiter = Limiter(key_func=get_remote_address)
    _rl.limiter = _mem_limiter

    from main import app as _app

    # Force the app to use in-memory limiter immediately (before TestClient runs
    # the lifespan). This prevents any pre-lifespan middleware from using Redis.
    _app.state.limiter = _mem_limiter

    # Replace the heavy startup/shutdown lifespan with a lightweight no-op.
    # app.router.lifespan_context is the internal slot Starlette reads at startup.
    @asynccontextmanager
    async def _test_lifespan(a):
        a.state.limiter = _mem_limiter
        yield

    _app.router.lifespan_context = _test_lifespan
    return _app


@pytest.fixture(scope="session")
def client(app):
    """Starlette TestClient wrapping the test app (synchronous ASGI transport)."""
    from fastapi.testclient import TestClient
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ── Auth helpers ──────────────────────────────────────────────────────────────

def make_token(
    user_id: str = "507f1f77bcf86cd799439011",
    role: str = "analyst",
    username: str = "testuser",
) -> str:
    """Return a signed JWT for use in test requests."""
    from core.security import create_access_token
    return create_access_token({"sub": user_id, "role": role, "username": username})


def make_mock_user(
    user_id: str = "507f1f77bcf86cd799439011",
    role: str = "analyst",
    username: str = "testuser",
):
    """Return a mock User object accepted by get_current_user and UserResponse."""
    user = MagicMock()
    user.id = user_id
    user.role = role
    user.username = username
    user.email = f"{username}@test.local"
    user.is_active = True
    user.status = "active"
    user.is_demo = False
    user.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
    user.last_login = None
    user.wazuh_agent_name = None
    user.wazuh_agent_group = None
    user.wazuh_token = None
    return user
