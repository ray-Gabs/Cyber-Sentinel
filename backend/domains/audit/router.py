# ============================================================
# backend/domains/audit/router.py — Audit Log Endpoints
# ============================================================

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from core.dependencies import get_current_user
from core.rate_limit import get_user_or_ip_key, limiter
from domains.audit.models import AuditLog
from domains.auth.models import User

router = APIRouter()


class AuditLogResponse(BaseModel):
    id: str
    user_id: str
    username: str
    action: str
    resource_type: str | None = None
    resource_id: str | None = None
    details: str | None = None
    ip_address: str | None = None
    timestamp: datetime


def _require_admin(user: User) -> None:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")


@router.get("/", response_model=list[AuditLogResponse])
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_audit_logs(
    request: Request,
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=200),
    user_id: str | None = Query(None, description="Filter by user ID"),
    action: str | None = Query(None, description="Filter by action prefix, e.g. 'scan.'"),
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
    """[Admin] Aggregated stats: total, breakdown by action prefix and top users."""
    _require_admin(current_user)
    col = AuditLog.get_motor_collection()
    total = await col.count_documents({})
    # Top 10 actions
    action_pipeline = [
        {"$group": {"_id": "$action", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    action_rows = await col.aggregate(action_pipeline).to_list(None)
    top_actions = [{"action": r["_id"], "count": r["count"]} for r in action_rows]
    # Top 10 users by activity
    user_pipeline = [
        {"$group": {"_id": "$username", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    user_rows = await col.aggregate(user_pipeline).to_list(None)
    top_users = [{"username": r["_id"], "count": r["count"]} for r in user_rows]
    # Activity by day (last 7 days)
    from datetime import timedelta, timezone
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    day_pipeline = [
        {"$match": {"timestamp": {"$gte": cutoff}}},
        {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    day_rows = await col.aggregate(day_pipeline).to_list(None)
    by_day = [{"date": r["_id"], "count": r["count"]} for r in day_rows]
    return {
        "total": total,
        "top_actions": top_actions,
        "top_users": top_users,
        "by_day_last_7": by_day,
    }
