# ============================================================
# backend/domains/auth/router.py — Auth REST Endpoints
# ============================================================

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from pydantic import BaseModel, Field

from core.config import settings
from core.dependencies import get_current_user
from core.rate_limit import get_user_or_ip_key, limiter
from core.security import create_access_token, create_refresh_token, decode_refresh_token
from domains.audit import service as audit_service
from domains.auth import service
from domains.auth.models import User
from domains.auth.schemas import (
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
    UpdateProfileRequest,
    UpdateRoleRequest,
    UserResponse,
)
from domains.notifications import service as notif_service
from domains.soc.project_models import SocProject

log = logging.getLogger(__name__)


class NotificationPrefsUpdate(BaseModel):
    """Typed schema for notification preference updates — prevents raw dict injection."""
    email_alerts: bool | None = None
    email_digest: bool | None = None
    push_alerts: bool | None = None
    alert_severity_threshold: str | None = Field(None, pattern="^(critical|high|medium|low|all)$")
    digest_frequency: str | None = Field(None, pattern="^(realtime|hourly|daily|weekly)$")

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
    # Notify all admin users of the new registration
    try:
        admins = await User.find(User.role == "admin").limit(500).to_list()
        for admin in admins:
            await notif_service.create_notification(
                user_id=str(admin.id),
                type="new_registration",
                title=f"New registration: {user.username}",
                body=f"{user.email} is awaiting admin approval",
            )
    except Exception as exc:
        log.debug("admin notification failed on registration: %s", exc)
    return {"message": "Registration received — awaiting admin approval", "status": "pending"}


@router.post("/logout", status_code=200)
async def logout(request: Request, response: Response):
    """Clear the session cookie. No auth required — just wipe the token."""
    _is_https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto", "").lower() == "https"
    )
    response.delete_cookie(
        key="access_token", path="/", httponly=True, samesite="strict", secure=_is_https
    )
    return {"detail": "Logged out"}


@router.post("/refresh")
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def refresh_access_token(request: Request, response: Response):
    """
    Issue a new access token from a valid refresh token cookie.
    The refresh cookie is scoped to this path so it is never sent to other endpoints.
    """
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token")
    try:
        import jwt as _jwt
        user_id = decode_refresh_token(refresh_token)
    except (_jwt.PyJWTError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token") from exc

    from bson import ObjectId
    try:
        user = await User.get(ObjectId(user_id))
    except Exception:
        user = None
    if not user or not getattr(user, "is_active", True):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    new_token = create_access_token({"sub": str(user.id), "role": user.role, "username": user.username})
    _is_https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto", "").lower() == "https"
    )
    response.set_cookie(
        key="access_token",
        value=new_token,
        httponly=True,
        secure=_is_https,
        samesite="strict",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )
    return {"access_token": new_token, "token_type": "bearer"}


@router.post("/login", response_model=TokenResponse)
@limiter.limit(settings.rate_limit_login)
async def login(request: Request, response: Response, data: LoginRequest):
    """Authenticate and receive a JWT, delivered as an HttpOnly session cookie."""
    ip = request.client.host if request.client else None
    try:
        result = await service.authenticate_user(data)
    except HTTPException as exc:
        # Audit failed attempts (401 only — 429 lockout is already recorded by the lockout helper)
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            try:
                masked = data.identifier[:3] + "***"
                await audit_service.log_event(
                    user_id="unknown",
                    username=masked,
                    action="user.login_failed",
                    ip_address=ip,
                    details=f"Invalid credentials for: {masked}",
                )
            except Exception as audit_exc:
                log.debug("audit log failed on login failure: %s", audit_exc)
        raise

    # Audit successful login — look up user for real user_id
    try:
        user = await User.find_one({"$or": [{"username": data.identifier}, {"email": data.identifier}]})
        if user:
            await audit_service.log_event(
                user_id=str(user.id),
                username=user.username,
                action="user.login",
                ip_address=ip,
                details="Authentication successful",
            )
    except Exception as exc:
        log.debug("audit log failed on login: %s", exc)

    _is_https = (
        request.url.scheme == "https"
        or request.headers.get("x-forwarded-proto", "").lower() == "https"
    )
    response.set_cookie(
        key="access_token",
        value=result.access_token,
        httponly=True,
        secure=_is_https,
        samesite="strict",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )
    # Refresh token — longer-lived, separate cookie, only sent to /api/auth/refresh
    if user:
        refresh = create_refresh_token(str(user.id))
        response.set_cookie(
            key="refresh_token",
            value=refresh,
            httponly=True,
            secure=_is_https,
            samesite="strict",
            max_age=7 * 24 * 60 * 60,  # 7 days
            path="/api/auth/refresh",
        )
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
        wazuh_agent_group=getattr(user, "wazuh_agent_group", None),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return _user_response(user)


