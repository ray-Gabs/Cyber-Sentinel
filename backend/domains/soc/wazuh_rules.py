# ============================================================
# backend/domains/soc/wazuh_rules.py
# Custom SIEM Rules — Web Attack Pattern Templates for Wazuh
# ============================================================
# Provides a library of custom Wazuh rules targeting web attack
# patterns (SQLi, brute force, directory traversal, XSS, etc.)
# and utility to deploy them via the Wazuh API.
# ============================================================

import logging
from typing import Any

log = logging.getLogger(__name__)

# Custom Wazuh rules for web attack detection
# These follow Wazuh's XML rule format conventions.
# Rule IDs 100000+ are reserved for custom rules.
CUSTOM_RULES: list[dict[str, Any]] = [
    {
        "rule_id": 100001,
        "level": 10,
        "description": "SQL Injection attempt detected in web logs",
        "groups": ["web_attack", "sql_injection", "attack"],
        "regex": r"(?:union\s+select|select\s+.*\s+from|insert\s+into|delete\s+from|drop\s+table|or\s+1\s*=\s*1|'\s*or\s*'|--\s*$|/\*.*\*/)",
        "xml": """<rule id="100001" level="10">
  <if_group>web|accesslog|apache|nginx</if_group>
  <regex type="pcre2">(?i)(?:union\\s+select|select\\s+.*\\s+from|insert\\s+into|delete\\s+from|drop\\s+table|or\\s+1\\s*=\\s*1|'\\s*or\\s*'|--\\s*$|/\\*.*\\*/)</regex>
  <description>SQL Injection attempt detected in web request</description>
  <group>web_attack,sql_injection,attack,MITRE:T1190</group>
</rule>""",
    },
    {
        "rule_id": 100002,
        "level": 10,
        "description": "XSS (Cross-Site Scripting) attempt detected",
        "groups": ["web_attack", "xss", "attack"],
        "regex": r"(?:<script|javascript:|onerror\s*=|onload\s*=|alert\s*\(|document\.cookie|<img\s+src\s*=\s*['\"]?javascript)",
        "xml": """<rule id="100002" level="10">
  <if_group>web|accesslog|apache|nginx</if_group>
  <regex type="pcre2">(?i)(?:&lt;script|javascript:|onerror\\s*=|onload\\s*=|alert\\s*\\(|document\\.cookie|&lt;img\\s+src\\s*=\\s*['\"]?javascript)</regex>
  <description>XSS (Cross-Site Scripting) attempt detected</description>
  <group>web_attack,xss,attack,MITRE:T1189</group>
</rule>""",
    },
    {
        "rule_id": 100003,
        "level": 8,
        "description": "Directory traversal attempt detected",
        "groups": ["web_attack", "attack"],
        "regex": r"(?:\.\./|\.\.\\|%2e%2e%2f|%2e%2e/|\.%2e/|%2e\./)",
        "xml": """<rule id="100003" level="8">
  <if_group>web|accesslog|apache|nginx</if_group>
  <regex type="pcre2">(?i)(?:\\.\\./|\\.\\.\\\\|%2e%2e%2f|%2e%2e/|\\.%2e/|%2e\\.\\/)</regex>
  <description>Directory traversal attempt detected</description>
  <group>web_attack,attack,MITRE:T1190</group>
</rule>""",
    },
    {
        "rule_id": 100004,
        "level": 12,
        "description": "Web brute force attack — high frequency login failures",
        "groups": ["brute_force", "authentication_failed", "attack"],
        "xml": """<rule id="100004" level="12" frequency="10" timeframe="60">
  <if_matched_group>authentication_failed</if_matched_group>
  <same_source_ip />
  <description>Web brute force: 10+ login failures in 60 seconds from same IP</description>
  <group>brute_force,authentication_failed,attack,MITRE:T1110</group>
</rule>""",
    },
    {
        "rule_id": 100005,
        "level": 8,
        "description": "Command injection attempt in web request",
        "groups": ["web_attack", "command_injection", "attack"],
        "xml": """<rule id="100005" level="8">
  <if_group>web|accesslog|apache|nginx</if_group>
  <regex type="pcre2">(?i)(?:;\\s*(?:ls|cat|id|whoami|passwd|wget|curl)|\\|\\s*(?:ls|cat|id|whoami)|`[^`]+`|\\$\\(.*\\))</regex>
  <description>Command injection attempt detected in web request</description>
  <group>web_attack,command_injection,attack,MITRE:T1059</group>
</rule>""",
    },
    {
        "rule_id": 100006,
        "level": 10,
        "description": "File inclusion attempt (LFI/RFI)",
        "groups": ["web_attack", "attack"],
        "xml": """<rule id="100006" level="10">
  <if_group>web|accesslog|apache|nginx</if_group>
  <regex type="pcre2">(?i)(?:(?:etc\\/passwd|proc\\/self|windows\\/system32)|(?:php|data|expect|input|filter):\\/\\/|(?:include|require)(?:_once)?\\s*\\()</regex>
  <description>Local/Remote File Inclusion attempt detected</description>
  <group>web_attack,attack,MITRE:T1190</group>
</rule>""",
    },
    {
        "rule_id": 100007,
        "level": 6,
        "description": "Web scanner or automated tool detected",
        "groups": ["recon", "web_scan"],
        "xml": """<rule id="100007" level="6">
  <if_group>web|accesslog|apache|nginx</if_group>
  <regex type="pcre2">(?i)(?:nikto|sqlmap|nmap|masscan|dirbuster|gobuster|wfuzz|nuclei|burp|zap)</regex>
  <description>Automated security scanner detected in User-Agent or request</description>
  <group>recon,web_scan,MITRE:T1595</group>
</rule>""",
    },
    {
        "rule_id": 100008,
        "level": 10,
        "description": "Sensitive file access attempt",
        "groups": ["web_attack", "attack"],
        "xml": """<rule id="100008" level="10">
  <if_group>web|accesslog|apache|nginx</if_group>
  <regex type="pcre2">(?i)(?:\\.env|wp-config\\.php|\\.git\\/|config\\.php|database\\.yml|\\.htpasswd|\\.ssh\\/)</regex>
  <description>Attempt to access sensitive configuration file</description>
  <group>web_attack,attack,MITRE:T1083</group>
</rule>""",
    },
]


