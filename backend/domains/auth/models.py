# ============================================================
# backend/domains/auth/models.py — User Document Model (Beanie)
# ============================================================

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field, EmailStr
from pymongo import ASCENDING, IndexModel


class User(Document):
    """MongoDB document stored in the 'users' collection."""

    username: str = Field(..., min_length=3, max_length=32)
    email: EmailStr
    hashed_password: str
    role: str = Field(default="analyst")   # admin | analyst | viewer
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_login: Optional[datetime] = None

    # Password reset (single-use token stored as SHA-256 hash)
    password_reset_token_hash: Optional[str] = None
    password_reset_expires: Optional[datetime] = None

    class Settings:
        name = "users"                     # MongoDB collection name
        use_state_management = True        # Track changes for .save()
        indexes = [
            IndexModel([("email", ASCENDING)], unique=True),
            IndexModel([("username", ASCENDING)], unique=True),
            IndexModel([("password_reset_token_hash", ASCENDING)], sparse=True),
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
