# ============================================================
# backend/domains/soc/schemas.py — Request / Response Schemas
# ============================================================

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


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
    ai_verdict: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_action: Optional[str] = None
    severity_label: Optional[str] = None       # v2: CRITICAL | HIGH | MEDIUM | LOW | INFO
    analyst_override: Optional[str] = None
    mitre_techniques: list[dict] = []
    matched_rules: list[str] = []
    ingested_at: datetime


class AlertDetailResponse(AlertSummaryResponse):
    agent_id: str
    agent_ip: str
    rule_groups: list[str] = []
    full_log: str = ""
    data: Optional[dict] = None
    ai_reasoning: Optional[str] = None
    analyst_notes: Optional[str] = None
    analysed_at: Optional[datetime] = None
    mitre_tactics: list[str] = []
    threat_intel: Optional[dict] = None
    matched_rules: list[str] = []
    # v2 triage fields
    response_recommendations: list[str] = []
    false_positive_indicators: list[str] = []
    iocs: Optional[dict] = None
    triage_notes: Optional[str] = None
    triage_version: str = "v1"
    triage_duration_ms: Optional[int] = None


# --------------- Requests ---------------

class AnalystOverrideRequest(BaseModel):
    """Human analyst overrides the AI verdict."""
    override: str = Field(..., description="TRUE_POSITIVE or FALSE_POSITIVE")
    notes: Optional[str] = Field(None, description="Optional analyst notes")


class CustomRuleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    pattern: str
    severity: str = Field(..., pattern="^(low|medium|high|critical|info)$")
    enabled: bool = True
    project_id: Optional[str] = None


class CustomRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    pattern: Optional[str] = None
    severity: Optional[str] = None
    enabled: Optional[bool] = None


class CustomRuleResponse(BaseModel):
    id: str
    user_id: str
    project_id: Optional[str] = None
    name: str
    description: str = ""
    pattern: str
    severity: str
    enabled: bool
    created_at: datetime


class AlertFilterParams(BaseModel):
    """Query parameters for filtering alerts."""
    rule_level_min: Optional[int] = None
    rule_level_max: Optional[int] = None
    agent_name: Optional[str] = None
    agent_group: Optional[str] = None
    ai_verdict: Optional[str] = None       # TRUE_POSITIVE | FALSE_POSITIVE | UNKNOWN
    analyst_override: Optional[str] = None
    page: int = 1
    size: int = 50


# --------------- Multi-tenant / Wazuh settings ---------------

class TenantSettingsUpdate(BaseModel):
    """Update per-user Wazuh integration settings."""
    wazuh_min_level: Optional[int] = Field(
        None, ge=0, le=15,
        description="Minimum Wazuh alert level to ingest (0–15)",
    )
    wazuh_agent_group: Optional[str] = Field(
        None, description="Agent group name, e.g. tenant_juiceshop",
    )


class WazuhTokenResponse(BaseModel):
    token: str
    webhook_url: str
    min_level: int
    agent_group: Optional[str]
    instructions: str


# --------------- v2 Triage pipeline ---------------

class BatchRetriangeRequest(BaseModel):
    """Request body for batch re-triage."""
    alert_ids: list[str] = Field(..., min_length=1, max_length=50)


class TriageResultResponse(BaseModel):
    """Result from a single triage pipeline run."""
    alert_id: str
    wazuh_id: Optional[str] = None
    stages_completed: list[str] = []
    stages_failed: list[str] = []
    elapsed_ms: Optional[int] = None
    verdict: Optional[dict] = None
    error: Optional[str] = None


class FalsePositivePatternResponse(BaseModel):
    """Aggregated false positive pattern for a rule."""
    rule_id: str
    rule_description: str
    total_alerts: int
    fp_count: int
    fp_rate: float
    analyst_confirmed_fps: int
