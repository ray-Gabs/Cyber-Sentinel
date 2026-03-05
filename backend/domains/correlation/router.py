# ============================================================
# backend/domains/correlation/router.py — Correlation REST Endpoints
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query, status
from beanie import PydanticObjectId

from core.dependencies import get_current_user
from domains.auth.models import User
from domains.pentesting.models import Scan
from domains.correlation import service
from domains.correlation.schemas import (
    CorrelationResponse,
    CorrelationLinkResponse,
    CorrelationRunRequest,
)

router = APIRouter()


def _to_response(c) -> CorrelationResponse:
    return CorrelationResponse(
        id=str(c.id),
        scan_id=c.scan_id,
        scan_target=c.scan_target,
        total_links=c.total_links,
        links=[CorrelationLinkResponse(**l.model_dump()) for l in c.links],
        ai_summary=c.ai_summary,
        created_at=c.created_at,
    )


async def _get_owned_scan(scan_id: str, user: User) -> Scan:
    """Fetch a scan and verify the requesting user owns it."""
    try:
        scan = await Scan.get(PydanticObjectId(scan_id))
    except Exception:
        scan = None
    if not scan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")
    if scan.user_id != str(user.id) and user.role != "admin":
        raise HTTPException(status_code=403, detail="Forbidden")
    return scan


@router.post("/run", response_model=CorrelationResponse, status_code=201)
async def run_correlation(
    data: CorrelationRunRequest,
    user: User = Depends(get_current_user),
):
    """Run the correlation engine for a completed scan."""
    await _get_owned_scan(data.scan_id, user)
    try:
        result = await service.run_correlation(data.scan_id)
        return _to_response(result)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found")


@router.get("/scan/{scan_id}", response_model=CorrelationResponse)
async def get_correlation(
    scan_id: str,
    user: User = Depends(get_current_user),
):
    """Get correlation results for a specific scan."""
    await _get_owned_scan(scan_id, user)
    result = await service.get_correlation(scan_id)
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No correlation found for this scan")
    return _to_response(result)


@router.get("/")
async def list_correlations(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
):
    """
    List correlations for the current user's scans (newest first).
    Returns paginated envelope: { items, total, skip, limit }.
    Empty list → 200 with items: [] — never 404.
    """
    scoped_user_id = None if user.role == "admin" else str(user.id)

    # Convert skip/limit to page/size for the service
    page = (skip // limit) + 1 if limit else 1
    results = await service.list_correlations(page, limit, user_id=scoped_user_id)
    total = await service.count_correlations(user_id=scoped_user_id)

    return {
        "items": [_to_response(c) for c in results],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.delete("/", status_code=200)
async def delete_all_user_correlations(user: User = Depends(get_current_user)):
    """Delete all correlations for the current user."""
    count = await service.delete_all_correlations(str(user.id))
    return {"deleted": count, "message": f"Deleted {count} correlation(s)"}


@router.delete("/{correlation_id}", status_code=200)
async def delete_single_correlation(
    correlation_id: str,
    user: User = Depends(get_current_user),
):
    """Delete a single correlation by ID (owner only)."""
    await service.delete_correlation(correlation_id, str(user.id))
    return {"deleted": correlation_id}
