from fastapi import APIRouter, Depends, Query, Request

from core.dependencies import get_current_user
from core.rate_limit import limiter
from domains.auth.models import User
from domains.pentesting.models import Scan
from domains.soc.models import Alert

router = APIRouter()


@router.get("/api/search", tags=["Search"])
@limiter.limit("30/minute")
async def global_search(
    request: Request,
    q: str = Query(..., min_length=1, max_length=100),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Full-text search across scans and alerts."""
    term = q.strip()

    scan_filter: dict = {"target": {"$regex": term, "$options": "i"}}
    if current_user.role != "admin":
        scan_filter["user_id"] = str(current_user.id)

    scans = await Scan.find(scan_filter).sort("-created_at").limit(8).to_list()

    alert_filter: dict = {
        "$or": [
            {"rule_description": {"$regex": term, "$options": "i"}},
            {"agent_name": {"$regex": term, "$options": "i"}},
        ]
    }

    alerts = await Alert.find(alert_filter).sort("-timestamp").limit(8).to_list()

    return {
        "scans": [
            {
                "id": str(s.id),
                "target": s.target,
                "status": s.status,
                "scan_type": s.scan_type,
                "created_at": s.created_at.isoformat(),
            }
            for s in scans
        ],
        "alerts": [
            {
                "id": str(a.id),
                "rule_description": a.rule_description,
                "agent_name": a.agent_name,
                "rule_level": a.rule_level,
                "timestamp": a.timestamp.isoformat(),
            }
            for a in alerts
        ],
    }
