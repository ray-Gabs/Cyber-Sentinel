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
    BatchRetriangeRequest,
    TriageResultResponse,
    FalsePositivePatternResponse,
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
        severity_label=a.severity_label,
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
        severity_label=a.severity_label,
        response_recommendations=a.response_recommendations,
        false_positive_indicators=a.false_positive_indicators,
        iocs=a.iocs,
        triage_notes=a.triage_notes,
        triage_version=a.triage_version,
        triage_duration_ms=a.triage_duration_ms,
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
    return await service.get_alert_stats(project_id=project_id, current_user=user)


@router.get("/health")
async def wazuh_health(user: User = Depends(get_current_user)):
    """
    Test Wazuh Manager connectivity — does NOT expose credentials or the manager URL.
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
    is_admin = getattr(user, "role", "") == "admin"
    try:
        rule = await service.update_rule(rule_id, str(user.id), data, is_admin=is_admin)
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
    is_admin = getattr(user, "role", "") == "admin"
    await service.delete_rule(rule_id, str(user.id), is_admin=is_admin)
    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="detection_rule.deleted",
        resource_type="detection_rule",
        resource_id=rule_id,
    )
    return {"deleted": rule_id}


@router.post("/rules/deploy")
async def deploy_custom_rules(
    user: User = Depends(get_current_user),
):
    """Deploy custom SIEM rules to Wazuh. Admin only."""
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin role required to deploy SIEM rules")
    from domains.soc.wazuh_rules import deploy_rules_to_wazuh
    return await deploy_rules_to_wazuh()


_MAX_WEBHOOK_BYTES = 10 * 1024 * 1024  # 10 MB — prevents memory DoS from huge payloads


@router.post("/webhook")
async def wazuh_webhook(
    request: Request,
    x_wazuh_token: Optional[str] = Header(None, alias="X-Wazuh-Token"),
):
    """
    Wazuh push webhook — receives alert events from Wazuh integration.

    Security:
      - Per-user token takes priority: routes alert to correct tenant automatically.
      - Falls back to global WAZUH_WEBHOOK_TOKEN for admin/shared ingestion.
      - Payload limited to 10 MB. Content-Type must be application/json.
    """
    ct = request.headers.get("content-type", "")
    if "application/json" not in ct:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Content-Type must be application/json",
        )

    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > _MAX_WEBHOOK_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Payload exceeds 10 MB limit",
        )

    # ── Token resolution: per-user token takes priority over global token ──────
    tenant_id: Optional[str] = None
    tenant_min_level: int = 0

    provided_token = x_wazuh_token or ""
    if not provided_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Wazuh-Token header",
        )

    owner = await User.find_one({"wazuh_token": provided_token})
    if owner:
        tenant_id = str(owner.id)
        tenant_min_level = owner.wazuh_min_level
    elif settings.wazuh_webhook_token and hmac.compare_digest(
        provided_token, settings.wazuh_webhook_token
    ):
        # Global shared token — auto-assign to the first active admin so alerts
        # are immediately visible in the admin SOC dashboard without a manual claim step.
        admin_user = await User.find_one({"role": "admin", "is_active": True})
        if admin_user:
            tenant_id = str(admin_user.id)
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid webhook token",
        )

    try:
        body: Any = await request.json()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload",
        )

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

    from domains.soc.tasks import triage_single_alert

    ingested = []
    skipped = 0
    for raw in raw_alerts:
        if not isinstance(raw, dict):
            continue
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

@router.get("/tenant/token", response_model=WazuhTokenResponse)
async def get_my_wazuh_token(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Get the current user's per-user Wazuh webhook token and setup instructions."""
    if not user.wazuh_token:
        raise HTTPException(
            status_code=404,
            detail="No token generated yet. POST to /api/soc/tenant/token to create one.",
        )
    base_url = str(request.base_url).rstrip("/")
    return WazuhTokenResponse(
        token=user.wazuh_token,
        webhook_url=f"{base_url}/api/alerts/webhook",
        min_level=user.wazuh_min_level,
        agent_group=user.wazuh_agent_group,
        instructions=(
            f"Set these env vars on the Wazuh Manager before running wazuh_forwarder.py:\n"
            f"  export CYBER_SENTINEL_URL={base_url}\n"
            f"  export WAZUH_WEBHOOK_TOKEN={user.wazuh_token}\n"
            f"  export TENANT_GROUP={user.wazuh_agent_group or 'tenant_<yourproject>'}\n"
            f"  export MIN_LEVEL={user.wazuh_min_level}"
        ),
    )


