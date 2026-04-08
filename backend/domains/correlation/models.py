# ============================================================
# backend/domains/correlation/models.py — Correlation Document
# ============================================================
# Links pentest scan findings ↔ Wazuh SOC alerts.
# ============================================================

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field


class CorrelationLink(BaseModel):
    """A single link between a finding and an alert."""
    finding_tool: str = ""
    finding_name: str = ""
    finding_severity: str = "info"
    finding_matched_at: str = ""
    alert_wazuh_id: str = ""
    alert_rule_id: str = ""
    alert_rule_description: str = ""
    alert_rule_level: int = 0
    correlation_type: str = ""       # ip_match | cve_match | attack_pattern | port_match | keyword
    confidence: float = 0.0          # 0.0 – 1.0


class Correlation(Document):
    """
    A correlation record linking a pentest scan to related Wazuh alerts.
    Stored in the 'correlations' collection.
    """
    scan_id: str
    scan_target: str
    total_links: int = 0
    links: list[CorrelationLink] = []
    ai_summary: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: Optional[datetime] = None

    class Settings:
        name = "correlations"
        use_state_management = True
