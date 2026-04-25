# ============================================================
# backend/domains/soc/rule_matcher.py — Custom Rule Matching
# ============================================================
# Matches incoming Wazuh alerts against user-defined detection rules.
# Rules use regex patterns checked against key alert fields.
# ============================================================

import logging
import re
from functools import lru_cache
from typing import Any

log = logging.getLogger(__name__)


@lru_cache(maxsize=256)
def _compile(pattern: str) -> re.Pattern | None:
    """Cache compiled regex patterns — same pattern is reused across all alerts in a batch."""
    try:
        return re.compile(pattern, re.IGNORECASE)
    except re.error:
        return None


# Global platform rules — visible to ALL users, read-only, no project scope.
# Keep these generic — they apply to any web app / Wazuh deployment.
DEFAULT_RULES: list[dict[str, Any]] = [
    {
        "name": "Failed Web Login",
        "description": "Detects failed authentication attempts on web applications",
        "pattern": r"authentication failed|invalid password|login failed|unauthorized|invalid credentials",
        "severity": "medium",
    },
    {
        "name": "Brute Force Attempt",
        "description": "Detects repeated authentication failures indicating brute force",
        "pattern": r"multiple authentication failures|blocked by|too many requests|rate limit|brute.?force",
        "severity": "high",
    },
    {
        "name": "SQL Injection Attempt",
        "description": "Detects SQL injection patterns in web requests",
        "pattern": r"sql syntax|mysql error|ORA-\d|union select|information_schema|sqlmap",
        "severity": "high",
    },
    {
        "name": "XSS Attempt",
        "description": "Detects cross-site scripting patterns in web requests",
        "pattern": r"<script[\s>]|onerror\s*=|javascript:|alert\s*\(|document\.cookie",
        "severity": "medium",
    },
    {
        "name": "Directory Traversal",
        "description": "Detects path traversal attempts",
        "pattern": r"\.\./|\.\.\\|etc/passwd|etc/shadow|/proc/self",
        "severity": "high",
    },
]

# Project-specific preset rules — seeded when a project is created.
# Keyed by slug fragment; matched against the project slug on creation.
PROJECT_PRESET_RULES: dict[str, list[dict[str, Any]]] = {
    "juice": [
        {
            "name": "JuiceShop Activity",
            "description": "Activity detected from OWASP Juice Shop agent",
            "pattern": r"juiceshop|juice.?shop",
            "severity": "medium",
        },
        {
            "name": "JuiceShop Forged JWT",
            "description": "Detects forged JWT tokens typical in Juice Shop challenges",
            "pattern": r"forged|invalid token|jwt.*invalid|tampered",
            "severity": "high",
        },
    ],
    "dvwa": [
        {
            "name": "DVWA Activity",
            "description": "Activity detected from DVWA (Damn Vulnerable Web Application) agent",
            "pattern": r"dvwa",
            "severity": "medium",
        },
    ],
}


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
        compiled = _compile(rule.pattern)
        if compiled is None:
            log.warning("[RuleMatcher] Invalid regex in rule '%s': %s", rule.name, rule.pattern)
            continue
        for field_val in check_fields:
            if field_val and compiled.search(field_val):
                matched.append(rule.name)
                break

    return matched


async def seed_default_rules() -> None:
    """
    Insert global platform rules (user_id='system', project_id=None) on first startup.
    App-specific presets (Juice Shop, DVWA) are NOT seeded here — they are scoped
    to individual projects and seeded by seed_project_rules() when a project is created.
    """
    from domains.soc.models import CustomDetectionRule

    try:
        count = await CustomDetectionRule.find(
            {"user_id": "system", "project_id": None}
        ).count()
        if count > 0:
            return

        for rule_data in DEFAULT_RULES:
            await CustomDetectionRule(
                user_id="system",
                project_id=None,
                name=rule_data["name"],
                description=rule_data["description"],
                pattern=rule_data["pattern"],
                severity=rule_data["severity"],
                enabled=True,
            ).insert()

        log.info("[RuleMatcher] Seeded %d global platform detection rules", len(DEFAULT_RULES))
    except Exception as exc:
        log.error("[RuleMatcher] Failed to seed default rules: %s", exc, exc_info=True)


async def seed_project_rules(project_id: str, project_slug: str) -> None:
    """
    Seed app-specific preset rules scoped to a newly created project.
    Called from the project creation endpoint.
    Rules are user_id='system' + project_id=<id> so only the project owner sees them.
    """
    from domains.soc.models import CustomDetectionRule

    try:
        existing = await CustomDetectionRule.find(
            {"user_id": "system", "project_id": project_id}
        ).count()
        if existing > 0:
            return

        matched_presets: list[dict[str, Any]] = []
        slug_lower = project_slug.lower()
        for key, presets in PROJECT_PRESET_RULES.items():
            if key in slug_lower:
                matched_presets.extend(presets)

        for rule_data in matched_presets:
            await CustomDetectionRule(
                user_id="system",
                project_id=project_id,
                name=rule_data["name"],
                description=rule_data["description"],
                pattern=rule_data["pattern"],
                severity=rule_data["severity"],
                enabled=True,
            ).insert()

        if matched_presets:
            log.info(
                "[RuleMatcher] Seeded %d preset rules for project %s (slug=%s)",
                len(matched_presets), project_id, project_slug,
            )
    except Exception as exc:
        log.error("[RuleMatcher] Failed to seed project rules for %s: %s", project_id, exc, exc_info=True)
