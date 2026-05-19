# ============================================================
# backend/domains/auth/service.py — Auth Business Logic
# ============================================================

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from pymongo.errors import DuplicateKeyError

from core.config import settings
from core.email_service import send_email
from core.security import create_access_token, hash_password, verify_password
from domains.auth.models import User
from domains.auth.schemas import LoginRequest, RegisterRequest, TokenResponse

log = logging.getLogger(__name__)


async def seed_admin() -> None:
    """
    Create the first admin account on a fresh database.

    Called once during app startup (main.py lifespan).
    Does nothing if:
      - FIRST_ADMIN_EMAIL or FIRST_ADMIN_PASSWORD is not set in .env
      - The users collection already has at least one document

    This means it is safe to leave configured indefinitely — it will never
    overwrite an existing admin or create duplicate accounts.
    """
    if not settings.first_admin_email or not settings.first_admin_password:
        return

    count = await User.count()
    if count > 0:
        return  # DB already has users — skip silently

    admin = User(
        username=settings.first_admin_username or "admin",
        email=settings.first_admin_email,
        hashed_password=hash_password(settings.first_admin_password),
        role="admin",
    )
    try:
        await admin.insert()
        log.info(
            "First admin seeded — username: %s  email: %s  (change this password now!)",
            admin.username,
            admin.email,
        )
    except DuplicateKeyError:
        pass  # another worker beat us — admin already exists


async def seed_demo_user() -> None:
    """
    Seed a demo user account on startup.
    Reads DEMO_USER_EMAIL and DEMO_USER_PASSWORD from env.
    Skips silently if env vars are not set or user already exists.
    """
    import os
    email = os.getenv("DEMO_USER_EMAIL", "").strip()
    password = os.getenv("DEMO_USER_PASSWORD", "").strip()
    if not email or not password:
        return
    existing = await User.find_one({"email": email})
    if existing:
        return
    demo = User(
        username="demo",
        email=email,
        hashed_password=hash_password(password),
        role="analyst",
        status="active",
        is_active=True,
        is_demo=True,
    )
    try:
        await demo.insert()
        log.info("Demo user seeded: %s", email)
    except DuplicateKeyError:
        pass  # another worker beat us — demo user already exists


_LOGIN_FAIL_PREFIX = "login_fail:"
_MAX_LOGIN_FAILURES = 5
_LOCKOUT_SECONDS = 900  # 15 minutes


def _lockout_key(identifier: str) -> str:
    """SHA-256 hash of identifier so PII is never stored raw in Redis keys."""
    return f"{_LOGIN_FAIL_PREFIX}{hashlib.sha256(identifier.lower().encode()).hexdigest()[:24]}"


async def _is_account_locked(identifier: str) -> bool:
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
    try:
        count = int(await r.get(_lockout_key(identifier)) or 0)
        return count >= _MAX_LOGIN_FAILURES
    finally:
        await r.aclose()


async def _record_login_failure(identifier: str) -> None:
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
    try:
        key = _lockout_key(identifier)
        count = await r.incr(key)
        if count == 1:
            await r.expire(key, _LOCKOUT_SECONDS)
    finally:
        await r.aclose()


async def _clear_login_failures(identifier: str) -> None:
    import redis.asyncio as aioredis
    r = aioredis.from_url(settings.app_redis_url, socket_connect_timeout=2)
    try:
        await r.delete(_lockout_key(identifier))
    finally:
        await r.aclose()


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
        status="pending",
        is_active=False,
        wazuh_token=secrets.token_urlsafe(32),
    )
    await user.insert()
    log.info("New registration (pending approval): %s <%s>", user.username, user.email)
    return user


