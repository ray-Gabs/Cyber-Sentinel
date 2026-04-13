# ============================================================
# backend/domains/auth/router.py — Auth REST Endpoints
# ============================================================

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status

from core.dependencies import get_current_user
from core.rate_limit import limiter
from core.config import settings
from core.security import create_access_token
from domains.auth.models import User
from domains.auth.schemas import (
    RegisterRequest,
    LoginRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    UpdateProfileRequest,
    UpdateRoleRequest,
    TokenResponse,
    UserResponse,
)
from domains.auth import service
from domains.audit import service as audit_service

router = APIRouter()


@router.post("/register", status_code=201)
@limiter.limit(settings.rate_limit_register)
async def register(request: Request, data: RegisterRequest):
    """Register a new user account — returns pending state awaiting admin approval."""
    user = await service.register_user(data)
    ip = request.client.host if request.client else None
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="user.registered",
        ip_address=ip,
    )
    return {"message": "Registration received — awaiting admin approval", "status": "pending"}


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.rate_limit_login)
async def login(request: Request, data: LoginRequest):
    """Authenticate and receive a JWT access token."""
    result = await service.authenticate_user(data)
    # Audit — look up user for username (fire-and-forget)
    try:
        user = await User.find_one({"$or": [{"username": data.identifier}, {"email": data.identifier}]})
        if user:
            ip = request.client.host if request.client else None
            await audit_service.log_event(
                user_id=str(user.id),
                username=user.username,
                action="user.login",
                ip_address=ip,
            )
    except Exception:
        pass
    return result


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
        status=getattr(user, "status", "active"),
        is_demo=getattr(user, "is_demo", False),
        created_at=user.created_at,
        last_login=user.last_login,
        wazuh_agent_name=user.wazuh_agent_name,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return _user_response(user)


def _require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


# ── Admin: user management ────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
async def list_users(user: User = Depends(get_current_user)):
    """[Admin] List all registered users."""
    _require_admin(user)
    users = await User.find().sort("+created_at").to_list()
    return [_user_response(u) for u in users]


@router.patch("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    data: UpdateRoleRequest,
    user: User = Depends(get_current_user),
):
    """
    [Admin] Change a user's role.

    Roles:
      admin   — full access, sees all scans/alerts, manages users
      analyst — student role, sees only their own scans and linked-agent alerts
      viewer  — read-only, no scan/alert creation
    """
    _require_admin(user)
    from bson import ObjectId
    target = await User.get(ObjectId(user_id))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    old_role = target.role
    target.role = data.role
    await target.save()
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="role.changed",
        resource_type="user",
        resource_id=user_id,
        details=f"{target.username}: {old_role} → {data.role}",
    )
    return _user_response(target)


@router.patch("/users/{user_id}/status", response_model=UserResponse)
async def toggle_user_status(
    user_id: str,
    user: User = Depends(get_current_user),
):
    """[Admin] Activate or deactivate a user account."""
    _require_admin(user)
    from bson import ObjectId
    target = await User.get(ObjectId(user_id))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if str(target.id) == str(user.id):
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    target.is_active = not target.is_active
    await target.save()
    action = "account.activated" if target.is_active else "account.deactivated"
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action=action,
        resource_type="user",
        resource_id=user_id,
        details=f"{target.username} set to {'active' if target.is_active else 'inactive'}",
    )
    return _user_response(target)


@router.patch("/users/{user_id}/approve", response_model=UserResponse)
async def approve_user(user_id: str, user: User = Depends(get_current_user)):
    """[Admin] Approve a pending user account so they can log in."""
    _require_admin(user)
    from bson import ObjectId
    target = await User.get(ObjectId(user_id))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.status = "active"
    target.is_active = True
    target.approved_by = str(user.id)
    target.approved_at = datetime.now(timezone.utc)
    await target.save()
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="user.approved",
        resource_type="user",
        resource_id=user_id,
        details=f"Approved: {target.username}",
    )
    return _user_response(target)


@router.patch("/users/{user_id}/suspend", response_model=UserResponse)
async def suspend_user(user_id: str, user: User = Depends(get_current_user)):
    """[Admin] Suspend an active user account."""
    _require_admin(user)
    from bson import ObjectId
    target = await User.get(ObjectId(user_id))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if str(target.id) == str(user.id):
        raise HTTPException(status_code=400, detail="Cannot suspend your own account")
    target.status = "suspended"
    target.is_active = False
    await target.save()
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="user.suspended",
        resource_type="user",
        resource_id=user_id,
        details=f"Suspended: {target.username}",
    )
    return _user_response(target)


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
