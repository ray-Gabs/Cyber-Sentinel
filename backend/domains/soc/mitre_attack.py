# ============================================================
# backend/domains/soc/mitre_attack.py
# MITRE ATT&CK Tagging — Maps Wazuh alerts to ATT&CK techniques
# ============================================================

import logging

log = logging.getLogger(__name__)


def extract_wazuh_mitre(raw: dict) -> list[dict[str, str]]:
    """
    Parse MITRE ATT&CK mapping from Wazuh's native rule.mitre field.

    Wazuh stores this in the alert JSON as:
        rule.mitre.id        → ["T1110"] (technique IDs)
        rule.mitre.tactic    → ["Credential Access"]
        rule.mitre.technique → ["Brute Force"] (technique names)

    Values may be a list or a bare string depending on Wazuh version.
    Returns [] if rule.mitre is absent or empty.
    """
    rule_mitre = raw.get("rule", {}).get("mitre", {})
    if not rule_mitre:
        return []

    def _listify(val) -> list:
        if isinstance(val, list):
            return val
        return [val] if val else []

    ids = _listify(rule_mitre.get("id"))
    tactics = _listify(rule_mitre.get("tactic"))
    names = _listify(rule_mitre.get("technique"))

    if not ids:
        return []

    techniques: list[dict[str, str]] = []
    seen: set[str] = set()
    for i, tech_id in enumerate(ids):
        if not tech_id or tech_id in seen:
            continue
        seen.add(tech_id)
        techniques.append({
            "tactic": tactics[i] if i < len(tactics) else "Unknown",
            "technique": tech_id,
            "name": names[i] if i < len(names) else tech_id,
        })

    return techniques


