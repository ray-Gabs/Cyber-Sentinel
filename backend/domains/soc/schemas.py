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
    rule_id: str
    rule_description: str
    rule_level: int
    ai_verdict: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_action: Optional[str] = None
    analyst_override: Optional[str] = None
    mitre_techniques: list[dict] = []
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


# --------------- Requests ---------------

class AnalystOverrideRequest(BaseModel):
    """Human analyst overrides the AI verdict."""
    override: str = Field(..., description="TRUE_POSITIVE or FALSE_POSITIVE")
    notes: Optional[str] = Field(None, description="Optional analyst notes")


class CustomRuleCreate(BaseModel):
    name: str
    description: str
    pattern: str
    severity: str = Field(..., pattern="^(Low|Medium|High|Critical)$")
    enabled: bool = True


class CustomRuleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    pattern: Optional[str] = None
    severity: Optional[str] = None
    enabled: Optional[bool] = None


class CustomRuleResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: str
    pattern: str
    severity: str
    enabled: bool
    created_at: datetime


class AlertFilterParams(BaseModel):
    """Query parameters for filtering alerts."""
    rule_level_min: Optional[int] = None
    rule_level_max: Optional[int] = None
    agent_name: Optional[str] = None
    ai_verdict: Optional[str] = None       # TRUE_POSITIVE | FALSE_POSITIVE | UNKNOWN
    analyst_override: Optional[str] = None
    page: int = 1
    size: int = 50
