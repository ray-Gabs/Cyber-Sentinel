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


# Global platform rules were removed.
# Wazuh's native rule_groups (e.g. "web", "attack", "sql_injection") already classify
# these patterns on every incoming alert — duplicating them here only adds noise.
# App and project-specific context rules (below) are the correct layer for this system.
DEFAULT_RULES: list[dict[str, Any]] = []

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
    No-op: global platform rules were removed.

    Wazuh's native rule_groups field already classifies attack patterns on every alert —
    adding duplicate regex rules here only creates noise. App-specific presets are still
    seeded per-project by seed_project_rules() when a project is created.
    """
    log.debug("[RuleMatcher] seed_default_rules: no global platform rules to seed (by design)")


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