@router.get("/me/prefs")
async def get_prefs(user: User = Depends(get_current_user)):
    """Return the current user's notification preferences."""
    return getattr(user, "notification_prefs", {})


@router.patch("/me/prefs")
async def update_prefs(
    prefs: NotificationPrefsUpdate,
    user: User = Depends(get_current_user),
):
    """Update the current user's notification preferences (partial update)."""
    existing = dict(getattr(user, "notification_prefs", {}))
    existing.update({k: v for k, v in prefs.model_dump(exclude_none=True).items()})
    user.notification_prefs = existing
    await user.save()
    return user.notification_prefs


def _require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


# ── Admin: user management ────────────────────────────────────────────────────

@router.get("/users", response_model=list[UserResponse])
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=200),
    user: User = Depends(get_current_user),
):
    """[Admin] List all registered users, paginated."""
    _require_admin(user)
    users = await User.find().sort("+created_at").skip((page - 1) * size).limit(size).to_list()
    return [_user_response(u) for u in users]


@router.patch("/users/{user_id}/role", response_model=UserResponse)
@limiter.limit("20/minute", key_func=get_user_or_ip_key)
async def update_user_role(
    request: Request,
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
@limiter.limit("20/minute", key_func=get_user_or_ip_key)
async def toggle_user_status(
    request: Request,
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
@limiter.limit("20/minute", key_func=get_user_or_ip_key)
async def approve_user(request: Request, user_id: str, user: User = Depends(get_current_user)):
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
    try:
        await notif_service.create_notification(
            user_id=str(target.id),
            type="user_approved",
            title="Account approved",
            body="Your account has been approved. You can now log in.",
        )
    except Exception as exc:
        log.debug("approval notification failed for user %s: %s", user_id, exc)
    return _user_response(target)


@router.patch("/users/{user_id}/suspend", response_model=UserResponse)
@limiter.limit("20/minute", key_func=get_user_or_ip_key)
async def suspend_user(request: Request, user_id: str, user: User = Depends(get_current_user)):
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
    try:
        await notif_service.create_notification(
            user_id=str(target.id),
            type="user_suspended",
            title="Account suspended",
            body="Your account has been suspended. Contact an administrator.",
        )
    except Exception as exc:
        log.warning("suspension notification failed for user %s: %s", str(target.id), exc)
    return _user_response(target)


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, user: User = Depends(get_current_user)):
    """[Admin] Permanently delete a user account and all associated resources."""
    _require_admin(user)
    from bson import ObjectId
    target = await User.get(ObjectId(user_id))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if str(target.id) == str(user.id):
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if target.role == "admin":
        admin_count = await User.find({"role": "admin"}).count()
        if admin_count <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin account")
    # Cascade delete all user-owned resources
    from domains.notifications.models import Notification
    from domains.pentesting.models import Scan, ScheduledScan
    from domains.soc.models import CustomDetectionRule
    from domains.soc.project_models import SocProject
    await Scan.find({"user_id": user_id}).delete()
    await ScheduledScan.find({"user_id": user_id}).delete()
    await SocProject.find({"owner_id": user_id}).delete()
    await CustomDetectionRule.find({"user_id": user_id}).delete()
    await Notification.find({"user_id": user_id}).delete()
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="user.deleted",
        resource_type="user",
        resource_id=user_id,
        details=f"Deleted: {target.username} ({target.email})",
    )
    await target.delete()


@router.get("/users/{user_id}/agent-configs")
async def get_user_agent_configs(user_id: str, user: User = Depends(get_current_user)):
    """[Admin] List all SOC projects belonging to a user, with Wazuh agent info."""
    _require_admin(user)
    from bson import ObjectId
    target = await User.get(ObjectId(user_id))
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    projects = await SocProject.find(SocProject.owner_id == user_id).to_list()
    return [
        {
            "project_id": str(p.id),
            "project_name": p.name,
            "slug": p.slug,
            "wazuh_agent_name": p.wazuh_agent_name,
            "wazuh_agent_registered": p.wazuh_agent_registered,
        }
        for p in projects
    ]


@router.patch("/me/password", status_code=200)
async def change_password(data: ChangePasswordRequest, user: User = Depends(get_current_user)):
    """Change the current user's password. Requires the existing password for verification."""
    from core.security import hash_password, verify_password
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Current password is incorrect",
        )
    user.hashed_password = hash_password(data.new_password)
    await user.save()
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="user.password_changed",
        resource_type="user",
        resource_id=str(user.id),
    )
    return {"detail": "Password updated successfully"}


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
