# ============================================================
# backend/domains/audit/router.py — Audit Log Endpoints
# ============================================================

from fastapi import APIRouter, Depends, Query, HTTPException, Request, status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from core.dependencies import get_current_user
from core.rate_limit import limiter, get_user_or_ip_key
from domains.auth.models import User
from domains.audit.models import AuditLog

router = APIRouter()


class AuditLogResponse(BaseModel):
    id: str
    user_id: str
    username: str
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: datetime


def _require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


@router.get("/", response_model=list[AuditLogResponse])
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_audit_logs(
    request: Request,
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    user_id: Optional[str] = Query(None, description="Filter by user ID"),
    action: Optional[str] = Query(None, description="Filter by action prefix, e.g. 'scan.'"),
    current_user: User = Depends(get_current_user),
):
    """[Admin] List audit log entries, newest first. Filterable by user and action."""
    _require_admin(current_user)

    query: dict = {}
    if user_id:
        query["user_id"] = user_id
    if action:
        # Support prefix matching e.g. action="scan." matches "scan.created", "scan.deleted"
        if action.endswith("."):
            import re
            query["action"] = {"$regex": f"^{re.escape(action)}"}
        else:
            query["action"] = action

    logs = (
        await AuditLog.find(query)
        .sort("-timestamp")
        .skip((page - 1) * size)
        .limit(size)
        .to_list()
    )

    return [
        AuditLogResponse(
            id=str(entry.id),
            user_id=entry.user_id,
            username=entry.username,
            action=entry.action,
            resource_type=entry.resource_type,
            resource_id=entry.resource_id,
            details=entry.details,
            ip_address=entry.ip_address,
            timestamp=entry.timestamp,
        )
        for entry in logs
    ]


@router.get("/stats")
@limiter.limit("30/minute", key_func=get_user_or_ip_key)
async def audit_stats(request: Request, current_user: User = Depends(get_current_user)):
    """[Admin] Quick stats: total logs, unique users, top actions."""
    _require_admin(current_user)
    total = await AuditLog.count()
    return {"total": total}
