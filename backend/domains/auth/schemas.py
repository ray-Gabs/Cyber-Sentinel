# ============================================================
# backend/domains/auth/schemas.py — Pydantic Request/Response Schemas
# ============================================================
# These are NOT stored in the DB. They validate HTTP request bodies
# and shape HTTP response bodies.
# ============================================================

from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional


# --------------- Requests ---------------

class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=32)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class LoginRequest(BaseModel):
    """Accepts either username or email + password."""
    identifier: str = Field(..., min_length=1, description="Username or email address")
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


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

    class Config:
        from_attributes = True
