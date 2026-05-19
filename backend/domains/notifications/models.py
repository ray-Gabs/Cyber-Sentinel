# ============================================================
# backend/domains/notifications/models.py — Notification Document (Beanie)
# ============================================================

from datetime import datetime, timezone
from typing import Literal

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, IndexModel

NotificationType = Literal[
    "scan_complete",
    "scan_failed",
    "critical_finding",
    "soc_alert",
    "soc_critical",
    "new_registration",
    "user_approved",
    "user_suspended",
]


class Notification(Document):
    """MongoDB document stored in the 'notifications' collection."""

    user_id: str
    type: NotificationType
    title: str
    body: str | None = None
    scan_id: str | None = None
    scan_target: str | None = None
    severity_summary: dict[str, int] | None = None
    risk_score: float | None = None
    is_read: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "notifications"
        use_state_management = True
        indexes = [
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("is_read", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("is_read", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("created_at", ASCENDING)]),
        ]
