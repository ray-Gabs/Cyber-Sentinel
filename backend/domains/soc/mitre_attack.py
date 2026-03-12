# ============================================================
# backend/domains/soc/mitre_attack.py
# MITRE ATT&CK Tagging — Maps Wazuh alerts to ATT&CK techniques
# ============================================================
# Uses a built-in mapping table + optional LLM classification
# for unmapped rule groups.
# ============================================================

import logging
from typing import Optional

log = logging.getLogger(__name__)

# Static mapping: Wazuh rule groups → MITRE ATT&CK techniques
# Based on common Wazuh rule group conventions
RULE_GROUP_TO_ATTACK: dict[str, list[dict[str, str]]] = {
    # Initial Access
    "authentication_failed": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "brute_force": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "invalid_login": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "authentication_success": [
        {"tactic": "Initial Access", "technique": "T1078", "name": "Valid Accounts"},
    ],

    # Execution
    "web_attack": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "sql_injection": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
        {"tactic": "Collection", "technique": "T1213", "name": "Data from Information Repositories"},
    ],
    "xss": [
        {"tactic": "Initial Access", "technique": "T1189", "name": "Drive-by Compromise"},
    ],
    "shellshock": [
        {"tactic": "Execution", "technique": "T1059", "name": "Command and Scripting Interpreter"},
    ],

    # Persistence
    "rootkit": [
        {"tactic": "Persistence", "technique": "T1014", "name": "Rootkit"},
    ],
    "trojaned_version": [
        {"tactic": "Persistence", "technique": "T1554", "name": "Compromise Client Software Binary"},
    ],

    # Defense Evasion
    "syscheck": [
        {"tactic": "Defense Evasion", "technique": "T1070", "name": "Indicator Removal"},
    ],
    "file_integrity_monitoring": [
        {"tactic": "Defense Evasion", "technique": "T1070", "name": "Indicator Removal"},
    ],

    # Discovery
    "recon": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],
    "network_scan": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],
    "port_scan": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],

    # Lateral Movement
    "ssh": [
        {"tactic": "Lateral Movement", "technique": "T1021.004", "name": "Remote Services: SSH"},
    ],
    "rdp": [
        {"tactic": "Lateral Movement", "technique": "T1021.001", "name": "Remote Services: RDP"},
    ],

    # Collection
    "data_exfiltration": [
        {"tactic": "Exfiltration", "technique": "T1041", "name": "Exfiltration Over C2 Channel"},
    ],

    # Command and Control
    "dns": [
        {"tactic": "Command and Control", "technique": "T1071.004", "name": "Application Layer Protocol: DNS"},
    ],

    # Impact
    "ddos": [
        {"tactic": "Impact", "technique": "T1499", "name": "Endpoint Denial of Service"},
    ],

    # Privilege Escalation
    "sudo": [
        {"tactic": "Privilege Escalation", "technique": "T1548.003", "name": "Abuse Elevation Control Mechanism: Sudo"},
    ],

    # Policy Violation
    "policy_changed": [
        {"tactic": "Defense Evasion", "technique": "T1562", "name": "Impair Defenses"},
    ],

    # Vulnerability Detection
    "vulnerability-detector": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
}

# Keyword patterns in rule descriptions → ATT&CK mapping
KEYWORD_PATTERNS: list[dict] = [
    {"keywords": ["password", "credential", "login fail"], "tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    {"keywords": ["malware", "virus", "trojan"], "tactic": "Execution", "technique": "T1204", "name": "User Execution"},
    {"keywords": ["privilege escalation", "root access"], "tactic": "Privilege Escalation", "technique": "T1068", "name": "Exploitation for Privilege Escalation"},
    {"keywords": ["lateral movement", "remote exec"], "tactic": "Lateral Movement", "technique": "T1021", "name": "Remote Services"},
    {"keywords": ["exfiltration", "data theft", "data leak"], "tactic": "Exfiltration", "technique": "T1041", "name": "Exfiltration Over C2 Channel"},
    {"keywords": ["phishing", "spearphishing"], "tactic": "Initial Access", "technique": "T1566", "name": "Phishing"},
    {"keywords": ["ransomware", "encrypt"], "tactic": "Impact", "technique": "T1486", "name": "Data Encrypted for Impact"},
    {"keywords": ["command injection", "code injection"], "tactic": "Execution", "technique": "T1059", "name": "Command and Scripting Interpreter"},
    {"keywords": ["directory traversal", "path traversal"], "tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
]


def map_alert_to_attack(alert) -> list[dict[str, str]]:
    """
    Map a Wazuh alert to MITRE ATT&CK techniques.
    Uses rule groups first, then keyword matching on rule description.
    Returns a list of {tactic, technique, name} dicts.
    """
    techniques: list[dict[str, str]] = []
    seen: set[str] = set()

    # 1. Map by rule groups
    for group in alert.rule_groups:
        group_lower = group.lower().replace(" ", "_")
        for attack in RULE_GROUP_TO_ATTACK.get(group_lower, []):
            if attack["technique"] not in seen:
                techniques.append(attack)
                seen.add(attack["technique"])

    # 2. Keyword matching on rule description
    desc_lower = alert.rule_description.lower()
    for pattern in KEYWORD_PATTERNS:
        if any(kw in desc_lower for kw in pattern["keywords"]):
            if pattern["technique"] not in seen:
                techniques.append({
                    "tactic": pattern["tactic"],
                    "technique": pattern["technique"],
                    "name": pattern["name"],
                })
                seen.add(pattern["technique"])

    return techniques


async def enrich_alert_with_attack(alert, llm_service=None) -> list[dict[str, str]]:
    """
    Map alert to ATT&CK. Falls back to LLM classification for unmapped alerts.
    """
    techniques = map_alert_to_attack(alert)

    # If no static mapping found and LLM is available, use AI classification
    if not techniques and llm_service and alert.rule_level >= 5:
        try:
            techniques = await _llm_classify_attack(alert, llm_service)
        except Exception as e:
            log.warning("LLM ATT&CK classification failed: %s", str(e)[:200])

    return techniques


async def _llm_classify_attack(alert, llm_service) -> list[dict[str, str]]:
    """Use LLM to classify an alert into MITRE ATT&CK techniques."""
    import json

    prompt = (
        "You are a MITRE ATT&CK expert. Classify this SIEM alert into ATT&CK techniques.\n"
        "Return a JSON array of objects with keys: tactic, technique (e.g. T1110), name.\n"
        "Return at most 3 techniques. If unsure, return an empty array [].\n\n"
        f"Rule ID: {alert.rule_id}\n"
        f"Description: {alert.rule_description}\n"
        f"Level: {alert.rule_level}\n"
        f"Groups: {', '.join(alert.rule_groups)}\n"
        f"Log excerpt: {alert.full_log[:500]}\n"
    )

    text = await llm_service._generate(prompt, use_cache=True)

    # Parse JSON array from response
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        text = "\n".join(lines).strip()

    import re
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        items = json.loads(match.group())
        return [
            {"tactic": str(t.get("tactic", "")), "technique": str(t.get("technique", "")), "name": str(t.get("name", ""))}
            for t in items[:3]
            if t.get("technique")
        ]

    return []
