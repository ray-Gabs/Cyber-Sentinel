# ============================================================
# backend/domains/soc/router.py — SOC REST Endpoints
# ============================================================

import asyncio
import hmac
import logging

from fastapi import APIRouter, Depends, Query, HTTPException, Header, Request, status
from typing import Any, Optional

log = logging.getLogger(__name__)

from core.config import settings
from core.dependencies import get_current_user
from domains.auth.models import User
from domains.soc.models import Alert
from domains.soc.schemas import (
    AlertSummaryResponse,
    AlertDetailResponse,
    AnalystOverrideRequest,
    CustomRuleCreate,
    CustomRuleUpdate,
    CustomRuleResponse,
)
from domains.soc import service

router = APIRouter()


def _to_summary(a: Alert) -> AlertSummaryResponse:
    return AlertSummaryResponse(
        id=str(a.id),
        wazuh_id=a.wazuh_id,
        timestamp=a.timestamp,
        agent_name=a.agent_name,
        rule_id=a.rule_id,
        rule_description=a.rule_description,
        rule_level=a.rule_level,
        ai_verdict=a.ai_verdict,
        ai_confidence=a.ai_confidence,
        ai_action=a.ai_action,
        analyst_override=a.analyst_override,
        mitre_techniques=a.mitre_techniques,
        ingested_at=a.ingested_at,
    )


def _to_detail(a: Alert) -> AlertDetailResponse:
    return AlertDetailResponse(
        id=str(a.id),
        wazuh_id=a.wazuh_id,
        timestamp=a.timestamp,
        agent_name=a.agent_name,
        agent_id=a.agent_id,
        agent_ip=a.agent_ip,
        rule_id=a.rule_id,
        rule_description=a.rule_description,
        rule_level=a.rule_level,
        rule_groups=a.rule_groups,
        full_log=a.full_log,
        data=a.data,
        ai_verdict=a.ai_verdict,
        ai_confidence=a.ai_confidence,
        ai_action=a.ai_action,
        ai_reasoning=a.ai_reasoning,
        analyst_override=a.analyst_override,
        analyst_notes=a.analyst_notes,
        ingested_at=a.ingested_at,
        analysed_at=a.analysed_at,
        mitre_tactics=a.mitre_tactics,
        mitre_techniques=a.mitre_techniques,
        threat_intel=a.threat_intel,
    )


@router.get("/", response_model=list[AlertSummaryResponse])
async def list_alerts(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
    rule_level_min: Optional[int] = Query(None, ge=0, le=15),
    ai_verdict: Optional[str] = Query(None),
    agent_name: Optional[str] = Query(None),
    project_id: Optional[str] = Query(None, description="Filter alerts by project ID"),
    user: User = Depends(get_current_user),
):
    """List ingested Wazuh alerts (newest first) with optional filters."""
    alerts = await service.list_alerts(
        page, size, rule_level_min, ai_verdict, agent_name,
        project_id=project_id, current_user=user,
    )
    return [_to_summary(a) for a in alerts]


# Static paths must be registered BEFORE /{alert_id} — FastAPI matches in order.
@router.get("/stats/summary")
async def alert_stats(
    project_id: Optional[str] = Query(None, description="Scope stats to a specific project"),
    user: User = Depends(get_current_user),
):
    """Get aggregated alert statistics for the analytics dashboard."""
    return await service.get_alert_stats(project_id=project_id)


@router.get("/health")
async def wazuh_health(user: User = Depends(get_current_user)):
    """
    Test Wazuh Manager connectivity and return a structured status.

    Useful for the SOC dashboard "connection indicator" and for debugging
    the 2-VM lab setup where Wazuh runs on the host (not in Docker).

    Returns:
        status: "connected" | "disconnected"
        wazuh_url: the URL Cyber Sentinel is trying to reach
        error: human-readable error if disconnected
    """
    from domains.soc.wazuh_client import wazuh_client
    try:
        await wazuh_client.authenticate()
        agents = await wazuh_client.get_agents(limit=1)
        return {
            "status": "connected",
            "wazuh_url": settings.wazuh_api_url,
            "agent_count": len(agents),
        }
    except Exception as exc:
        return {
            "status": "disconnected",
            "wazuh_url": settings.wazuh_api_url,
            "error": str(exc)[:200],
        }


