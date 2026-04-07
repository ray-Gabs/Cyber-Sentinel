# ============================================================
# backend/domains/audit/models.py — Audit Log Document (Beanie)
# ============================================================
# Broad event trail — one document per user action.
# Intentionally lean: no per-step granularity to avoid overcluttering.
# Covers: auth events, scan lifecycle, role/account changes, SOC events.
# ============================================================

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field
from pymongo import ASCENDING, DESCENDING, IndexModel


class AuditLog(Document):
    """MongoDB document stored in the 'audit_logs' collection."""

    user_id: str
    username: str
    action: str             # "user.login" | "user.registered" | "user.logout"
                            # "scan.created" | "scan.deleted" | "scan.cancelled"
                            # "role.changed" | "account.activated" | "account.deactivated"
                            # "alert.received" | "alert.triaged"
    resource_type: Optional[str] = None   # "scan" | "user" | "alert" | "report"
    resource_id: Optional[str] = None     # MongoDB ID of the affected resource
    details: Optional[str] = None         # Human-readable summary (≤ 200 chars)
    ip_address: Optional[str] = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "audit_logs"
        use_state_management = True
        indexes = [
            IndexModel([("timestamp", DESCENDING)]),
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("action", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("timestamp", DESCENDING)]),
        ]
