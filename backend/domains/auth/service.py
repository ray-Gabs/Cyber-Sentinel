# ============================================================
# backend/domains/auth/service.py — Auth Business Logic
# ============================================================

import logging
import smtplib
from datetime import datetime, timezone, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from fastapi import HTTPException, status
from jose import JWTError

from core.config import settings
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


def _send_reset_email(to_email: str, username: str, reset_url: str) -> None:
    """Send the password reset email via SMTP."""
    if not settings.smtp_host:
        log.warning("SMTP not configured — cannot send reset email to %s", to_email)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service is not configured. Contact your administrator.",
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Cyber Sentinel — Password Reset"
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to_email

    text = (
        f"Hi {username},\n\n"
        f"Click the link below to reset your password. It expires in 15 minutes.\n\n"
        f"{reset_url}\n\n"
        f"If you didn't request this, ignore this email.\n\n"
        f"— Cyber Sentinel"
    )
    html = (
        f'<div style="font-family:system-ui,sans-serif;max-width:500px;margin:0 auto;padding:24px">'
        f'<h2 style="color:#0ea5e9">Cyber Sentinel</h2>'
        f'<p>Hi <strong>{username}</strong>,</p>'
        f'<p>Click the button below to reset your password. This link expires in <strong>15 minutes</strong>.</p>'
        f'<a href="{reset_url}" style="display:inline-block;padding:12px 24px;background:#0ea5e9;color:#fff;'
        f'border-radius:8px;text-decoration:none;font-weight:600;margin:16px 0">Reset Password</a>'
        f'<p style="color:#6b7280;font-size:13px">If you didn\'t request this, you can safely ignore this email.</p>'
        f'<hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">'
        f'<p style="color:#9ca3af;font-size:11px">Cyber Sentinel — AI-Powered Pentesting &amp; SOC Platform</p>'
        f'</div>'
    )

    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        if settings.smtp_use_tls:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
            server.starttls()
        else:
            server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
        if settings.smtp_user and settings.smtp_password:
            server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(msg["From"], [to_email], msg.as_string())
        server.quit()
    except Exception as e:
        log.error("Failed to send reset email: %s", e)
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
    _send_reset_email(user.email, user.username, reset_url)


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
