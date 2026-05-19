# ============================================================
# backend/domains/correlation/router.py — Correlation REST Endpoints
# ============================================================

from beanie import PydanticObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from core.cache import TTL_FAST, cache_get, cache_invalidate, cache_set
from core.dependencies import get_current_user
from core.rate_limit import get_user_or_ip_key, limiter
from domains.auth.models import User
from domains.correlation import service
from domains.correlation.schemas import (
    CorrelationLinkResponse,
    CorrelationResponse,
    CorrelationRunRequest,
)
from domains.pentesting.models import Scan

router = APIRouter()


def _to_response(c) -> CorrelationResponse:
    return CorrelationResponse(
        id=str(c.id),
        scan_id=c.scan_id,
        scan_target=c.scan_target,
        total_links=c.total_links,
        links=[CorrelationLinkResponse(**lnk.model_dump()) for lnk in c.links],
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
@limiter.limit("10/minute", key_func=get_user_or_ip_key)
async def run_correlation(
    request: Request,
    data: CorrelationRunRequest,
    user: User = Depends(get_current_user),
):
    """Run the correlation engine for a completed scan."""
    await _get_owned_scan(data.scan_id, user)
    try:
        result = await service.run_correlation(data.scan_id)
        scoped_user_id = None if user.role == "admin" else str(user.id)
        await cache_invalidate(f"cs:cache:correlation:list:{scoped_user_id or 'admin'}:*")
        return _to_response(result)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scan not found") from exc


@router.get("/scan/{scan_id}", response_model=CorrelationResponse)
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def get_correlation(
    request: Request,
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
@limiter.limit("60/minute", key_func=get_user_or_ip_key)
async def list_correlations(
    request: Request,
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=200),
    user: User = Depends(get_current_user),
):
    """
    List correlations for the current user's scans (newest first).
    Returns paginated envelope: { items, total, skip, limit }.
    Empty list → 200 with items: [] — never 404.
    """
    scoped_user_id = None if user.role == "admin" else str(user.id)
    cache_key = f"cs:cache:correlation:list:{scoped_user_id or 'admin'}:{skip}:{limit}"

    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    page = (skip // limit) + 1 if limit else 1
    results = await service.list_correlations(page, limit, user_id=scoped_user_id)
    total = await service.count_correlations(user_id=scoped_user_id)

    response = {
        "items": [_to_response(c).model_dump() for c in results],
        "total": total,
        "skip": skip,
        "limit": limit,
    }
    await cache_set(cache_key, response, TTL_FAST)
    return response


@router.delete("/", status_code=200)
@limiter.limit("5/minute", key_func=get_user_or_ip_key)
async def delete_all_user_correlations(request: Request, user: User = Depends(get_current_user)):
    """Delete all correlations for the current user."""
    count = await service.delete_all_correlations(str(user.id))
    scoped_user_id = None if user.role == "admin" else str(user.id)
    await cache_invalidate(f"cs:cache:correlation:list:{scoped_user_id or 'admin'}:*")
    return {"deleted": count, "message": f"Deleted {count} correlation(s)"}


@router.delete("/{correlation_id}", status_code=200)
@limiter.limit("20/minute", key_func=get_user_or_ip_key)
async def delete_single_correlation(
    request: Request,
    correlation_id: str,
    user: User = Depends(get_current_user),
):
    """Delete a single correlation by ID (owner only)."""
    await service.delete_correlation(correlation_id, str(user.id))
    scoped_user_id = None if user.role == "admin" else str(user.id)
    await cache_invalidate(f"cs:cache:correlation:list:{scoped_user_id or 'admin'}:*")
    return {"deleted": correlation_id}
