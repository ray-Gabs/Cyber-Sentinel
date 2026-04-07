# ============================================================
# backend/domains/auth/schemas.py — Pydantic Request/Response Schemas
# ============================================================
# These are NOT stored in the DB. They validate HTTP request bodies
# and shape HTTP response bodies.
# ============================================================

from pydantic import BaseModel, Field, field_validator
from datetime import datetime
from typing import Optional


def _validate_email(v: str) -> str:
    """Loose email check — allows internal domains (.local, .lab, .test, etc.)."""
    v = v.strip().lower()
    if "@" not in v or v.startswith("@") or v.endswith("@"):
        raise ValueError("Invalid email address")
    return v


# --------------- Requests ---------------

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email(v)

    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """Accepts either username or email + password."""
    identifier: str = Field(..., min_length=1, description="Username or email address")
    password: str


class ForgotPasswordRequest(BaseModel):
    email: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email(v)


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


VALID_ROLES = {"admin", "analyst", "viewer"}


class UpdateRoleRequest(BaseModel):
    """Admin-only: change a user's role."""
    role: str = Field(..., description="admin | analyst | viewer")

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f"role must be one of: {', '.join(sorted(VALID_ROLES))}")
        return v


class UpdateProfileRequest(BaseModel):
    """
    Update mutable profile fields for the current user.

    wazuh_agent_name: the exact agent name shown in Wazuh Manager
    (e.g. 'alice-laptop'). Once set, your SOC view scopes to only
    that agent's alerts. Clear by sending an empty string "".
    """
    wazuh_agent_name: Optional[str] = Field(
        None,
        max_length=128,
        description="Wazuh agent name to link (matches 'name' in Wazuh agent list). Empty string unlinks.",
    )


# --------------- Responses ---------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """Safe user object (no password hash)."""
    id: str
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    wazuh_agent_name: Optional[str] = None

    class Config:
        from_attributes = True
