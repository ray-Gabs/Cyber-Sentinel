# ============================================================
# backend/domains/auth/service.py — Auth Business Logic
# ============================================================

from datetime import datetime, timezone

from fastapi import HTTPException, status

from core.security import hash_password, verify_password, create_access_token
from domains.auth.models import User
from domains.auth.schemas import RegisterRequest, LoginRequest, TokenResponse


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
