# ============================================================
# backend/domains/soc/models.py — Alert & AI Verdict Documents
# ============================================================

from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel


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

    # Enhanced triage fields (v2 pipeline)
    severity_label: Optional[str] = None       # CRITICAL | HIGH | MEDIUM | LOW | INFO
    response_recommendations: list[str] = []   # Ordered list of executable response actions
    false_positive_indicators: list[str] = []  # Evidence that the alert may be benign
    iocs: Optional[dict] = None                # {ips, domains, hashes, users, processes, files}
    triage_notes: Optional[str] = None         # Data quality caveats, truncated log warnings
    triage_version: str = "v1"                 # Pipeline version that produced this analysis

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

    # Project tagging
    project_id: Optional[str] = None

    # Multi-tenant isolation
    tenant_id: Optional[str] = None            # str(User.id) resolved from per-user wazuh_token
    agent_group: str = ""                      # Wazuh agent group, e.g. "tenant_juiceshop"

    # Meta
    ingested_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    analysed_at: Optional[datetime] = None
    triage_duration_ms: Optional[int] = None   # How long the full triage pipeline took

    class Settings:
        name = "alerts"
        use_state_management = True
        indexes = [
            IndexModel([("wazuh_id", ASCENDING)]),               # fast dedup lookup on ingest
            IndexModel([("timestamp", DESCENDING)]),
            IndexModel([("agent_id", ASCENDING)]),
            IndexModel([("agent_name", ASCENDING)]),             # agent_name filter in list_alerts
            IndexModel([("rule_level", DESCENDING)]),
            IndexModel([("ai_verdict", ASCENDING)]),
            IndexModel([("severity_label", ASCENDING)]),         # v2: filter by severity label
            IndexModel([("project_id", ASCENDING)]),             # project scoping
            # Compound for the most common list query: by agent + recency
            IndexModel([("agent_id", ASCENDING), ("timestamp", DESCENDING)]),
            # Compound for severity dashboard queries (rule_level >= X ORDER BY timestamp)
            IndexModel([("rule_level", DESCENDING), ("timestamp", DESCENDING)]),
            IndexModel([("tenant_id", ASCENDING)]),
            IndexModel([("tenant_id", ASCENDING), ("timestamp", DESCENDING)]),
            # SOC dashboard: filter by tenant + severity, sort by recency
            IndexModel([("tenant_id", ASCENDING), ("severity_label", ASCENDING), ("timestamp", DESCENDING)]),
            # AI triage queue: unanalyzed alerts by tenant
            IndexModel([("tenant_id", ASCENDING), ("ai_verdict", ASCENDING), ("timestamp", DESCENDING)]),
            # TTL — auto-expire alerts after 90 days
            IndexModel([("timestamp", ASCENDING)], expireAfterSeconds=7_776_000),
        ]


class CustomDetectionRule(Document):
    """
    User-defined detection rules that are matched against incoming Wazuh alerts.
    Stored in the 'custom_detection_rules' collection.

    Scoping:
      user_id="system" + project_id=None   → global platform rule (all users, read-only)
      user_id="system" + project_id=<id>   → preset seeded for a specific project (owner-only)
      user_id=<uid>    + project_id=None   → personal rule (that user only)
      user_id=<uid>    + project_id=<id>   → rule scoped to that user's project
    """
    user_id: str
    project_id: Optional[str] = None
    name: str
    description: str = ""
    pattern: str                               # Regex pattern
    severity: str                              # low | medium | high | critical
    enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    class Settings:
        name = "custom_detection_rules"
        indexes = [
            IndexModel([("user_id", ASCENDING)]),
            IndexModel([("user_id", ASCENDING), ("enabled", ASCENDING)]),
            IndexModel([("project_id", ASCENDING)]),
            # Compound for tenant-scoped rule queries (avoids full collection scan at ingest)
            IndexModel([("user_id", ASCENDING), ("project_id", ASCENDING), ("enabled", ASCENDING)]),
        ]


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
        indexes = [
            IndexModel([("alert_id", ASCENDING)]),
            IndexModel([("rule_id", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
            # TTL — expire AI verdict records after 90 days
            IndexModel([("created_at", ASCENDING)], expireAfterSeconds=7_776_000),
        ]