async def authenticate_user(data: LoginRequest) -> TokenResponse:
    """
    Verify credentials and return a JWT.
    Raises 401 on bad credentials, 429 when account is locked out.
    """
    # Check lockout BEFORE querying DB — avoids timing oracle on non-existent accounts
    try:
        if await _is_account_locked(data.identifier):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Account temporarily locked — too many failed attempts. Try again in 15 minutes.",
            )
    except HTTPException:
        raise
    except Exception as _lock_exc:
        log.warning("Lockout check failed (non-fatal): %s", _lock_exc)

    user = await User.find_one(
        {"$or": [{"username": data.identifier}, {"email": data.identifier}]}
    )
    if not user or not verify_password(data.password, user.hashed_password):
        try:
            await _record_login_failure(data.identifier)
        except Exception as _rf_exc:
            log.warning("Could not record login failure: %s", _rf_exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    # Approval / suspension gate
    user_status = getattr(user, "status", "active")
    if user_status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account pending admin approval.",
        )
    if user_status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account suspended. Contact an administrator.",
        )

    # Successful auth — clear failure counter and update last_login
    try:
        await _clear_login_failures(data.identifier)
    except Exception as _cf_exc:
        log.warning("Could not clear login failures: %s", _cf_exc)

    user.last_login = datetime.now(timezone.utc)
    await user.save()

    token = create_access_token(data={"sub": str(user.id), "role": user.role})
    return TokenResponse(access_token=token)


# --------------- Password Reset ---------------

_RESET_TOKEN_EXPIRY_MINUTES = 30

_INVALID_RESET_LINK_EXC = HTTPException(
    status_code=status.HTTP_400_BAD_REQUEST,
    detail="Invalid or expired reset link. Please request a new one.",
)


def _generate_reset_token() -> tuple[str, str]:
    """
    Generate a cryptographically random reset token.
    Returns (raw_token, sha256_hash). Only raw_token goes in the email URL.
    The hash is stored in MongoDB so the raw token is never persisted.
    """
    raw = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


async def _send_reset_email(to_email: str, username: str, reset_url: str) -> None:
    """Send the password reset email. Raises HTTP 503/502 on failure."""
    plain_text = (
        f"Hi {username},\n\n"
        f"Reset your Cyber Sentinel password (expires in {_RESET_TOKEN_EXPIRY_MINUTES} minutes):\n{reset_url}\n\n"
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
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Email service is not configured. Contact your administrator.",
        ) from exc
    except Exception as e:
        log.error("Failed to send reset email to %s: %s", to_email, e)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to send reset email. Try again later.",
        ) from e


async def request_password_reset(email: str) -> None:
    """
    Generate a single-use reset token, store its hash in MongoDB, and email the raw token.
    Always returns success (even if email not found) to prevent user enumeration.
    Any existing unused token is invalidated before creating a new one.
    """
    user = await User.find_one({"email": email})
    if not user:
        return  # Silent — don't reveal whether email exists

    raw_token, token_hash = _generate_reset_token()

    # Invalidate any existing token and set the new one
    user.password_reset_token_hash = token_hash
    user.password_reset_expires = datetime.now(timezone.utc) + timedelta(minutes=_RESET_TOKEN_EXPIRY_MINUTES)
    await user.save()

    reset_url = f"{settings.frontend_url}/reset-password?token={raw_token}"
    await _send_reset_email(user.email, user.username, reset_url)


async def reset_password(token: str, new_password: str) -> None:
    """
    Validate the reset token, update the password, and immediately invalidate the token.
    Token is single-use — a second attempt with the same token will fail.
    """
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    user = await User.find_one({"password_reset_token_hash": token_hash})
    if not user:
        # Either never existed, already used, or wrong token — same generic error
        raise _INVALID_RESET_LINK_EXC

    # Check expiry
    if not user.password_reset_expires or datetime.now(timezone.utc) > user.password_reset_expires:
        # Clear the expired token
        user.password_reset_token_hash = None
        user.password_reset_expires = None
        await user.save()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Reset link has expired. Please request a new one.",
        )

    # Invalidate token immediately (single-use) and update password atomically
    user.password_reset_token_hash = None
    user.password_reset_expires = None
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
