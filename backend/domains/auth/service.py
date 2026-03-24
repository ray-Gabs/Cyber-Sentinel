# ============================================================
# backend/domains/auth/service.py — Auth Business Logic
# ============================================================

import logging
from datetime import datetime, timezone, timedelta

from fastapi import HTTPException, status
from jose import JWTError

from core.config import settings
from core.email_service import send_email
from core.security import hash_password, verify_password, create_access_token, decode_access_token
from domains.auth.models import User
from domains.auth.schemas import RegisterRequest, LoginRequest, TokenResponse

log = logging.getLogger(__name__)


async def register_user(data: RegisterRequest) -> User:
    """
    Create a new user. Raises 409 if username or email already exists.
    """
    # Check for duplicates
    existing = await User.find_one(
        {"$or": [{"username": data.username}, {"email": data.email}]}
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username or email already registered",
        )

    user = User(
        username=data.username,
        email=data.email,
        hashed_password=hash_password(data.password),
    )
    await user.insert()

    # Welcome email — non-blocking; registration succeeds even if email fails
    try:
        await send_email(
            to=user.email,
            subject="Welcome to Cyber Sentinel",
            template="welcome.html",
            context={
                "username": user.username,
                "dashboard_url": settings.frontend_url,
            },
            plain_text=(
                f"Hi {user.username},\n\n"
                f"Your Cyber Sentinel account is ready. "
                f"Visit {settings.frontend_url} to get started.\n\n"
                f"— Cyber Sentinel"
            ),
        )
    except Exception as e:
        log.warning("Welcome email not sent to %s: %s", user.email, e)

    return user


async def authenticate_user(data: LoginRequest) -> TokenResponse:
    """
    Verify credentials and return a JWT.
    Raises 401 on bad username or password.
    """
    user = await User.find_one({"username": data.username})
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # Update last_login timestamp
    user.last_login = datetime.now(timezone.utc)
    await user.save()

    token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token)


# --------------- Password Reset ---------------

def _create_reset_token(user_id: str) -> str:
    """Create a short-lived JWT for password reset (15 min)."""
    return create_access_token(
        data={"sub": user_id, "purpose": "password_reset"},
        expires_delta=timedelta(minutes=15),
    )


async def _send_reset_email(to_email: str, username: str, reset_url: str) -> None:
    """Send the password reset email. Raises HTTP 503/502 on failure."""
    plain_text = (
        f"Hi {username},\n\n"
        f"Reset your Cyber Sentinel password (expires in 15 minutes):\n{reset_url}\n\n"
        f"If you didn't request this, ignore this email — your password is unchanged.\n\n"
        f"— Cyber Sentinel"
    )
    try:
        await send_email(
            to=to_email,
            subject="Reset your Cyber Sentinel password",
            template="reset_password.html",
            context={"username": username, "reset_url": reset_url},
            plain_text=plain_text,
        )
    except RuntimeError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service is not configured. Contact your administrator.",
        )
    except Exception as e:
        log.error("Failed to send reset email to %s: %s", to_email, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send reset email. Try again later.",
        )


async def request_password_reset(email: str) -> None:
    """
    Generate a reset token and email it.
    Always returns success (even if email not found) to prevent user enumeration.
    """
    user = await User.find_one({"email": email})
    if not user:
        return  # Silent — don't reveal whether email exists

    token = _create_reset_token(str(user.id))
    reset_url = f"{settings.frontend_url}/reset-password?token={token}"
    await _send_reset_email(user.email, user.username, reset_url)


async def reset_password(token: str, new_password: str) -> None:
    """Validate the reset token and update the user's password."""
    try:
        payload = decode_access_token(token)
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset link. Please request a new one.",
        )

    if payload.get("purpose") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid reset token.",
        )

    user = await User.get(payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    user.hashed_password = hash_password(new_password)
    await user.save()

    # Password-changed security notification — non-blocking
    changed_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    try:
        await send_email(
            to=user.email,
            subject="Security Alert — Your Cyber Sentinel Password Was Changed",
            template="change_password.html",
            context={
                "username": user.username,
                "changed_at": changed_at,
                "dashboard_url": settings.frontend_url,
                "support_url": settings.frontend_url,
            },
            plain_text=(
                f"Hi {user.username},\n\n"
                f"Your Cyber Sentinel password was changed at {changed_at}.\n\n"
                f"If you didn't do this, contact your administrator immediately.\n\n"
                f"— Cyber Sentinel"
            ),
        )
    except Exception as e:
        log.warning("Password-changed email not sent to %s: %s", user.email, e)
