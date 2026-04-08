# ============================================================
# backend/domains/soc/models.py — Alert & AI Verdict Documents
# ============================================================

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field


class Alert(Document):
    """
    A Wazuh alert ingested into Cyber Sentinel.
    Stored in the 'alerts' collection.
    """

    wazuh_id: str                              # Original alert ID from Wazuh
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    agent_id: str = ""
    agent_name: str = ""
    agent_ip: str = ""

    # Rule info
    rule_id: str = ""
    rule_description: str = ""
    rule_level: int = 0                        # Wazuh severity (0-15)
    rule_groups: list[str] = []

    # Raw data
    full_log: str = ""
    data: Optional[dict] = None                # syscheck, vulnerability, etc.

    # AI verdict (populated after LLM analysis)
    ai_verdict: Optional[str] = None           # TRUE_POSITIVE | FALSE_POSITIVE | UNKNOWN
    ai_confidence: Optional[float] = None      # 0.0 – 100.0
    ai_reasoning: Optional[str] = None
    ai_action: Optional[str] = None            # ESCALATE | MONITOR | DISMISS

    # MITRE ATT&CK mapping
    mitre_tactics: list[str] = []              # e.g. ["Credential Access", "Initial Access"]
    mitre_techniques: list[dict] = []          # e.g. [{"tactic": "...", "technique": "T1110", "name": "Brute Force"}]

    # Threat Intelligence enrichment
    threat_intel: Optional[dict] = None        # VT + AbuseIPDB results

    # Human analyst override
    analyst_override: Optional[str] = None     # TRUE_POSITIVE | FALSE_POSITIVE
    analyst_notes: Optional[str] = None

    # Custom rule matches (populated at ingestion time)
    matched_rules: list[str] = []

    # Meta
    ingested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    analysed_at: Optional[datetime] = None

    class Settings:
        name = "alerts"
        use_state_management = True


class CustomDetectionRule(Document):
    """
    User-defined detection rules that are matched against incoming Wazuh alerts.
    Stored in the 'custom_detection_rules' collection.
    """
    user_id: str
    name: str
    description: str
    pattern: str                               # Regex pattern
    severity: str                              # Low | Medium | High | Critical
    enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "custom_detection_rules"


class AiVerdict(Document):
    """
    Historical AI analysis records — used for the feedback loop.
    Separating from Alert so we keep a clean audit trail even
    when re-analysing.
    """

    alert_id: str
    rule_id: str
    verdict: str               # TRUE_POSITIVE | FALSE_POSITIVE
    confidence: float
    reasoning: str
    action: str                # ESCALATE | MONITOR | DISMISS
    analyst_agreed: Optional[bool] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "ai_verdicts"
