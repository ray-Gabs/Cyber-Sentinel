# ============================================================
# backend/core/database.py — MongoDB Connection (Motor + Beanie)
# ============================================================

import certifi
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient

from core.config import settings

# Global client reference (used for health checks, shutdown, etc.)
_client: AsyncIOMotorClient | None = None


async def init_db() -> None:
    """
    Initialise the MongoDB connection and register all Beanie document models.
    Safe to call multiple times — subsequent calls are no-ops if already initialised.
    """
    global _client
    if _client is not None:
        return  # Already initialised — Beanie document models are already registered

    # Only use TLS/SSL certifi bundle for Atlas (mongodb+srv) connections
    if settings.mongodb_uri.startswith("mongodb+srv"):
        _client = AsyncIOMotorClient(settings.mongodb_uri, tlsCAFile=certifi.where())
    else:
        _client = AsyncIOMotorClient(settings.mongodb_uri)
    database = _client[settings.mongodb_db_name]

    # Import all document models here so Beanie registers them.
    from domains.audit.models import AuditLog
    from domains.auth.models import User
    from domains.correlation.models import Correlation
    from domains.notifications.models import Notification
    from domains.pentesting.models import Scan, ScheduledScan
    from domains.soc.models import AiVerdict, Alert, CustomDetectionRule
    from domains.soc.playbook import PlaybookExecution
    from domains.soc.project_models import SocProject
    from domains.soc.tuning_models import TuningRecommendation

    await init_beanie(
        database=database,
        document_models=[
            User,
            Scan,
            Alert,
            AiVerdict,
            CustomDetectionRule,
            SocProject,
            TuningRecommendation,
            Correlation,
            PlaybookExecution,
            Notification,
            AuditLog,
            ScheduledScan,
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
