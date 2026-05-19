# ============================================================
# backend/core/security.py — JWT + Password Hashing
# ============================================================

from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt as _bcrypt
import jwt

from core.config import settings

# --------------- Password Hashing ---------------

def hash_password(plain: str) -> str:
    return _bcrypt.hashpw(plain.encode(), _bcrypt.gensalt(rounds=12)).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return _bcrypt.checkpw(plain.encode(), hashed.encode())
    except Exception:
        return False


# --------------- JWT Tokens ---------------

def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create a signed access JWT."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_expire_minutes)
    )
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(sub: str) -> str:
    """Create a long-lived refresh JWT (7 days). Only carries subject — no role/claims."""
    expire = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"sub": sub, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and verify an access JWT. Raises jwt.PyJWTError on invalid/expired tokens."""
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def decode_refresh_token(token: str) -> str:
    """
    Decode a refresh JWT and return the subject (user ID).
    Raises jwt.PyJWTError if invalid/expired, ValueError if wrong token type.
    """
    payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    if payload.get("type") != "refresh":
        raise ValueError("Not a refresh token")
    return payload["sub"]
