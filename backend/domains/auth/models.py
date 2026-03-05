# ============================================================
# backend/domains/auth/models.py — User Document Model (Beanie)
# ============================================================

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field, field_validator
from pymongo import ASCENDING, IndexModel


class User(Document):
    """MongoDB document stored in the 'users' collection."""

    username: str = Field(..., min_length=3, max_length=32)
    email: str  # Loose validation — allows internal domains like .local, .lab, .test

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or v.startswith("@") or v.endswith("@"):
            raise ValueError("Invalid email address")
        return v
    hashed_password: str
    role: str = Field(default="viewer")    # admin | analyst | viewer
    # Default is viewer — instructor promotes to analyst via PATCH /api/auth/users/{id}/role
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None

    # Password reset (single-use token stored as SHA-256 hash)
    password_reset_token_hash: Optional[str] = None
    password_reset_expires: Optional[datetime] = None

    # Registration approval flow
    status: str = Field(default="active")   # "pending" | "active" | "suspended"
    is_demo: bool = False
    approved_by: Optional[str] = None       # user_id of admin who approved
    approved_at: Optional[datetime] = None

    # Wazuh agent binding — links this user to a specific Wazuh agent so the SOC
    # dashboard scopes to their alerts only. Set by the student via PATCH /api/auth/me.
    # Matches the "name" field Wazuh uses when the agent registers (e.g. "alice-laptop").
    # Admin role ignores this filter and always sees all alerts.
    wazuh_agent_name: Optional[str] = None

    # Multi-tenant Wazuh integration (professor's recommendation)
    wazuh_token: Optional[str] = None          # Per-user forwarder token (secrets.token_urlsafe)
    wazuh_min_level: int = 3                   # Per-user minimum alert level (0–15)
    wazuh_agent_group: Optional[str] = None    # Wazuh agent group, e.g. "tenant_juiceshop"

    # Per-user notification preferences
    notification_prefs: dict = Field(default_factory=lambda: {
        "min_alert_level": 7,
        "notify_scan_complete": True,
        "notify_scan_failed": True,
        "notify_critical_finding": True,
        "notify_soc_critical": True,
        "notify_new_registration": True,
    })

    class Settings:
        name = "users"                     # MongoDB collection name
        use_state_management = True        # Track changes for .save()
        indexes = [
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("username", ASCENDING)], unique=True),
            IndexModel([("password_reset_token_hash", ASCENDING)], sparse=True),
            IndexModel([("wazuh_agent_name", ASCENDING)], sparse=True),
            IndexModel(
                [("wazuh_token", ASCENDING)],
                unique=True,
                partialFilterExpression={"wazuh_token": {"$type": "string"}},
            ),
            IndexModel([("status", ASCENDING)]),
        ]

    class Config:
        json_schema_extra = {
            "example": {
                "username": "jdoe",
                "email": "jdoe@example.com",
                "role": "analyst",
                "is_active": True,
            }
        }
