# ============================================================
# backend/domains/soc/router.py — SOC REST Endpoints
# ============================================================

import asyncio
import hmac
import logging

from fastapi import APIRouter, Depends, Header, Query, HTTPException, Request, status
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
    TenantSettingsUpdate,
    WazuhTokenResponse,
)
from domains.soc import service
from domains.audit import service as audit_service

router = APIRouter()


def _to_summary(a: Alert) -> AlertSummaryResponse:
    return AlertSummaryResponse(
        id=str(a.id),
        wazuh_id=a.wazuh_id,
        timestamp=a.timestamp,
        agent_name=a.agent_name,
        agent_group=a.agent_group,
        rule_id=a.rule_id,
        rule_description=a.rule_description,
        rule_level=a.rule_level,
        ai_verdict=a.ai_verdict,
        ai_confidence=a.ai_confidence,
        ai_action=a.ai_action,
        analyst_override=a.analyst_override,
        mitre_techniques=a.mitre_techniques,
        matched_rules=a.matched_rules,
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
    agent_group: Optional[str] = Query(None, description="Filter by Wazuh agent group (admin only)"),
    project_id: Optional[str] = Query(None, description="Filter alerts by project ID"),
    user: User = Depends(get_current_user),
):
    """List ingested Wazuh alerts (newest first) with optional filters."""
    alerts = await service.list_alerts(
        page, size, rule_level_min, ai_verdict, agent_name,
        agent_group=agent_group, project_id=project_id, current_user=user,
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
    Test Wazuh Manager connectivity — does NOT expose credentials or the manager URL.
    Use /api/soc/health for the richer dashboard health endpoint.
    """
    from domains.soc.wazuh_client import wazuh_client
    try:
        await wazuh_client.authenticate()
        agents = await wazuh_client.get_agents(limit=1)
        return {
            "status": "connected",
            "agent_count": len(agents),
        }
    except Exception as exc:
        return {
            "status": "disconnected",
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
    """
    List detection rules visible to the current user.

    Admins see all rules. Analysts see only:
      - Global platform rules (user_id="system", no project)
      - Their own personal rules
      - Rules tied to projects they own
    """
    from domains.soc.project_models import SocProject

    is_admin = getattr(user, "role", None) == "admin"
    owned_project_ids: list[str] = []
    if not is_admin:
        projects = await SocProject.find(SocProject.owner_id == str(user.id)).to_list()
        owned_project_ids = [str(p.id) for p in projects]

    rules = await service.get_rules(
        str(user.id), owned_project_ids=owned_project_ids, is_admin=is_admin
    )
    return [
        CustomRuleResponse(
            id=str(r.id), user_id=r.user_id, project_id=r.project_id,
            name=r.name, description=r.description, pattern=r.pattern,
            severity=r.severity, enabled=r.enabled, created_at=r.created_at,
        )
        for r in rules
    ]


@router.post("/detection-rules", response_model=CustomRuleResponse, status_code=201)
async def create_detection_rule(data: CustomRuleCreate, user: User = Depends(get_current_user)):
    """Create a new custom detection rule (optionally scoped to a project the user owns)."""
    try:
        rule = await service.create_rule(str(user.id), data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="detection_rule.created",
        resource_type="detection_rule",
        resource_id=str(rule.id),
        details=f"name={rule.name} severity={rule.severity} pattern={rule.pattern[:60]}",
    )
    return CustomRuleResponse(
        id=str(rule.id), user_id=rule.user_id, project_id=rule.project_id,
        name=rule.name, description=rule.description, pattern=rule.pattern,
        severity=rule.severity, enabled=rule.enabled, created_at=rule.created_at,
    )


@router.put("/detection-rules/{rule_id}", response_model=CustomRuleResponse)
async def update_detection_rule(rule_id: str, data: CustomRuleUpdate, user: User = Depends(get_current_user)):
    """Update an existing detection rule."""
    try:
        rule = await service.update_rule(rule_id, str(user.id), data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    changed = ", ".join(k for k, v in data.model_dump(exclude_none=True).items())
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="detection_rule.updated",
        resource_type="detection_rule",
        resource_id=rule_id,
        details=f"name={rule.name} changed_fields={changed}",
    )
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
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="detection_rule.deleted",
        resource_type="detection_rule",
        resource_id=rule_id,
    )
    return {"deleted": rule_id}


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

    # ── Token resolution: per-user token takes priority over global token ──────
    # Professor's recommendation: each user has their own token so alerts are
    # automatically routed to the correct tenant without sharing a secret.
    tenant_id: Optional[str] = None
    tenant_min_level: int = 0

    provided_token = x_wazuh_token or ""
    if provided_token:
        # Try per-user token first (DB lookup is not timing-sensitive here)
        owner = await User.find_one({"wazuh_token": provided_token})
        if owner:
            tenant_id = str(owner.id)
            tenant_min_level = owner.wazuh_min_level
        elif settings.wazuh_webhook_token and hmac.compare_digest(
            provided_token, settings.wazuh_webhook_token
        ):
            pass  # global shared token — no tenant assignment (admin ingest)
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid webhook token",
            )
    elif settings.wazuh_webhook_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Wazuh-Token header",
        )
    # else: no auth configured — allow through (dev/lab mode)

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
    skipped = 0
    for raw in raw_alerts:
        if not isinstance(raw, dict):
            continue  # skip malformed entries in a batch
        # Per-tenant MIN_LEVEL filter (professor's recommendation: not hardcoded in .env)
        level = raw.get("rule", {}).get("level", 0)
        if level < tenant_min_level:
            skipped += 1
            continue
        try:
            alert = await service.ingest_wazuh_alert(raw, tenant_id=tenant_id)
            await asyncio.to_thread(triage_single_alert.delay, str(alert.id))
            ingested.append({"alert_id": str(alert.id), "wazuh_id": alert.wazuh_id})
        except Exception as exc:
            log.warning("[webhook] Failed to ingest alert: %s", exc)

    return {"status": "ok", "ingested": len(ingested), "skipped": skipped, "alerts": ingested}


# ── Per-user Wazuh tenant management ──────────────────────────────────────────
# Per professor's recommendation: each user has their own token + min_level + group.

@router.get("/tenant/token", response_model=WazuhTokenResponse)
async def get_my_wazuh_token(
    request: Request,
    user: User = Depends(get_current_user),
):
    """
    Get the current user's per-user Wazuh webhook token and setup instructions.
    Use POST /tenant/token to generate a new token if one hasn't been created yet.
    """
    if not user.wazuh_token:
        raise HTTPException(
            status_code=404,
            detail="No token generated yet. POST to /api/soc/tenant/token to create one.",
        )
    base_url = str(request.base_url).rstrip("/")
    return WazuhTokenResponse(
        token=user.wazuh_token,
        webhook_url=f"{base_url}/api/soc/webhook",
        min_level=user.wazuh_min_level,
        agent_group=user.wazuh_agent_group,
        instructions=(
            f"Set these env vars on the Wazuh Manager before running wazuh_forwarder.py:\n"
            f"  export CYBER_SENTINEL_URL={base_url}\n"
            f"  export WAZUH_WEBHOOK_TOKEN={user.wazuh_token}\n"
            f"  export TENANT_GROUP={user.wazuh_agent_group or 'tenant_<yourproject>'}\n"
            f"  export MIN_LEVEL={user.wazuh_min_level}  # optional override (backend filters too)"
        ),
    )


@router.post("/tenant/token", response_model=WazuhTokenResponse, status_code=201)
async def generate_my_wazuh_token(
    request: Request,
    user: User = Depends(get_current_user),
):
    """
    Generate (or regenerate) a per-user Wazuh webhook token.
    The token is stored on the user record and must be sent as X-Wazuh-Token
    in the forwarder's requests so alerts are tagged to this tenant.
    """
    import secrets
    user.wazuh_token = secrets.token_urlsafe(32)
    await user.save()
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="wazuh_token.regenerated",
        resource_type="user",
        resource_id=str(user.id),
    )
    base_url = str(request.base_url).rstrip("/")
    return WazuhTokenResponse(
        token=user.wazuh_token,
        webhook_url=f"{base_url}/api/soc/webhook",
        min_level=user.wazuh_min_level,
        agent_group=user.wazuh_agent_group,
        instructions=(
            f"Set these env vars on the Wazuh Manager before running wazuh_forwarder.py:\n"
            f"  export CYBER_SENTINEL_URL={base_url}\n"
            f"  export WAZUH_WEBHOOK_TOKEN={user.wazuh_token}\n"
            f"  export TENANT_GROUP={user.wazuh_agent_group or 'tenant_<yourproject>'}\n"
            f"  export MIN_LEVEL={user.wazuh_min_level}  # optional override (backend filters too)"
        ),
    )


@router.patch("/tenant/settings")
async def update_tenant_settings(
    data: TenantSettingsUpdate,
    user: User = Depends(get_current_user),
):
    """
    Update per-user Wazuh settings: minimum alert level and agent group.
    min_level controls which alerts are stored for this tenant (backend-enforced).
    agent_group is the Wazuh group name to assign to your agents (e.g. tenant_juiceshop).
    """
    changed: list[str] = []
    if data.wazuh_min_level is not None:
        user.wazuh_min_level = data.wazuh_min_level
        changed.append(f"min_level={data.wazuh_min_level}")
    if data.wazuh_agent_group is not None:
        user.wazuh_agent_group = data.wazuh_agent_group
        changed.append(f"agent_group={data.wazuh_agent_group}")
    if changed:
        await user.save()
        await audit_service.log_event(
            user_id=str(user.id),
            username=user.username,
            action="tenant_settings.updated",
            resource_type="user",
            resource_id=str(user.id),
            details=", ".join(changed),
        )
    return {
        "wazuh_min_level": user.wazuh_min_level,
        "wazuh_agent_group": user.wazuh_agent_group,
        "message": f"Updated: {', '.join(changed)}" if changed else "No changes",
    }


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
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="alert.triaged",
        resource_type="alert",
        resource_id=alert_id,
        details=f"override={data.override} notes={str(data.notes or '')[:80]}",
    )
    return _to_detail(a)


@router.post("/{alert_id}/enrich", response_model=AlertDetailResponse)
async def enrich_alert(alert_id: str, user: User = Depends(get_current_user)):
    """Run threat intelligence enrichment (VT + AbuseIPDB) for an alert."""
    a = await service.enrich_alert_threat_intel(alert_id)
    return _to_detail(a)


@router.get("/{alert_id}/playbooks")
async def get_alert_playbooks(alert_id: str, user: User = Depends(get_current_user)):
    """List all playbook executions for a specific alert."""
    from domains.soc.playbook import PlaybookExecution
    executions = await PlaybookExecution.find(
        PlaybookExecution.alert_id == alert_id
    ).sort("-created_at").to_list()
    return [e.model_dump(mode="json") for e in executions]


@router.post("/{alert_id}/playbooks/trigger")
async def trigger_playbook(
    alert_id: str,
    playbook_id: Optional[str] = Query(None),
    user: User = Depends(get_current_user),
):
    """Manually trigger a playbook for an alert. If playbook_id is omitted, auto-selects."""
    from domains.soc.playbook import PlaybookEngine, PlaybookExecution, PLAYBOOKS
    a = await service.get_alert(alert_id)
    engine = PlaybookEngine()
    pb_id = playbook_id or engine.find_matching_playbook(a)
    if not pb_id or pb_id not in PLAYBOOKS:
        raise HTTPException(status_code=404, detail="No matching playbook found for this alert")
    execution = await engine.execute_playbook(a, pb_id)
    return execution.model_dump(mode="json")


@router.get("/mitre-summary", tags=["SOC"])
async def get_mitre_summary(current_user: User = Depends(get_current_user)) -> dict:
    """Aggregate MITRE ATT&CK technique frequency from the most recent 2000 alerts."""
    alerts = await Alert.find().sort("-timestamp").limit(500).to_list()

    by_tactic: dict[str, dict[str, int]] = {}
    total_hits = 0

    for alert in alerts:
        for mt in (alert.mitre_techniques or []):
            if isinstance(mt, dict):
                technique: str | None = mt.get("technique") or mt.get("id")
                tactic: str = mt.get("tactic") or "Unknown"
            else:
                technique = getattr(mt, "technique", None) or getattr(mt, "id", None)
                tactic = getattr(mt, "tactic", None) or "Unknown"

            if not technique:
                continue

            bucket = by_tactic.setdefault(tactic, {})
            bucket[technique] = bucket.get(technique, 0) + 1
            total_hits += 1

    return {
        "by_tactic": by_tactic,
        "total_technique_hits": total_hits,
        "alerts_analyzed": len(alerts),
    }
