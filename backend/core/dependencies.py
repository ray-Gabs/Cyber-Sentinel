# ============================================================
# backend/core/dependencies.py — FastAPI Dependency Injection
# ============================================================

from beanie import PydanticObjectId
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from core.security import decode_access_token
from domains.auth.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """
    Decode the JWT from the Authorization header, look up the user in
    MongoDB, and return the Beanie User document.

    Usage in routes:
        @router.get("/me")
        async def me(user: User = Depends(get_current_user)):
            ...
    """
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
    except Exception:
        raise credentials_exception

    try:
        user = await User.get(PydanticObjectId(user_id))
    except Exception:
        raise credentials_exception
    if user is None:
        raise credentials_exception
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
