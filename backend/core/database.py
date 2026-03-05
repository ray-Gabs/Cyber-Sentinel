# ============================================================
# backend/core/database.py — MongoDB Connection (Motor + Beanie)
# ============================================================

from motor.motor_asyncio import AsyncIOMotorClient
from beanie import init_beanie

from core.config import settings

# Global client reference (used for health checks, shutdown, etc.)
_client: AsyncIOMotorClient | None = None


async def init_db() -> None:
    """
    Initialise the MongoDB connection and register all Beanie document models.
    Call this once during FastAPI lifespan startup.
    """
    global _client
    _client = AsyncIOMotorClient(settings.mongodb_uri)
    database = _client[settings.mongodb_db_name]

    # Import all document models here so Beanie registers them.
    from domains.auth.models import User
    from domains.pentesting.models import Scan
    from domains.soc.models import Alert, AiVerdict

    await init_beanie(
        database=database,
        document_models=[
            User,
            Scan,
            Alert,
            AiVerdict,
        ],
    )


async def close_db() -> None:
    """Close the Motor client on shutdown."""
    global _client
    if _client:
        _client.close()
        _client = None


def get_database():
    """Return the raw Motor database object (for ad-hoc queries)."""
    if _client is None:
        raise RuntimeError("Database not initialised. Call init_db() first.")
    return _client[settings.mongodb_db_name]
