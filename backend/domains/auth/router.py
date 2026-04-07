# ============================================================
# backend/domains/auth/router.py — Auth REST Endpoints
# ============================================================

from fastapi import APIRouter, Depends, Request

from core.dependencies import get_current_user
from core.rate_limit import limiter
from core.config import settings
from domains.auth.models import User
from domains.auth.schemas import (
    RegisterRequest,
    LoginRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    UpdateProfileRequest,
    TokenResponse,
    UserResponse,
)
from domains.auth import service

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit(settings.rate_limit_register)
async def register(request: Request, data: RegisterRequest):
    """Register a new user account."""
    user = await service.register_user(data)
    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.rate_limit_login)
async def login(request: Request, data: LoginRequest):
    """Authenticate and receive a JWT access token."""
    return await service.authenticate_user(data)


@router.post("/forgot-password", status_code=200)
@limiter.limit(settings.rate_limit_forgot_password)
async def forgot_password(request: Request, data: ForgotPasswordRequest):
    """Send a password reset email. Always returns success to prevent user enumeration."""
    await service.request_password_reset(data.email)
    return {"detail": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password", status_code=200)
@limiter.limit("20/hour")
async def reset_password(request: Request, data: ResetPasswordRequest):
    """Reset password using a valid reset token."""
    await service.reset_password(data.token, data.new_password)
    return {"detail": "Password updated successfully. You can now sign in."}


def _user_response(user: User) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
        wazuh_agent_name=user.wazuh_agent_name,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return _user_response(user)


@router.patch("/me", response_model=UserResponse)
async def update_me(data: UpdateProfileRequest, user: User = Depends(get_current_user)):
    """
    Update the current user's profile.

    Link a Wazuh agent to personalise the SOC dashboard:
      - Your alert list will scope to only that agent's alerts.
      - You'll get notified when that agent triggers a medium+ alert.
      - Send wazuh_agent_name="" to unlink.

    The agent name must match exactly what Wazuh shows in its agent list
    (GET /api/alerts/agents). Ask your instructor for your agent name if unsure.
    """
    if data.wazuh_agent_name is not None:
        # Empty string means "unlink"
        user.wazuh_agent_name = data.wazuh_agent_name.strip() or None
        await user.save()
    return _user_response(user)
