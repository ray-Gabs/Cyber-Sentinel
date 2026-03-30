# ============================================================
# backend/domains/notifications/router.py — FastAPI Endpoints
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query

from core.dependencies import get_current_user
from domains.auth.models import User
from domains.notifications import service
from domains.notifications.schemas import NotificationOut

router = APIRouter()


@router.get("/", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = Query(False, description="Return only unread notifications"),
    current_user: User = Depends(get_current_user),
):
    """Fetch notifications for the authenticated user, newest first."""
    items = await service.get_notifications(
        user_id=str(current_user.id),
        unread_only=unread_only,
    )
    return [
        NotificationOut(
            id=str(n.id),
            user_id=n.user_id,
            type=n.type,
            title=n.title,
            body=n.body,
            scan_id=n.scan_id,
            scan_target=n.scan_target,
            severity_summary=n.severity_summary,
            risk_score=n.risk_score,
            is_read=n.is_read,
            created_at=n.created_at,
        )
        for n in items
    ]


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    """Mark a single notification as read."""
    notif = await service.mark_read(notification_id, user_id=str(current_user.id))
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    return NotificationOut(
        id=str(notif.id),
        user_id=notif.user_id,
        type=notif.type,
        title=notif.title,
        body=notif.body,
        scan_id=notif.scan_id,
        scan_target=notif.scan_target,
        severity_summary=notif.severity_summary,
        risk_score=notif.risk_score,
        is_read=notif.is_read,
        created_at=notif.created_at,
    )


@router.patch("/read-all")
async def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
):
    """Mark all notifications for the current user as read."""
    count = await service.mark_all_read(user_id=str(current_user.id))
    return {"updated": count}


@router.delete("/{notification_id}", status_code=204)
async def delete_notification(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    """Permanently delete a single notification."""
    deleted = await service.delete_notification(notification_id, user_id=str(current_user.id))
    if not deleted:
        raise HTTPException(status_code=404, detail="Notification not found")


@router.delete("/", status_code=204)
async def clear_all_notifications(
    current_user: User = Depends(get_current_user),
):
    """Delete all notifications for the current user."""
    await service.clear_all_notifications(user_id=str(current_user.id))
