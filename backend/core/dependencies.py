# ============================================================
# backend/core/dependencies.py — FastAPI Dependency Injection
# ============================================================

from beanie import PydanticObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer

from core.security import decode_access_token
from domains.auth.models import User

# auto_error=False lets us fall through to cookie auth when no Bearer header is present
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(
    request: Request,
    bearer_token: str | None = Depends(oauth2_scheme),
) -> User:
    """
    Resolve the current user from an HttpOnly cookie or Authorization header.

    Priority:
      1. Cookie `access_token` — set by the login endpoint (browser clients)
      2. Authorization: Bearer <token> — Swagger UI and API clients

    Usage in routes:
        @router.get("/me")
        async def me(user: User = Depends(get_current_user)):
            ...
    """
    token = request.cookies.get("access_token") or bearer_token
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token)
        user_id: str | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except Exception as exc:
        raise credentials_exception from exc

    try:
        user = await User.get(PydanticObjectId(user_id))
        if user is None:
            raise credentials_exception
    except HTTPException:
        raise
    except Exception as exc:
        raise credentials_exception from exc
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Contact an administrator.",
        )
    return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency that ensures the current user has 'admin' role."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
