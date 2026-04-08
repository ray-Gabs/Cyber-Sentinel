# ============================================================
# backend/domains/audit/service.py — Audit Log Service
# ============================================================
# Fire-and-forget audit logging. Never raises — failures are
# logged as warnings and silently swallowed so they never
# interrupt the main request flow.
# ============================================================

import logging
from typing import Optional

from domains.audit.models import AuditLog

log = logging.getLogger(__name__)


async def log_event(
    user_id: str,
    username: str,
    action: str,
    resource_type: Optional[str] = None,
    resource_id: Optional[str] = None,
    details: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> None:
    """
    Persist an audit log entry.

    Call this after any meaningful user action. The function
    never raises — if the insert fails, it logs a warning and returns.

    Action namespacing convention:
        user.*      — authentication and account events
        scan.*      — pentest scan lifecycle
        role.*      — role and permission changes
        account.*   — account activation/deactivation
        alert.*     — SOC alert events
    """
    try:
        entry = AuditLog(
            user_id=user_id,
            username=username,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            details=details[:200] if details else None,
            ip_address=ip_address,
        )
        await entry.insert()
    except Exception as exc:
        log.warning("Audit log insert failed for action=%s user=%s: %s", action, username, exc)
