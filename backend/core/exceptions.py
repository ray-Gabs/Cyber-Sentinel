# ============================================================
# backend/core/exceptions.py — Domain Exception Hierarchy
# ============================================================
# All domain code raises typed exceptions from this hierarchy.
# FastAPI's global exception handler in main.py maps these to
# structured HTTP responses with consistent error codes.
#
# Usage in domain code:
#   from core.exceptions import NotFoundError, AuthError
#   raise NotFoundError("scan", scan_id)
#
# Usage in exception handlers (main.py):
#   @app.exception_handler(AppError)
#   async def app_error_handler(request, exc): ...
# ============================================================

from __future__ import annotations


class AppError(Exception):
    """Base class for all application errors."""

    status_code: int = 500
    error_code: str = "INTERNAL_ERROR"

    def __init__(self, message: str = "An unexpected error occurred") -> None:
        super().__init__(message)
        self.message = message

    def to_dict(self) -> dict:
        d: dict = {"error": self.error_code, "message": self.message}
        try:
            import structlog
            trace_id = structlog.contextvars.get_contextvars().get("trace_id")
            if trace_id:
                d["trace_id"] = trace_id
        except Exception:
            pass
        return d


# ----- 4xx -----

class ValidationError(AppError):
    status_code = 422
    error_code = "VALIDATION_ERROR"


class NotFoundError(AppError):
    status_code = 404
    error_code = "NOT_FOUND"

    def __init__(self, resource: str, identifier: str = "") -> None:
        msg = f"{resource} not found" + (f": {identifier}" if identifier else "")
        super().__init__(msg)


class AuthError(AppError):
    status_code = 401
    error_code = "UNAUTHORIZED"


class ForbiddenError(AppError):
    status_code = 403
    error_code = "FORBIDDEN"


class ConflictError(AppError):
    status_code = 409
    error_code = "CONFLICT"


class RateLimitError(AppError):
    status_code = 429
    error_code = "RATE_LIMITED"


# ----- Domain-specific -----

class ScanError(AppError):
    error_code = "SCAN_ERROR"


class TargetUnreachableError(ScanError):
    status_code = 422
    error_code = "TARGET_UNREACHABLE"


class SocError(AppError):
    error_code = "SOC_ERROR"


class AlertNotFoundError(NotFoundError):
    def __init__(self, alert_id: str = "") -> None:
        super().__init__("alert", alert_id)


class AIProviderError(AppError):
    status_code = 503
    error_code = "AI_PROVIDER_UNAVAILABLE"
