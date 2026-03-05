# ============================================================
# backend/domains/auth/router.py — Auth REST Endpoints
# ============================================================

from fastapi import APIRouter, Depends

from core.dependencies import get_current_user
from domains.auth.models import User
from domains.auth.schemas import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    UserResponse,
)
from domains.auth import service

router = APIRouter()


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(data: RegisterRequest):
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
async def login(data: LoginRequest):
    """Authenticate and receive a JWT access token."""
    return await service.authenticate_user(data)


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
    )
