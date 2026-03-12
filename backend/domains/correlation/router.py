# ============================================================
# backend/domains/correlation/router.py — Correlation REST Endpoints
# ============================================================

from fastapi import APIRouter, Depends, HTTPException, Query, status

from core.dependencies import get_current_user
from domains.auth.models import User
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


@router.post("/run", response_model=CorrelationResponse, status_code=201)
async def run_correlation(
    data: CorrelationRunRequest,
    user: User = Depends(get_current_user),
):
    """Run the correlation engine for a completed scan."""
    try:
        result = await service.run_correlation(data.scan_id)
        return _to_response(result)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/scan/{scan_id}", response_model=CorrelationResponse)
async def get_correlation(
    scan_id: str,
    user: User = Depends(get_current_user),
):
    """Get correlation results for a specific scan."""
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
    """List all correlations (newest first)."""
    results = await service.list_correlations(page, size)
    return [_to_response(c) for c in results]
