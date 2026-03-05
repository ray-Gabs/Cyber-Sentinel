# ============================================================
# backend/domains/notifications/schemas.py — Pydantic Schemas
# ============================================================

from datetime import datetime
from typing import Literal, Optional

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
    body: Optional[str] = None
    scan_id: Optional[str] = None
    scan_target: Optional[str] = None
    severity_summary: Optional[dict[str, int]] = None
    risk_score: Optional[float] = None
    is_read: bool
    created_at: datetime

    model_config = {"from_attributes": True}