@router.post("/tenant/token", response_model=WazuhTokenResponse, status_code=201)
async def generate_my_wazuh_token(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Generate (or regenerate) a per-user Wazuh webhook token."""
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
        webhook_url=f"{base_url}/api/alerts/webhook",
        min_level=user.wazuh_min_level,
        agent_group=user.wazuh_agent_group,
        instructions=(
            f"Set these env vars on the Wazuh Manager before running wazuh_forwarder.py:\n"
            f"  export CYBER_SENTINEL_URL={base_url}\n"
            f"  export WAZUH_WEBHOOK_TOKEN={user.wazuh_token}\n"
            f"  export TENANT_GROUP={user.wazuh_agent_group or 'tenant_<yourproject>'}\n"
            f"  export MIN_LEVEL={user.wazuh_min_level}"
        ),
    )


@router.patch("/tenant/settings")
async def update_tenant_settings(
    data: TenantSettingsUpdate,
    user: User = Depends(get_current_user),
):
    """Update per-user Wazuh settings: minimum alert level and agent group."""
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


@router.get("/mitre-summary", tags=["SOC"])
async def get_mitre_summary(current_user: User = Depends(get_current_user)) -> dict:
    """Aggregate MITRE ATT&CK technique frequency from the most recent 500 alerts."""
    query: dict = {}
    if current_user.role != "admin":
        if current_user.wazuh_token:
            query["tenant_id"] = str(current_user.id)
        elif current_user.wazuh_agent_name:
            query["agent_name"] = current_user.wazuh_agent_name
        else:
            query["tenant_id"] = str(current_user.id)
    alerts = await Alert.find(query).sort("-timestamp").limit(500).to_list()

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


# ── Admin Maintenance ─────────────────────────────────────────────────────────

@router.post("/admin/claim-alerts")
async def admin_claim_alerts(user: User = Depends(get_current_user)):
    """
    Admin only: assign tenant_id to all alerts currently with tenant_id=None.

    Use this after alerts have been ingested via the global WAZUH_WEBHOOK_TOKEN.
    After running this, the alerts become visible to your account and you can
    trigger triage via /admin/retriage-all.
    """
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")

    collection = Alert.get_motor_collection()
    result = await collection.update_many(
        {"$or": [{"tenant_id": None}, {"tenant_id": {"$exists": False}}]},
        {"$set": {"tenant_id": str(user.id)}},
    )
    count = result.modified_count

    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="alerts.claim_untenanted",
        resource_type="alert",
        resource_id="*",
        details=f"claimed {count} alerts → tenant_id={user.id}",
    )
    return {"claimed": count, "tenant_id": str(user.id)}


@router.post("/admin/retriage-all")
async def admin_retriage_all(user: User = Depends(get_current_user)):
    """
    Admin only: queue Celery triage tasks for all untriaged/failed alerts in this tenant.

    Returns immediately — processing happens asynchronously in the Celery worker.
    Covers alerts where ai_verdict is None or TRIAGE_FAILED (previous attempt errored).
    """
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")

    alerts = await Alert.find({
        "tenant_id": str(user.id),
        "$or": [{"ai_verdict": None}, {"ai_verdict": "TRIAGE_FAILED"}],
    }).to_list()

    from domains.soc.tasks import triage_single_alert
    queued = 0
    for alert in alerts:
        try:
            triage_single_alert.delay(str(alert.id))
            queued += 1
        except Exception as exc:
            log.warning("[admin] Failed to queue triage for %s: %s", alert.id, exc)

    await audit_service.log_event(
        user_id=str(user.id),
        username=user.username,
        action="alerts.bulk_retriage_queued",
        resource_type="alert",
        resource_id="*",
        details=f"queued triage for {queued}/{len(alerts)} alerts",
    )
    return {"queued": queued, "total_untriaged": len(alerts)}


@router.post("/retriage-mine")
async def retriage_my_alerts(user: User = Depends(get_current_user)):
    """
    Queue AI triage for all untriaged/failed alerts visible to the current user.

    Works for any role — admins queue their tenant bucket, analysts queue
    alerts from their project agents. Returns immediately; processing is async.
    """
    user_id = str(user.id)
    conditions: list[dict] = [{"tenant_id": user_id}]

    if user.role != "admin":
        if user.wazuh_agent_name:
            conditions.append({"agent_name": user.wazuh_agent_name})
        try:
            from domains.soc.project_models import SocProject
            user_projects = await SocProject.find(
                SocProject.owner_id == user_id
            ).limit(100).to_list()
            proj_agent_names = [p.wazuh_agent_name or p.slug for p in user_projects]
            if proj_agent_names:
                conditions.append({"agent_name": {"$in": proj_agent_names}})
        except Exception as exc:
            log.debug("Failed to fetch user projects for retriage scope: %s", exc)

    scope: dict = {"$or": conditions} if len(conditions) > 1 else conditions[0]
    verdict_filter: dict = {"$or": [{"ai_verdict": None}, {"ai_verdict": "TRIAGE_FAILED"}]}
    alerts = await Alert.find(
        {"$and": [scope, verdict_filter]}
    ).to_list()

    from domains.soc.tasks import triage_single_alert
    queued = 0
    for alert in alerts:
        try:
            triage_single_alert.delay(str(alert.id))
            queued += 1
        except Exception as exc:
            log.warning("[retriage-mine] Failed to queue triage for %s: %s", alert.id, exc)

    await audit_service.log_event(
        user_id=user_id,
        username=user.username,
        action="alerts.self_retriage_queued",
        resource_type="alert",
        resource_id="*",
        details=f"queued triage for {queued}/{len(alerts)} alerts",
    )
    return {"queued": queued, "total_untriaged": len(alerts)}


@router.get("/{alert_id}", response_model=AlertDetailResponse)
async def get_alert(alert_id: str, user: User = Depends(get_current_user)):
    """Get full details for a single alert including AI verdict."""
    a = await service.get_alert(alert_id, current_user=user)
    return _to_detail(a)


@router.patch("/{alert_id}/override", response_model=AlertDetailResponse)
async def override_verdict(
    alert_id: str,
    data: AnalystOverrideRequest,
    user: User = Depends(get_current_user),
):
    """Human analyst overrides the AI classification for an alert."""
    a = await service.override_verdict(alert_id, data, current_user=user)
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
    a = await service.enrich_alert_threat_intel(alert_id, current_user=user)
    return _to_detail(a)


@router.get("/{alert_id}/raw-wazuh")
async def get_raw_wazuh_alert(alert_id: str, user: User = Depends(get_current_user)):
    """Fetch the original alert payload directly from the Wazuh Manager API."""
    if not settings.wazuh_api_password:
        raise HTTPException(status_code=503, detail="Wazuh API not configured")
    a = await service.get_alert(alert_id, current_user=user)
    from domains.soc.wazuh_client import wazuh_client
    raw = await wazuh_client.get_alert(a.wazuh_id)
    if raw is None:
        raise HTTPException(status_code=404, detail="Alert not found in Wazuh Manager")
    return {"alert": raw}


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
    from domains.soc.playbook import PlaybookEngine, PLAYBOOKS
    a = await service.get_alert(alert_id, current_user=user)
    engine = PlaybookEngine()
    pb_id = playbook_id or engine.find_matching_playbook(a)
    if not pb_id or pb_id not in PLAYBOOKS:
        raise HTTPException(status_code=404, detail="No matching playbook found for this alert")
    execution = await engine.execute_playbook(a, pb_id)
    return execution.model_dump(mode="json")


# ── v2 Triage pipeline endpoints ─────────────────────────────────────────────

@router.post("/{alert_id}/retriage", response_model=TriageResultResponse)
async def retriage_alert(
    alert_id: str,
    user: User = Depends(get_current_user),
):
    """Force re-triage of an alert — clears existing verdict and reruns the full pipeline."""
    from domains.soc.triage_pipeline import retriage_alert as _retriage
    result = await _retriage(alert_id)
    return TriageResultResponse(**result)


@router.post("/triage/batch", response_model=list[TriageResultResponse])
async def batch_retriage_alerts(
    body: BatchRetriangeRequest,
    user: User = Depends(get_current_user),
):
    """Re-triage up to 50 alerts (max 3 concurrent pipelines)."""
    from domains.soc.triage_pipeline import batch_retriage
    results = await batch_retriage(body.alert_ids, concurrency=3)
    return [TriageResultResponse(**r) for r in results]


@router.post("/{alert_id}/remediation")
async def get_alert_remediation(
    alert_id: str,
    user: User = Depends(get_current_user),
):
    """Generate a structured incident response plan for a TRUE_POSITIVE alert."""
    a = await service.get_alert(alert_id, current_user=user)
    if not a.ai_verdict or a.ai_verdict == "FALSE_POSITIVE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Remediation is only generated for TRUE_POSITIVE alerts.",
        )
    from ai.llm_service import llm_service
    alert_payload = {
        "rule_id": a.rule_id,
        "rule_description": a.rule_description,
        "rule_level": a.rule_level,
        "rule_groups": a.rule_groups,
        "full_log": a.full_log[:3000],
        "data": a.data,
        "agent_name": a.agent_name,
        "agent_ip": a.agent_ip,
        "mitre_techniques": a.mitre_techniques,
        "mitre_tactics": a.mitre_tactics,
    }
    verdict = {
        "classification": a.ai_verdict,
        "severity_label": a.severity_label,
        "confidence": a.ai_confidence,
        "action": a.ai_action,
        "reasoning": a.ai_reasoning,
        "iocs": a.iocs,
        "response_recommendations": a.response_recommendations,
    }
    guide = await llm_service.generate_alert_remediation(alert_payload, verdict)
    return {"alert_id": alert_id, "remediation": guide}


@router.get("/stats/false-positive-patterns", response_model=list[FalsePositivePatternResponse])
async def false_positive_patterns(
    min_alerts: int = Query(5, ge=1, description="Minimum alert count to include a rule"),
    limit: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    """Return rules ranked by false positive rate to identify noisy detections."""
    from domains.soc.models import Alert as AlertModel
    pipeline = [
        {"$group": {
            "_id": "$rule_id",
            "rule_description": {"$first": "$rule_description"},
            "total": {"$sum": 1},
            "fps": {"$sum": {"$cond": [{"$eq": ["$ai_verdict", "FALSE_POSITIVE"]}, 1, 0]}},
            "analyst_fps": {"$sum": {"$cond": [{"$eq": ["$analyst_override", "FALSE_POSITIVE"]}, 1, 0]}},
        }},
        {"$match": {"total": {"$gte": min_alerts}}},
        {"$addFields": {"fp_rate": {"$divide": ["$fps", "$total"]}}},
        {"$sort": {"fp_rate": -1}},
        {"$limit": limit},
    ]
    rows = await AlertModel.aggregate(pipeline).to_list()
    return [
        FalsePositivePatternResponse(
            rule_id=r["_id"],
            rule_description=r.get("rule_description", ""),
            total_alerts=r["total"],
            fp_count=r["fps"],
            fp_rate=round(r["fp_rate"], 3),
            analyst_confirmed_fps=r.get("analyst_fps", 0),
        )
        for r in rows
    ]


@router.get("/wazuh/agents/{agent_id}/context")
async def get_agent_context(agent_id: str, user: User = Depends(get_current_user)):
    """Rich agent snapshot: OS, open ports, processes, FIM changes, vuln summary."""
    from domains.soc.wazuh_client import wazuh_client
    try:
        return await wazuh_client.build_agent_context(agent_id)
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


@router.get("/wazuh/agents/{agent_id}/vulnerabilities")
async def get_agent_vulnerabilities(
    agent_id: str,
    severity: Optional[str] = Query(None, description="critical | high | medium | low"),
    limit: int = Query(50, ge=1, le=500),
    user: User = Depends(get_current_user),
):
    """CVE vulnerabilities detected on a Wazuh agent."""
    from domains.soc.wazuh_client import wazuh_client
    try:
        vulns = await wazuh_client.get_vulnerabilities(agent_id, severity=severity, limit=limit)
        return {"agent_id": agent_id, "vulnerabilities": vulns, "total": len(vulns)}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


@router.get("/wazuh/agents/{agent_id}/sca")
async def get_agent_sca(
    agent_id: str,
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
):
    """SCA policy results for an agent."""
    from domains.soc.wazuh_client import wazuh_client
    try:
        results = await wazuh_client.get_sca_results(agent_id, limit=limit)
        return {"agent_id": agent_id, "sca_policies": results, "total": len(results)}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


@router.get("/wazuh/agents/{agent_id}/fim")
async def get_agent_fim(
    agent_id: str,
    event_type: Optional[str] = Query(None, description="added | modified | deleted"),
    limit: int = Query(50, ge=1, le=200),
    user: User = Depends(get_current_user),
):
    """FIM events for an agent."""
    from domains.soc.wazuh_client import wazuh_client
    try:
        events = await wazuh_client.get_fim_events(agent_id, event_type=event_type, limit=limit)
        return {"agent_id": agent_id, "fim_events": events, "total": len(events)}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


@router.get("/wazuh/manager/info")
async def get_wazuh_manager_info(user: User = Depends(get_current_user)):
    """Wazuh Manager version, cluster status, and operational stats."""
    from domains.soc.wazuh_client import wazuh_client
    try:
        info = await wazuh_client.get_manager_info()
        cluster = await wazuh_client.get_cluster_status()
        stats = await wazuh_client.get_manager_stats()
        return {"manager": info, "cluster": cluster, "stats": stats}
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))
