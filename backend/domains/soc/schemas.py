# ============================================================
# backend/domains/soc/schemas.py — Request / Response Schemas
# ============================================================

from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_serializer


def _utc_iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.isoformat() + "Z"
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# --------------- Responses ---------------

class AlertSummaryResponse(BaseModel):
    id: str
    wazuh_id: str
    timestamp: datetime
    agent_name: str
    agent_group: str = ""
    rule_id: str
    rule_description: str
    rule_level: int
    ai_verdict: str | None = None
    ai_confidence: float | None = None
    ai_action: str | None = None
    severity_label: str | None = None       # v2: CRITICAL | HIGH | MEDIUM | LOW | INFO
    analyst_override: str | None = None
    mitre_techniques: list[dict] = []
    matched_rules: list[str] = []
    ingested_at: datetime

    @field_serializer("timestamp", "ingested_at", when_used="json")
    def _serialize_dt(self, v: datetime | None) -> str | None:
        return _utc_iso(v)


class AlertDetailResponse(AlertSummaryResponse):
    agent_id: str
    agent_ip: str
    rule_groups: list[str] = []
    full_log: str = ""
    data: dict | None = None
    ai_reasoning: str | None = None
    analyst_notes: str | None = None
    analysed_at: datetime | None = None

    @field_serializer("analysed_at", when_used="json")
    def _serialize_analysed_at(self, v: datetime | None) -> str | None:
        return _utc_iso(v)
    mitre_tactics: list[str] = []
    threat_intel: dict | None = None
    matched_rules: list[str] = []
    # v2 triage fields
    response_recommendations: list[str] = []
    false_positive_indicators: list[str] = []
    iocs: dict | None = None
    triage_notes: str | None = None
    triage_version: str = "v1"
    triage_duration_ms: int | None = None


class PaginatedAlertResponse(BaseModel):
    items: list[AlertSummaryResponse]
    total: int
    page: int
    size: int
    pages: int


# --------------- Requests ---------------

class AnalystOverrideRequest(BaseModel):
    """Human analyst overrides the AI verdict."""
    override: str = Field(..., description="TRUE_POSITIVE or FALSE_POSITIVE")
    notes: str | None = Field(None, description="Optional analyst notes")


class CustomRuleCreate(BaseModel):
    name: str
    description: str | None = None
    pattern: str
    severity: str = Field(..., pattern="^(low|medium|high|critical|info)$")
    enabled: bool = True
    project_id: str | None = None
    source_alert_id: str | None = None  # Alert this rule was created from
    source_rule_id: str | None = None   # Wazuh rule_id that prompted this rule


class CustomRuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    pattern: str | None = None
    severity: str | None = None
    enabled: bool | None = None


class CustomRuleResponse(BaseModel):
    id: str
    user_id: str
    project_id: str | None = None
    name: str
    description: str = ""
    pattern: str
    severity: str
    enabled: bool
    created_at: datetime
    source_alert_id: str | None = None
    source_rule_id: str | None = None


class AlertFilterParams(BaseModel):
    """Query parameters for filtering alerts."""
    rule_level_min: int | None = None
    rule_level_max: int | None = None
    agent_name: str | None = None
    agent_group: str | None = None
    ai_verdict: str | None = None       # TRUE_POSITIVE | FALSE_POSITIVE | UNKNOWN
    analyst_override: str | None = None
    page: int = 1
    size: int = 50


# --------------- Multi-tenant / Wazuh settings ---------------

class TenantSettingsUpdate(BaseModel):
    """Update per-user Wazuh integration settings."""
    wazuh_min_level: int | None = Field(
        None, ge=0, le=15,
        description="Minimum Wazuh alert level to ingest (0–15)",
    )
    wazuh_agent_group: str | None = Field(
        None, description="Agent group name, e.g. tenant_juiceshop",
    )


class WazuhTokenResponse(BaseModel):
    token: str
    webhook_url: str
    min_level: int
    agent_group: str | None
    instructions: str


# --------------- v2 Triage pipeline ---------------

class BatchRetriangeRequest(BaseModel):
    """Request body for batch re-triage."""
    alert_ids: list[str] = Field(..., min_length=1, max_length=50)


class BatchOverrideRequest(BaseModel):
    """Request body for bulk analyst verdict override."""
    alert_ids: list[str] = Field(..., min_length=1, max_length=200, description="Alert IDs to override")
    override: str = Field(..., description="TRUE_POSITIVE or FALSE_POSITIVE")
    notes: str | None = Field(None, max_length=1000, description="Optional analyst notes applied to all")


class TriageResultResponse(BaseModel):
    """Result from a single triage pipeline run."""
    alert_id: str
    wazuh_id: str | None = None
    stages_completed: list[str] = []
    stages_failed: list[str] = []
    elapsed_ms: int | None = None
    verdict: dict | None = None
    error: str | None = None


class FalsePositivePatternResponse(BaseModel):
    """Aggregated false positive pattern for a rule."""
    rule_id: str
    rule_description: str
    total_alerts: int
    fp_count: int
    fp_rate: float
    analyst_confirmed_fps: int
