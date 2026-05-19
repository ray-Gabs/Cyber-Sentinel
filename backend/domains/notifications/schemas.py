# ============================================================
# backend/domains/notifications/schemas.py — Pydantic Schemas
# ============================================================

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

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


class NotificationOut(BaseModel):
    id: str
    user_id: str
    type: NotificationType
    title: str
    body: str | None = None
    scan_id: str | None = None
    scan_target: str | None = None
    severity_summary: dict[str, int] | None = None
    risk_score: float | None = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
