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


@router.get("/", response_model=list[CorrelationResponse])
async def list_correlations(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    """List correlations for the current user's scans (newest first)."""
    scoped_user_id = None if user.role == "admin" else str(user.id)
    results = await service.list_correlations(page, size, user_id=scoped_user_id)
    return [_to_response(c) for c in results]


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
    """Delete a single correlation by ID."""
    await service.delete_correlation(correlation_id, str(user.id))
    return {"deleted": correlation_id}