# ─────────────────────────────────────────────────────────────────────────────
# Static mapping: Wazuh rule groups → MITRE ATT&CK techniques
# Covers the most common Wazuh rule groups across all default rulesets.
# Key format: lowercase, spaces → underscores (matches Wazuh group naming).
# ─────────────────────────────────────────────────────────────────────────────
RULE_GROUP_TO_ATTACK: dict[str, list[dict[str, str]]] = {

    # ── Credential Access ─────────────────────────────────────────────────────
    "authentication_failed": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "authentication_failures": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "brute_force": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "invalid_login": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "login_failed": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "multiple_authentication_failures": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "multiple_auth_failures": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "win_auth_failure": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "credential_access": [
        {"tactic": "Credential Access", "technique": "T1555", "name": "Credentials from Password Stores"},
    ],
    "password_policy": [
        {"tactic": "Credential Access", "technique": "T1201", "name": "Password Policy Discovery"},
    ],

    # ── Initial Access ────────────────────────────────────────────────────────
    "authentication_success": [
        {"tactic": "Initial Access", "technique": "T1078", "name": "Valid Accounts"},
    ],
    "valid_accounts": [
        {"tactic": "Initial Access", "technique": "T1078", "name": "Valid Accounts"},
    ],
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
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "exploit": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "phishing": [
        {"tactic": "Initial Access", "technique": "T1566", "name": "Phishing"},
    ],
    "spearphishing": [
        {"tactic": "Initial Access", "technique": "T1566.001", "name": "Phishing: Spearphishing Attachment"},
    ],
    "lfi": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
        {"tactic": "Collection", "technique": "T1005", "name": "Data from Local System"},
    ],
    "rfi": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
        {"tactic": "Execution", "technique": "T1059", "name": "Command and Scripting Interpreter"},
    ],
    "rce": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
        {"tactic": "Execution", "technique": "T1059", "name": "Command and Scripting Interpreter"},
    ],
    "path_traversal": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "directory_traversal": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "external_remote_services": [
        {"tactic": "Initial Access", "technique": "T1133", "name": "External Remote Services"},
    ],
    "vpn": [
        {"tactic": "Initial Access", "technique": "T1133", "name": "External Remote Services"},
    ],
    "openvpn": [
        {"tactic": "Initial Access", "technique": "T1133", "name": "External Remote Services"},
    ],

    # ── Execution ─────────────────────────────────────────────────────────────
    "command_injection": [
        {"tactic": "Execution", "technique": "T1059", "name": "Command and Scripting Interpreter"},
    ],
    "shell": [
        {"tactic": "Execution", "technique": "T1059", "name": "Command and Scripting Interpreter"},
    ],
    "powershell": [
        {"tactic": "Execution", "technique": "T1059.001", "name": "Command and Scripting Interpreter: PowerShell"},
    ],
    "win_powershell": [
        {"tactic": "Execution", "technique": "T1059.001", "name": "Command and Scripting Interpreter: PowerShell"},
    ],
    "bash": [
        {"tactic": "Execution", "technique": "T1059.004", "name": "Command and Scripting Interpreter: Unix Shell"},
    ],
    "python": [
        {"tactic": "Execution", "technique": "T1059.006", "name": "Command and Scripting Interpreter: Python"},
    ],
    "cron": [
        {"tactic": "Execution", "technique": "T1053.003", "name": "Scheduled Task/Job: Cron"},
        {"tactic": "Persistence", "technique": "T1053.003", "name": "Scheduled Task/Job: Cron"},
    ],
    "at": [
        {"tactic": "Execution", "technique": "T1053.002", "name": "Scheduled Task/Job: At"},
        {"tactic": "Persistence", "technique": "T1053.002", "name": "Scheduled Task/Job: At"},
    ],
    "scheduled_task": [
        {"tactic": "Execution", "technique": "T1053", "name": "Scheduled Task/Job"},
        {"tactic": "Persistence", "technique": "T1053", "name": "Scheduled Task/Job"},
    ],
    "win_scheduled_task": [
        {"tactic": "Execution", "technique": "T1053.005", "name": "Scheduled Task/Job: Scheduled Task"},
    ],
    "wmi": [
        {"tactic": "Execution", "technique": "T1047", "name": "Windows Management Instrumentation"},
    ],
    "mshta": [
        {"tactic": "Execution", "technique": "T1218.005", "name": "System Binary Proxy Execution: Mshta"},
    ],
    "rundll32": [
        {"tactic": "Execution", "technique": "T1218.011", "name": "System Binary Proxy Execution: Rundll32"},
    ],
    "regsvr32": [
        {"tactic": "Execution", "technique": "T1218.010", "name": "System Binary Proxy Execution: Regsvr32"},
    ],
    "malicious_macros": [
        {"tactic": "Execution", "technique": "T1204.002", "name": "User Execution: Malicious File"},
    ],

    # ── Persistence ───────────────────────────────────────────────────────────
    "rootkit": [
        {"tactic": "Persistence", "technique": "T1014", "name": "Rootkit"},
        {"tactic": "Defense Evasion", "technique": "T1014", "name": "Rootkit"},
    ],
    "rootcheck": [
        {"tactic": "Persistence", "technique": "T1014", "name": "Rootkit"},
    ],
    "trojaned_version": [
        {"tactic": "Persistence", "technique": "T1554", "name": "Compromise Client Software Binary"},
    ],
    "startup": [
        {"tactic": "Persistence", "technique": "T1547", "name": "Boot or Logon Autostart Execution"},
    ],
    "registry": [
        {"tactic": "Persistence", "technique": "T1547.001", "name": "Boot or Logon Autostart Execution: Registry Run Keys"},
    ],
    "win_registry": [
        {"tactic": "Persistence", "technique": "T1547.001", "name": "Boot or Logon Autostart Execution: Registry Run Keys"},
    ],
    "account_added": [
        {"tactic": "Persistence", "technique": "T1136", "name": "Create Account"},
    ],
    "adduser": [
        {"tactic": "Persistence", "technique": "T1136", "name": "Create Account"},
    ],
    "useradd": [
        {"tactic": "Persistence", "technique": "T1136.001", "name": "Create Account: Local Account"},
    ],
    "lkm": [
        {"tactic": "Persistence", "technique": "T1547.006", "name": "Boot or Logon Autostart Execution: Kernel Modules"},
    ],
    "kernel_module": [
        {"tactic": "Persistence", "technique": "T1547.006", "name": "Boot or Logon Autostart Execution: Kernel Modules"},
    ],
    "web_shell": [
        {"tactic": "Persistence", "technique": "T1505.003", "name": "Server Software Component: Web Shell"},
    ],
    "backdoor": [
        {"tactic": "Persistence", "technique": "T1505", "name": "Server Software Component"},
    ],

    # ── Privilege Escalation ──────────────────────────────────────────────────
    "sudo": [
        {"tactic": "Privilege Escalation", "technique": "T1548.003", "name": "Abuse Elevation Control Mechanism: Sudo and Sudo Caching"},
    ],
    "su": [
        {"tactic": "Privilege Escalation", "technique": "T1548.003", "name": "Abuse Elevation Control Mechanism: Sudo and Sudo Caching"},
    ],
    "privilege_escalation": [
        {"tactic": "Privilege Escalation", "technique": "T1068", "name": "Exploitation for Privilege Escalation"},
    ],
    "setuid": [
        {"tactic": "Privilege Escalation", "technique": "T1548.001", "name": "Abuse Elevation Control Mechanism: Setuid and Setgid"},
    ],
    "uac_bypass": [
        {"tactic": "Privilege Escalation", "technique": "T1548.002", "name": "Abuse Elevation Control Mechanism: Bypass User Account Control"},
    ],
    "win_privilege_event": [
        {"tactic": "Privilege Escalation", "technique": "T1068", "name": "Exploitation for Privilege Escalation"},
    ],
    "process_injection": [
        {"tactic": "Privilege Escalation", "technique": "T1055", "name": "Process Injection"},
        {"tactic": "Defense Evasion", "technique": "T1055", "name": "Process Injection"},
    ],

    # ── Defense Evasion ───────────────────────────────────────────────────────
    "syscheck": [
        {"tactic": "Defense Evasion", "technique": "T1565.001", "name": "Data Manipulation: Stored Data Manipulation"},
    ],
    "file_integrity_monitoring": [
        {"tactic": "Defense Evasion", "technique": "T1565.001", "name": "Data Manipulation: Stored Data Manipulation"},
    ],
    "fim": [
        {"tactic": "Defense Evasion", "technique": "T1565.001", "name": "Data Manipulation: Stored Data Manipulation"},
    ],
    "syscheck_integrity_changed": [
        {"tactic": "Defense Evasion", "technique": "T1565.001", "name": "Data Manipulation: Stored Data Manipulation"},
    ],
    "syscheck_integrity_deleted": [
        {"tactic": "Impact", "technique": "T1485", "name": "Data Destruction"},
    ],
    "syscheck_integrity_added": [
        {"tactic": "Defense Evasion", "technique": "T1105", "name": "Ingress Tool Transfer"},
    ],
    "policy_changed": [
        {"tactic": "Defense Evasion", "technique": "T1562", "name": "Impair Defenses"},
    ],
    "firewall_drop": [
        {"tactic": "Defense Evasion", "technique": "T1562.004", "name": "Impair Defenses: Disable or Modify System Firewall"},
    ],
    "log_clear": [
        {"tactic": "Defense Evasion", "technique": "T1070.001", "name": "Indicator Removal: Clear Windows Event Logs"},
    ],
    "log_deletion": [
        {"tactic": "Defense Evasion", "technique": "T1070.002", "name": "Indicator Removal: Clear Linux or Mac System Logs"},
    ],
    "audit_log_cleared": [
        {"tactic": "Defense Evasion", "technique": "T1070.001", "name": "Indicator Removal: Clear Windows Event Logs"},
    ],
    "win_audit_failure": [
        {"tactic": "Defense Evasion", "technique": "T1562.002", "name": "Impair Defenses: Disable Windows Event Logging"},
    ],
    "masquerading": [
        {"tactic": "Defense Evasion", "technique": "T1036", "name": "Masquerading"},
    ],
    "obfuscation": [
        {"tactic": "Defense Evasion", "technique": "T1027", "name": "Obfuscated Files or Information"},
    ],
    "packed": [
        {"tactic": "Defense Evasion", "technique": "T1027.002", "name": "Obfuscated Files or Information: Software Packing"},
    ],
    "encoding": [
        {"tactic": "Defense Evasion", "technique": "T1027", "name": "Obfuscated Files or Information"},
    ],
    "timestomping": [
        {"tactic": "Defense Evasion", "technique": "T1070.006", "name": "Indicator Removal: Timestomp"},
    ],

    # ── Discovery ─────────────────────────────────────────────────────────────
    "recon": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],
    "network_scan": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],
    "port_scan": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],
    "scan": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],
    "nmap": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],
    "promisc": [
        {"tactic": "Discovery", "technique": "T1040", "name": "Network Sniffing"},
    ],
    "sca": [
        {"tactic": "Discovery", "technique": "T1082", "name": "System Information Discovery"},
    ],
    "osquery": [
        {"tactic": "Discovery", "technique": "T1082", "name": "System Information Discovery"},
    ],
    "system_info": [
        {"tactic": "Discovery", "technique": "T1082", "name": "System Information Discovery"},
    ],
    "process_discovery": [
        {"tactic": "Discovery", "technique": "T1057", "name": "Process Discovery"},
    ],
    "account_discovery": [
        {"tactic": "Discovery", "technique": "T1087", "name": "Account Discovery"},
    ],
    "win_user_enum": [
        {"tactic": "Discovery", "technique": "T1087.001", "name": "Account Discovery: Local Account"},
    ],
    "network_discovery": [
        {"tactic": "Discovery", "technique": "T1018", "name": "Remote System Discovery"},
    ],
    "permission_groups": [
        {"tactic": "Discovery", "technique": "T1069", "name": "Permission Groups Discovery"},
    ],

    # ── Lateral Movement ──────────────────────────────────────────────────────
    "ssh": [
        {"tactic": "Lateral Movement", "technique": "T1021.004", "name": "Remote Services: SSH"},
    ],
    "rdp": [
        {"tactic": "Lateral Movement", "technique": "T1021.001", "name": "Remote Services: Remote Desktop Protocol"},
    ],
    "smb": [
        {"tactic": "Lateral Movement", "technique": "T1021.002", "name": "Remote Services: SMB/Windows Admin Shares"},
    ],
    "samba": [
        {"tactic": "Lateral Movement", "technique": "T1021.002", "name": "Remote Services: SMB/Windows Admin Shares"},
    ],
    "vnc": [
        {"tactic": "Lateral Movement", "technique": "T1021.005", "name": "Remote Services: VNC"},
    ],
    "telnet": [
        {"tactic": "Lateral Movement", "technique": "T1021", "name": "Remote Services"},
    ],
    "ftp": [
        {"tactic": "Lateral Movement", "technique": "T1021", "name": "Remote Services"},
    ],
    "pass_the_hash": [
        {"tactic": "Lateral Movement", "technique": "T1550.002", "name": "Use Alternate Authentication Material: Pass the Hash"},
    ],
    "pass_the_ticket": [
        {"tactic": "Lateral Movement", "technique": "T1550.003", "name": "Use Alternate Authentication Material: Pass the Ticket"},
    ],

    # ── Collection ────────────────────────────────────────────────────────────
    "data_exfiltration": [
        {"tactic": "Collection", "technique": "T1005", "name": "Data from Local System"},
        {"tactic": "Exfiltration", "technique": "T1041", "name": "Exfiltration Over C2 Channel"},
    ],
    "clipboard": [
        {"tactic": "Collection", "technique": "T1115", "name": "Clipboard Data"},
    ],
    "screenshot": [
        {"tactic": "Collection", "technique": "T1113", "name": "Screen Capture"},
    ],
    "keylogger": [
        {"tactic": "Collection", "technique": "T1056.001", "name": "Input Capture: Keylogging"},
    ],
    "email_collection": [
        {"tactic": "Collection", "technique": "T1114", "name": "Email Collection"},
    ],

    # ── Command and Control ───────────────────────────────────────────────────
    "dns": [
        {"tactic": "Command and Control", "technique": "T1071.004", "name": "Application Layer Protocol: DNS"},
    ],
    "http": [
        {"tactic": "Command and Control", "technique": "T1071.001", "name": "Application Layer Protocol: Web Protocols"},
    ],
    "https": [
        {"tactic": "Command and Control", "technique": "T1071.001", "name": "Application Layer Protocol: Web Protocols"},
    ],
    "c2": [
        {"tactic": "Command and Control", "technique": "T1071", "name": "Application Layer Protocol"},
    ],
    "beacon": [
        {"tactic": "Command and Control", "technique": "T1071", "name": "Application Layer Protocol"},
    ],
    "tunneling": [
        {"tactic": "Command and Control", "technique": "T1572", "name": "Protocol Tunneling"},
    ],
    "dns_tunneling": [
        {"tactic": "Command and Control", "technique": "T1071.004", "name": "Application Layer Protocol: DNS"},
        {"tactic": "Command and Control", "technique": "T1572", "name": "Protocol Tunneling"},
    ],
    "tor": [
        {"tactic": "Command and Control", "technique": "T1090.003", "name": "Proxy: Multi-hop Proxy"},
    ],
    "proxy": [
        {"tactic": "Command and Control", "technique": "T1090", "name": "Proxy"},
    ],

    # ── Exfiltration ──────────────────────────────────────────────────────────
    "exfiltration": [
        {"tactic": "Exfiltration", "technique": "T1041", "name": "Exfiltration Over C2 Channel"},
    ],
    "data_leak": [
        {"tactic": "Exfiltration", "technique": "T1048", "name": "Exfiltration Over Alternative Protocol"},
    ],
    "large_upload": [
        {"tactic": "Exfiltration", "technique": "T1048", "name": "Exfiltration Over Alternative Protocol"},
    ],

    # ── Impact ────────────────────────────────────────────────────────────────
    "ddos": [
        {"tactic": "Impact", "technique": "T1499", "name": "Endpoint Denial of Service"},
    ],
    "ransomware": [
        {"tactic": "Impact", "technique": "T1486", "name": "Data Encrypted for Impact"},
    ],
    "disk_fill": [
        {"tactic": "Impact", "technique": "T1485", "name": "Data Destruction"},
    ],
    "data_destruction": [
        {"tactic": "Impact", "technique": "T1485", "name": "Data Destruction"},
    ],
    "defacement": [
        {"tactic": "Impact", "technique": "T1491", "name": "Defacement"},
    ],
    "resource_hijacking": [
        {"tactic": "Impact", "technique": "T1496", "name": "Resource Hijacking"},
    ],
    "cryptominer": [
        {"tactic": "Impact", "technique": "T1496", "name": "Resource Hijacking"},
    ],
    "dos": [
        {"tactic": "Impact", "technique": "T1499", "name": "Endpoint Denial of Service"},
    ],

    # ── Web Servers ───────────────────────────────────────────────────────────
    "apache": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "nginx": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "iis": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "tomcat": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "webserver": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "php": [
        {"tactic": "Execution", "technique": "T1059.004", "name": "Command and Scripting Interpreter: Unix Shell"},
    ],
    "wordpress": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "drupal": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "joomla": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],

    # ── Databases ─────────────────────────────────────────────────────────────
    "mysql": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
        {"tactic": "Collection", "technique": "T1213", "name": "Data from Information Repositories"},
    ],
    "postgresql": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
        {"tactic": "Collection", "technique": "T1213", "name": "Data from Information Repositories"},
    ],
    "mongodb": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "redis": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "mssql": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
        {"tactic": "Collection", "technique": "T1213", "name": "Data from Information Repositories"},
    ],

    # ── Cloud ─────────────────────────────────────────────────────────────────
    "aws": [
        {"tactic": "Collection", "technique": "T1530", "name": "Data from Cloud Storage"},
    ],
    "gcp": [
        {"tactic": "Collection", "technique": "T1530", "name": "Data from Cloud Storage"},
    ],
    "azure": [
        {"tactic": "Collection", "technique": "T1530", "name": "Data from Cloud Storage"},
    ],
    "office365": [
        {"tactic": "Collection", "technique": "T1114.002", "name": "Email Collection: Remote Email Collection"},
    ],
    "o365": [
        {"tactic": "Collection", "technique": "T1114.002", "name": "Email Collection: Remote Email Collection"},
    ],
    "google_workspace": [
        {"tactic": "Collection", "technique": "T1530", "name": "Data from Cloud Storage"},
    ],

    # ── Windows Specific ──────────────────────────────────────────────────────
    "win": [
        {"tactic": "Discovery", "technique": "T1082", "name": "System Information Discovery"},
    ],
    "windows": [
        {"tactic": "Discovery", "technique": "T1082", "name": "System Information Discovery"},
    ],
    "win_evt": [
        {"tactic": "Defense Evasion", "technique": "T1562.002", "name": "Impair Defenses: Disable Windows Event Logging"},
    ],
    "ms-exchange": [
        {"tactic": "Collection", "technique": "T1114", "name": "Email Collection"},
    ],
    "msauth": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],
    "mswindows": [
        {"tactic": "Discovery", "technique": "T1082", "name": "System Information Discovery"},
    ],
    "win_local_user": [
        {"tactic": "Persistence", "technique": "T1136.001", "name": "Create Account: Local Account"},
    ],
    "win_group_modification": [
        {"tactic": "Persistence", "technique": "T1098", "name": "Account Manipulation"},
    ],

    # ── Linux / Unix ──────────────────────────────────────────────────────────
    "kernel": [
        {"tactic": "Persistence", "technique": "T1014", "name": "Rootkit"},
    ],
    "auditd": [
        {"tactic": "Defense Evasion", "technique": "T1562.006", "name": "Impair Defenses: Indicator Blocking"},
    ],
    "syslog": [
        {"tactic": "Discovery", "technique": "T1082", "name": "System Information Discovery"},
    ],
    "pam": [
        {"tactic": "Credential Access", "technique": "T1556", "name": "Modify Authentication Process"},
    ],
    "pam_unix": [
        {"tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    ],

    # ── Network Intrusion Detection ───────────────────────────────────────────
    "snort": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],
    "suricata": [
        {"tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    ],
    "zeek": [
        {"tactic": "Discovery", "technique": "T1040", "name": "Network Sniffing"},
    ],
    "bro": [
        {"tactic": "Discovery", "technique": "T1040", "name": "Network Sniffing"},
    ],

    # ── Containers / DevOps ───────────────────────────────────────────────────
    "docker": [
        {"tactic": "Defense Evasion", "technique": "T1610", "name": "Deploy Container"},
    ],
    "container": [
        {"tactic": "Defense Evasion", "technique": "T1610", "name": "Deploy Container"},
    ],
    "kubernetes": [
        {"tactic": "Defense Evasion", "technique": "T1610", "name": "Deploy Container"},
    ],

    # ── Directory Services ────────────────────────────────────────────────────
    "openldap": [
        {"tactic": "Discovery", "technique": "T1087.002", "name": "Account Discovery: Domain Account"},
    ],
    "ldap": [
        {"tactic": "Discovery", "technique": "T1087.002", "name": "Account Discovery: Domain Account"},
    ],
    "active_directory": [
        {"tactic": "Discovery", "technique": "T1087.002", "name": "Account Discovery: Domain Account"},
    ],
    "kerberos": [
        {"tactic": "Credential Access", "technique": "T1558", "name": "Steal or Forge Kerberos Tickets"},
    ],

    # ── Email / Mail ──────────────────────────────────────────────────────────
    "smtp": [
        {"tactic": "Initial Access", "technique": "T1566.001", "name": "Phishing: Spearphishing Attachment"},
    ],
    "mail": [
        {"tactic": "Initial Access", "technique": "T1566", "name": "Phishing"},
    ],
    "postfix": [
        {"tactic": "Initial Access", "technique": "T1566.001", "name": "Phishing: Spearphishing Attachment"},
    ],
    "sendmail": [
        {"tactic": "Initial Access", "technique": "T1566.001", "name": "Phishing: Spearphishing Attachment"},
    ],
    "spam": [
        {"tactic": "Initial Access", "technique": "T1566", "name": "Phishing"},
    ],

    # ── Network Devices ───────────────────────────────────────────────────────
    "cisco": [
        {"tactic": "Defense Evasion", "technique": "T1562.004", "name": "Impair Defenses: Disable or Modify System Firewall"},
    ],
    "paloalto": [
        {"tactic": "Defense Evasion", "technique": "T1562.004", "name": "Impair Defenses: Disable or Modify System Firewall"},
    ],
    "checkpoint": [
        {"tactic": "Defense Evasion", "technique": "T1562.004", "name": "Impair Defenses: Disable or Modify System Firewall"},
    ],
    "fortinet": [
        {"tactic": "Defense Evasion", "technique": "T1562.004", "name": "Impair Defenses: Disable or Modify System Firewall"},
    ],
    "juniper": [
        {"tactic": "Defense Evasion", "technique": "T1562.004", "name": "Impair Defenses: Disable or Modify System Firewall"},
    ],
    "iptables": [
        {"tactic": "Defense Evasion", "technique": "T1562.004", "name": "Impair Defenses: Disable or Modify System Firewall"},
    ],
    "netfilter": [
        {"tactic": "Defense Evasion", "technique": "T1562.004", "name": "Impair Defenses: Disable or Modify System Firewall"},
    ],

    # ── FTP Servers ───────────────────────────────────────────────────────────
    "proftpd": [
        {"tactic": "Lateral Movement", "technique": "T1021", "name": "Remote Services"},
    ],
    "vsftpd": [
        {"tactic": "Lateral Movement", "technique": "T1021", "name": "Remote Services"},
    ],
    "pure_ftpd": [
        {"tactic": "Lateral Movement", "technique": "T1021", "name": "Remote Services"},
    ],

    # ── Malware Detection ─────────────────────────────────────────────────────
    "malware": [
        {"tactic": "Execution", "technique": "T1204", "name": "User Execution"},
    ],
    "trojan": [
        {"tactic": "Execution", "technique": "T1204", "name": "User Execution"},
    ],
    "virus": [
        {"tactic": "Execution", "technique": "T1204", "name": "User Execution"},
    ],
    "worm": [
        {"tactic": "Lateral Movement", "technique": "T1210", "name": "Exploitation of Remote Services"},
    ],
    "spyware": [
        {"tactic": "Collection", "technique": "T1056", "name": "Input Capture"},
    ],
    "adware": [
        {"tactic": "Execution", "technique": "T1204", "name": "User Execution"},
    ],

    # ── Account & Access Management ───────────────────────────────────────────
    "account_changed": [
        {"tactic": "Persistence", "technique": "T1098", "name": "Account Manipulation"},
    ],
    "password_changed": [
        {"tactic": "Persistence", "technique": "T1098", "name": "Account Manipulation"},
    ],
    "user_deleted": [
        {"tactic": "Defense Evasion", "technique": "T1070", "name": "Indicator Removal"},
    ],
    "group_changed": [
        {"tactic": "Persistence", "technique": "T1098", "name": "Account Manipulation"},
    ],
    "access_control": [
        {"tactic": "Persistence", "technique": "T1098", "name": "Account Manipulation"},
    ],

    # ── Vulnerability Detection ───────────────────────────────────────────────
    "vulnerability-detector": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "vulnerability_detector": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "vuln": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],
    "cve": [
        {"tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    ],

    # ── OSSEC / Wazuh Internal ────────────────────────────────────────────────
    "ossec": [
        {"tactic": "Defense Evasion", "technique": "T1070", "name": "Indicator Removal"},
    ],
    "gdpr": [
        {"tactic": "Collection", "technique": "T1005", "name": "Data from Local System"},
    ],
    "pci_dss": [
        {"tactic": "Collection", "technique": "T1005", "name": "Data from Local System"},
    ],
    "hipaa": [
        {"tactic": "Collection", "technique": "T1005", "name": "Data from Local System"},
    ],
    "nist": [
        {"tactic": "Discovery", "technique": "T1082", "name": "System Information Discovery"},
    ],
    "tsc": [
        {"tactic": "Discovery", "technique": "T1082", "name": "System Information Discovery"},
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# Keyword patterns for rule descriptions that don't match any rule group.
# Checked in order — first matching keyword wins per pattern.
# ─────────────────────────────────────────────────────────────────────────────
KEYWORD_PATTERNS: list[dict] = [
    {"keywords": ["brute force", "too many failures", "multiple failed", "authentication failure"],
     "tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    {"keywords": ["password", "credential", "login fail", "login denied"],
     "tactic": "Credential Access", "technique": "T1110", "name": "Brute Force"},
    {"keywords": ["invalid user", "no such user", "unknown user"],
     "tactic": "Credential Access", "technique": "T1110.003", "name": "Brute Force: Password Spraying"},
    {"keywords": ["malware", "virus", "trojan", "ransomware detected"],
     "tactic": "Execution", "technique": "T1204", "name": "User Execution"},
    {"keywords": ["privilege escalation", "root access", "gained root", "escalated"],
     "tactic": "Privilege Escalation", "technique": "T1068", "name": "Exploitation for Privilege Escalation"},
    {"keywords": ["lateral movement", "remote exec", "pass the hash", "psexec"],
     "tactic": "Lateral Movement", "technique": "T1021", "name": "Remote Services"},
    {"keywords": ["exfiltration", "data theft", "data leak", "large data transfer"],
     "tactic": "Exfiltration", "technique": "T1041", "name": "Exfiltration Over C2 Channel"},
    {"keywords": ["phishing", "spearphishing", "malicious email"],
     "tactic": "Initial Access", "technique": "T1566", "name": "Phishing"},
    {"keywords": ["ransomware", "file encrypted", "files encrypted", ".locked"],
     "tactic": "Impact", "technique": "T1486", "name": "Data Encrypted for Impact"},
    {"keywords": ["command injection", "code injection", "remote code execution"],
     "tactic": "Execution", "technique": "T1059", "name": "Command and Scripting Interpreter"},
    {"keywords": ["directory traversal", "path traversal", "../", "..\\"],
     "tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    {"keywords": ["sql injection", "sqli", "union select", "1=1"],
     "tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    {"keywords": ["xss", "cross-site scripting", "script injection", "<script"],
     "tactic": "Initial Access", "technique": "T1189", "name": "Drive-by Compromise"},
    {"keywords": ["port scan", "network scan", "host discovery", "nmap"],
     "tactic": "Discovery", "technique": "T1046", "name": "Network Service Discovery"},
    {"keywords": ["new user", "user added", "account created", "useradd"],
     "tactic": "Persistence", "technique": "T1136", "name": "Create Account"},
    {"keywords": ["sudo", "su root", "switched to root"],
     "tactic": "Privilege Escalation", "technique": "T1548.003", "name": "Abuse Elevation Control Mechanism: Sudo"},
    {"keywords": ["file modified", "file changed", "integrity", "checksum"],
     "tactic": "Defense Evasion", "technique": "T1565.001", "name": "Data Manipulation: Stored Data Manipulation"},
    {"keywords": ["web shell", "webshell", "cmd.php", "shell.php"],
     "tactic": "Persistence", "technique": "T1505.003", "name": "Server Software Component: Web Shell"},
    {"keywords": ["cryptominer", "crypto mining", "monero", "xmrig", "minerd"],
     "tactic": "Impact", "technique": "T1496", "name": "Resource Hijacking"},
    {"keywords": ["dns tunnel", "dns exfil", "iodine", "dnscat"],
     "tactic": "Command and Control", "technique": "T1071.004", "name": "Application Layer Protocol: DNS"},
    {"keywords": ["rootkit", "kernel module", "lkm", "hidden process"],
     "tactic": "Defense Evasion", "technique": "T1014", "name": "Rootkit"},
    {"keywords": ["log deleted", "log cleared", "audit log", "history cleared"],
     "tactic": "Defense Evasion", "technique": "T1070", "name": "Indicator Removal"},
    {"keywords": ["firewall disabled", "iptables flush", "ufw disable"],
     "tactic": "Defense Evasion", "technique": "T1562.004", "name": "Impair Defenses: Disable or Modify System Firewall"},
    {"keywords": ["vulnerability", "cve-", "exploit available", "unpatched"],
     "tactic": "Initial Access", "technique": "T1190", "name": "Exploit Public-Facing Application"},
    {"keywords": ["scheduled task", "crontab", "at job", "task scheduler"],
     "tactic": "Persistence", "technique": "T1053", "name": "Scheduled Task/Job"},
    {"keywords": ["powershell", "ps1", "invoke-expression", "iex"],
     "tactic": "Execution", "technique": "T1059.001", "name": "Command and Scripting Interpreter: PowerShell"},
    {"keywords": ["docker escape", "container escape", "privileged container"],
     "tactic": "Privilege Escalation", "technique": "T1611", "name": "Escape to Host"},
    {"keywords": ["tor ", "onion", "proxy chain", "anonymizer"],
     "tactic": "Command and Control", "technique": "T1090.003", "name": "Proxy: Multi-hop Proxy"},
    {"keywords": ["ssh key", "authorized_keys", "known_hosts"],
     "tactic": "Lateral Movement", "technique": "T1021.004", "name": "Remote Services: SSH"},
    {"keywords": ["mimikatz", "lsass dump", "credential dump", "hashdump"],
     "tactic": "Credential Access", "technique": "T1003", "name": "OS Credential Dumping"},
]


def map_alert_to_attack(alert) -> list[dict[str, str]]:
    """
    Map a Wazuh alert to MITRE ATT&CK techniques.
    1. Static rule group lookup (fast, high precision)
    2. Keyword matching on rule description (fallback)
    Returns a list of {tactic, technique, name} dicts (deduplicated by technique ID).
    """
    techniques: list[dict[str, str]] = []
    seen: set[str] = set()

    for group in alert.rule_groups:
        group_lower = group.lower().replace(" ", "_").replace("-", "_")
        for attack in RULE_GROUP_TO_ATTACK.get(group_lower, []):
            if attack["technique"] not in seen:
                techniques.append(attack)
                seen.add(attack["technique"])

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
    """Map alert to ATT&CK. Falls back to LLM classification for unmapped alerts."""
    techniques = map_alert_to_attack(alert)

    if not techniques and llm_service and alert.rule_level >= 5:
        try:
            techniques = await _llm_classify_attack(alert, llm_service)
        except Exception as e:
            log.warning("LLM ATT&CK classification failed: %s", str(e)[:200])

    return techniques


async def _llm_classify_attack(alert, llm_service) -> list[dict[str, str]]:
    """Use LLM to classify an alert into MITRE ATT&CK techniques."""
    import json
    import re

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
    text = text.strip()
    if text.startswith("```"):
        lines = [ln for ln in text.split("\n") if not ln.strip().startswith("```")]
        text = "\n".join(lines).strip()

    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        items = json.loads(match.group())
        return [
            {"tactic": str(t.get("tactic", "")), "technique": str(t.get("technique", "")), "name": str(t.get("name", ""))}
            for t in items[:3]
            if t.get("technique")
        ]

    return []
