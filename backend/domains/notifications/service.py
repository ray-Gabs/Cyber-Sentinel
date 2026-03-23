# ============================================================
# backend/domains/notifications/service.py — Notification Logic
# ============================================================

import logging
from datetime import datetime, timezone
from typing import Literal, Optional

from beanie import PydanticObjectId

from core.websocket import ws_manager
from domains.notifications.models import Notification

log = logging.getLogger(__name__)

NotificationType = Literal["scan_complete", "scan_failed", "critical_finding"]


async def create_notification(
    *,
    user_id: str,
    type: NotificationType,
    title: str,
    body: Optional[str] = None,
    scan_id: Optional[str] = None,
    scan_target: Optional[str] = None,
    severity_summary: Optional[dict[str, int]] = None,
    risk_score: Optional[float] = None,
) -> Notification:
    """
    Persist a new notification and push it to the user's WebSocket channel.
    Safe to call from Celery tasks (no FastAPI dependency).
    """
    notif = Notification(
        user_id=user_id,
        type=type,
        title=title,
        body=body,
        scan_id=scan_id,
        scan_target=scan_target,
        severity_summary=severity_summary,
        risk_score=risk_score,
    )
    await notif.insert()

    # Push real-time update via WebSocket to "notifications" channel
    try:
        payload = {
            "type": "new_notification",
            "data": {
                "id": str(notif.id),
                "user_id": notif.user_id,
                "type": notif.type,
                "title": notif.title,
                "body": notif.body,
                "scan_id": notif.scan_id,
                "scan_target": notif.scan_target,
                "severity_summary": notif.severity_summary,
                "risk_score": notif.risk_score,
                "is_read": notif.is_read,
                "created_at": notif.created_at.isoformat(),
            },
        }
        await ws_manager.broadcast(channel="notifications", data=payload)
    except Exception as exc:
        log.warning("WebSocket broadcast failed for notification %s: %s", notif.id, exc)

    return notif


async def get_notifications(
    user_id: str,
    unread_only: bool = False,
    limit: int = 50,
) -> list[Notification]:
    """Fetch notifications for a user, newest first."""
    query = Notification.find(Notification.user_id == user_id)
    if unread_only:
        query = query.find(Notification.is_read == False)  # noqa: E712
    return await query.sort(-Notification.created_at).limit(limit).to_list()


async def mark_read(notification_id: str, user_id: str) -> Optional[Notification]:
    """Mark a single notification as read. Returns None if not found or not owned."""
    notif = await Notification.get(PydanticObjectId(notification_id))
    if not notif or notif.user_id != user_id:
        return None
    notif.is_read = True
    await notif.save()
    return notif


async def mark_all_read(user_id: str) -> int:
    """Mark all unread notifications for a user as read. Returns count updated."""
    result = await Notification.find(
        Notification.user_id == user_id,
        Notification.is_read == False,  # noqa: E712
    ).update({"$set": {"is_read": True}})
    return result.modified_count if result else 0