@router.get("/agents")
async def list_agents(user: User = Depends(get_current_user)):
    """List all registered Wazuh agents with their status and metadata."""
    from domains.soc.wazuh_client import wazuh_client
    try:
        agents = await wazuh_client.get_agents(limit=500)
        return {"agents": agents, "total": len(agents)}
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Wazuh API unavailable: {exc}",
        )


@router.get("/rules/custom")
async def get_custom_rules(user: User = Depends(get_current_user)):
    """Get custom SIEM rule definitions (Wazuh XML)."""
    from domains.soc.wazuh_rules import get_custom_rules
    return get_custom_rules()


# ── Custom Detection Rules CRUD ──────────────────────────────────────────────

@router.get("/detection-rules", response_model=list[CustomRuleResponse])
async def list_detection_rules(user: User = Depends(get_current_user)):
    """List all custom detection rules for the current user (including system defaults)."""
    rules = await service.get_rules(str(user.id))
    return [
        CustomRuleResponse(
            id=str(r.id), user_id=r.user_id, name=r.name,
            description=r.description, pattern=r.pattern,
            severity=r.severity, enabled=r.enabled, created_at=r.created_at,
        )
        for r in rules
    ]


@router.post("/detection-rules", response_model=CustomRuleResponse, status_code=201)
async def create_detection_rule(data: CustomRuleCreate, user: User = Depends(get_current_user)):
    """Create a new custom detection rule."""
    try:
        rule = await service.create_rule(str(user.id), data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return CustomRuleResponse(
        id=str(rule.id), user_id=rule.user_id, name=rule.name,
        description=rule.description, pattern=rule.pattern,
        severity=rule.severity, enabled=rule.enabled, created_at=rule.created_at,
    )


@router.put("/detection-rules/{rule_id}", response_model=CustomRuleResponse)
async def update_detection_rule(rule_id: str, data: CustomRuleUpdate, user: User = Depends(get_current_user)):
    """Update an existing detection rule."""
    try:
        rule = await service.update_rule(rule_id, str(user.id), data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return CustomRuleResponse(
        id=str(rule.id), user_id=rule.user_id, name=rule.name,
        description=rule.description, pattern=rule.pattern,
        severity=rule.severity, enabled=rule.enabled, created_at=rule.created_at,
    )


@router.delete("/detection-rules", status_code=200)
async def delete_all_detection_rules(user: User = Depends(get_current_user)):
    """Delete all user-owned detection rules (system defaults are preserved)."""
    count = await service.delete_all_rules(str(user.id))
    return {"deleted": count, "message": f"Deleted {count} rule(s)"}


@router.delete("/detection-rules/{rule_id}", status_code=200)
async def delete_detection_rule(rule_id: str, user: User = Depends(get_current_user)):
    """Delete a single detection rule by ID."""
    await service.delete_rule(rule_id, str(user.id))
    return {"deleted": rule_id}


@router.post("/rules/deploy")
async def deploy_custom_rules(
    user: User = Depends(get_current_user),
    x_wazuh_url: Optional[str] = Header(None, alias="X-Wazuh-Url"),
    x_wazuh_username: Optional[str] = Header(None, alias="X-Wazuh-Username"),
    x_wazuh_password: Optional[str] = Header(None, alias="X-Wazuh-Password"),
):
    """Deploy custom SIEM rules to Wazuh.
    Admin role required, unless the user supplies their own Wazuh credentials
    via X-Wazuh-* headers (lab mode — each student deploys to their own instance).
    """
    has_user_credentials = bool(x_wazuh_url)
    if not has_user_credentials and user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required to deploy SIEM rules")
    from domains.soc.wazuh_rules import deploy_rules_to_wazuh
    return await deploy_rules_to_wazuh(
        wazuh_url=x_wazuh_url,
        wazuh_user=x_wazuh_username,
        wazuh_password=x_wazuh_password,
    )


_MAX_WEBHOOK_BYTES = 10 * 1024 * 1024  # 10 MB — prevents memory DoS from huge payloads


@router.post("/webhook")
async def wazuh_webhook(
    request: Request,
    x_wazuh_token: Optional[str] = Header(None, alias="X-Wazuh-Token"),
):
    """
    Wazuh push webhook — receives alert events from Wazuh integration.

    Configure in Wazuh's ossec.conf:
      <integration>
        <name>custom-webhook</name>
        <hook_url>https://<server>/api/alerts/webhook</hook_url>
        <level>7</level>
        <alert_format>json</alert_format>
      </integration>

    Security:
      - If WAZUH_WEBHOOK_TOKEN is set, the X-Wazuh-Token header must match
        (compared with hmac.compare_digest to prevent timing attacks).
      - Payload is limited to 10 MB to prevent memory DoS.
      - Content-Type must be application/json.
    """
    # ── Content-Type guard ──────────────────────────────────────────────────
    ct = request.headers.get("content-type", "")
    if "application/json" not in ct:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Content-Type must be application/json",
        )

    # ── Payload size guard ──────────────────────────────────────────────────
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > _MAX_WEBHOOK_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Payload exceeds 10 MB limit",
        )

    # ── Shared-secret verification (timing-safe) ────────────────────────────
    if settings.wazuh_webhook_token:
        token = x_wazuh_token or ""
        # hmac.compare_digest prevents timing-oracle attacks on string comparison
        if not hmac.compare_digest(token, settings.wazuh_webhook_token):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook token",
            )

    # ── Parse body ──────────────────────────────────────────────────────────
    try:
        body: Any = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

    # Wazuh can send a single alert object or a batch {"alerts": [...]}
    if isinstance(body, list):
        raw_alerts = body
    elif isinstance(body, dict) and "alerts" in body:
        raw_alerts = body["alerts"]
    elif isinstance(body, dict):
        raw_alerts = [body]
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unexpected payload shape — expected alert object or {alerts: [...]}",
        )

    # ── Ingest + dispatch triage ────────────────────────────────────────────
    from domains.soc.tasks import triage_single_alert

    ingested = []
    for raw in raw_alerts:
        if not isinstance(raw, dict):
            continue  # skip malformed entries in a batch
        try:
            alert = await service.ingest_wazuh_alert(raw)
            await asyncio.to_thread(triage_single_alert.delay, str(alert.id))
            ingested.append({"alert_id": str(alert.id), "wazuh_id": alert.wazuh_id})
        except Exception as exc:
            log.warning("[webhook] Failed to ingest alert: %s", exc)

    return {"status": "ok", "ingested": len(ingested), "alerts": ingested}


@router.get("/{alert_id}", response_model=AlertDetailResponse)
async def get_alert(alert_id: str, user: User = Depends(get_current_user)):
    """Get full details for a single alert including AI verdict."""
    a = await service.get_alert(alert_id)
    return _to_detail(a)


@router.patch("/{alert_id}/override", response_model=AlertDetailResponse)
async def override_verdict(
    alert_id: str,
    data: AnalystOverrideRequest,
    user: User = Depends(get_current_user),
):
    """Human analyst overrides the AI classification for an alert."""
    a = await service.override_verdict(alert_id, data)
    return _to_detail(a)


@router.post("/{alert_id}/enrich", response_model=AlertDetailResponse)
async def enrich_alert(alert_id: str, user: User = Depends(get_current_user)):
    """Run threat intelligence enrichment (VT + AbuseIPDB) for an alert."""
    a = await service.enrich_alert_threat_intel(alert_id)
    return _to_detail(a)