def get_rules_xml() -> str:
    """Compile all custom rules into a single Wazuh-compatible XML block."""
    rules_xml = ['<group name="cyber_sentinel_custom,">']
    for rule in CUSTOM_RULES:
        rules_xml.append(rule["xml"])
    rules_xml.append("</group>")
    return "\n\n".join(rules_xml)


async def deploy_rules_to_wazuh(
    wazuh_url: str | None = None,
    wazuh_user: str | None = None,
    wazuh_password: str | None = None,
) -> dict[str, Any]:
    """
    Deploy custom rules to Wazuh via its API.
    Uploads the rules as a custom rule file.

    If wazuh_url/user/password are provided (per-user lab credentials from the
    frontend), a fresh WazuhClient is created with those credentials instead of
    the server-wide .env defaults.
    """
    from domains.soc.wazuh_client import WazuhClient, wazuh_client

    client = (
        WazuhClient(base_url=wazuh_url, user=wazuh_user, password=wazuh_password)
        if wazuh_url
        else wazuh_client
    )

    rules_content = get_rules_xml()

    try:
        result = await client._request(
            "PUT",
            "/rules/files/cyber_sentinel_rules.xml",
            params={"overwrite": "true"},
            content=rules_content,
            headers={"Content-Type": "application/octet-stream"},
        )
        log.info("Custom rules deployed to Wazuh successfully")
        return {"status": "deployed", "rules_count": len(CUSTOM_RULES), "result": result}
    except Exception as e:
        log.error("Failed to deploy rules to Wazuh: %s", str(e)[:200])
        return {"status": "failed", "error": str(e)[:200]}
