# ============================================================
# backend/domains/auth/schemas.py — Pydantic Request/Response Schemas
# ============================================================
# These are NOT stored in the DB. They validate HTTP request bodies
# and shape HTTP response bodies.
# ============================================================

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


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
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        v = v.strip()
        import re as _re
        if not _re.fullmatch(r"[A-Za-z0-9_.\-]+", v):
            raise ValueError("Username may only contain letters, numbers, underscores, dots, and hyphens")
        return v

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        return _validate_email(v)


class LoginRequest(BaseModel):
    """Accepts either username or email + password."""
    identifier: str = Field(..., min_length=1, max_length=256, description="Username or email address")
    password: str = Field(..., max_length=128)


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
    wazuh_agent_name: str | None = Field(
        None,
        max_length=128,
        description="Wazuh agent name to link (matches 'name' in Wazuh agent list). Empty string unlinks.",
    )


class ChangePasswordRequest(BaseModel):
    """Change the current user's password (requires the current password for verification)."""
    current_password: str = Field(..., description="The user's current password")
    new_password: str = Field(..., min_length=8, max_length=128, description="New password (min 8 characters)")


# --------------- Responses ---------------

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"  # noqa: S105


class UserResponse(BaseModel):
    """Safe user object (no password hash)."""
    id: str
    username: str
    email: str
    role: str
    is_active: bool
    status: str = "active"
    is_demo: bool = False
    created_at: datetime
    last_login: datetime | None = None
    wazuh_agent_name: str | None = None
    wazuh_agent_group: str | None = None

    class Config:
        from_attributes = True
