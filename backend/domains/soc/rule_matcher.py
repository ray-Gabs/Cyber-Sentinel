# ============================================================
# backend/domains/soc/rule_matcher.py — Custom Rule Matching
# ============================================================
# Matches incoming Wazuh alerts against user-defined detection rules.
# Rules use regex patterns checked against key alert fields.
# ============================================================

import logging
import re
from typing import Any

log = logging.getLogger(__name__)

# Default rules seeded on first startup (user_id = "system")
DEFAULT_RULES: list[dict[str, Any]] = [
    {
        "name": "Failed Web Login",
        "description": "Detects failed authentication attempts on web applications",
        "pattern": r"authentication failed|invalid password|login failed|unauthorized|invalid credentials",
        "severity": "Medium",
    },
    {
        "name": "Brute Force Attempt",
        "description": "Detects repeated authentication failures indicating brute force",
        "pattern": r"multiple authentication failures|blocked by|too many requests|rate limit|brute.?force",
        "severity": "High",
    },
    {
        "name": "SQL Injection Attempt",
        "description": "Detects SQL injection patterns in web requests",
        "pattern": r"sql syntax|mysql error|ORA-\d|union select|information_schema|sqlmap",
        "severity": "High",
    },
    {
        "name": "XSS Attempt",
        "description": "Detects cross-site scripting patterns in web requests",
        "pattern": r"<script[\s>]|onerror\s*=|javascript:|alert\s*\(|document\.cookie",
        "severity": "Medium",
    },
    {
        "name": "Directory Traversal",
        "description": "Detects path traversal attempts",
        "pattern": r"\.\./|\.\.\\|etc/passwd|etc/shadow|/proc/self",
        "severity": "High",
    },
    {
        "name": "DVWA Activity",
        "description": "Activity detected from DVWA (Damn Vulnerable Web Application) agent",
        "pattern": r"dvwa",
        "severity": "Medium",
    },
    {
        "name": "JuiceShop Activity",
        "description": "Activity detected from OWASP Juice Shop agent",
        "pattern": r"juiceshop|juice.?shop",
        "severity": "Medium",
    },
]


def match_alert(alert_data: dict[str, Any], rules: list) -> list[str]:
    """
    Check an alert against a list of enabled CustomDetectionRule objects.
    Returns a list of matched rule names.

    Fields checked:
      - rule_description / rule.description
      - full_log
      - agent_name / agent.name
      - rule_id (as string)
      - data.srcip
    """
    matched: list[str] = []

    # Normalise to flat strings regardless of Wazuh alert format
    check_fields: list[str] = [
        str(alert_data.get("rule", {}).get("description", "") or alert_data.get("rule_description", "")),
        str(alert_data.get("full_log", "")),
        str(alert_data.get("agent", {}).get("name", "") or alert_data.get("agent_name", "")),
        str(alert_data.get("rule", {}).get("id", "") or alert_data.get("rule_id", "")),
        str((alert_data.get("data") or {}).get("srcip", "")),
    ]

    for rule in rules:
        if not getattr(rule, "enabled", True):
            continue
        try:
            compiled = re.compile(rule.pattern, re.IGNORECASE)
            for field_val in check_fields:
                if field_val and compiled.search(field_val):
                    matched.append(rule.name)
                    break
        except re.error:
            log.warning("[RuleMatcher] Invalid regex in rule '%s': %s", rule.name, rule.pattern)

    return matched


async def seed_default_rules() -> None:
    """
    Insert the 7 built-in detection rules for user_id='system' if the
    custom_detection_rules collection is empty.
    Called once at application startup.
    """
    from domains.soc.models import CustomDetectionRule

    try:
        count = await CustomDetectionRule.find(
            CustomDetectionRule.user_id == "system"
        ).count()
        if count > 0:
            return

        for rule_data in DEFAULT_RULES:
            await CustomDetectionRule(
                user_id="system",
                name=rule_data["name"],
                description=rule_data["description"],
                pattern=rule_data["pattern"],
                severity=rule_data["severity"],
                enabled=True,
            ).insert()

        log.info("[RuleMatcher] Seeded %d default detection rules", len(DEFAULT_RULES))
    except Exception as exc:
        log.error("[RuleMatcher] Failed to seed default rules: %s", exc, exc_info=True)
