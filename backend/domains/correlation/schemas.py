# ============================================================
# backend/domains/correlation/schemas.py — Request/Response Schemas
# ============================================================

from datetime import datetime

from pydantic import BaseModel


class CorrelationLinkResponse(BaseModel):
    finding_tool: str
    finding_name: str
    finding_severity: str
    finding_matched_at: str
    alert_wazuh_id: str
    alert_rule_id: str
    alert_rule_description: str
    alert_rule_level: int
    correlation_type: str
    confidence: float


class CorrelationResponse(BaseModel):
    id: str
    scan_id: str
    scan_target: str
    total_links: int
    links: list[CorrelationLinkResponse] = []
    ai_summary: str | None = None
    created_at: datetime


class CorrelationRunRequest(BaseModel):
    scan_id: str
