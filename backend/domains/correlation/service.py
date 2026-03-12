# ============================================================
# backend/domains/correlation/service.py — Correlation Engine
# ============================================================
# Links pentest scan findings → Wazuh alerts using:
#   1. IP/host matching (scan target ↔ alert agent IP or data)
#   2. CVE matching (finding CVE refs ↔ Wazuh vulnerability alerts)
#   3. Attack pattern matching (finding type ↔ alert rule groups)
#   4. Port matching (nmap findings ↔ network alerts)
#   5. Keyword matching (finding descriptions ↔ alert logs)
# ============================================================

import logging
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

from domains.correlation.models import Correlation, CorrelationLink
from domains.pentesting.models import Scan
from domains.soc.models import Alert

log = logging.getLogger(__name__)

# Map finding tools/names to Wazuh rule groups
ATTACK_PATTERN_MAP = {
    "sqli": ["sql_injection", "web_attack", "attack"],
    "xss": ["xss", "web_attack", "attack"],
    "idor": ["web_attack", "access_control"],
    "redirect": ["web_attack"],
    "auth": ["authentication_failed", "brute_force", "authentication"],
    "ssrf": ["web_attack"],
}

CVE_PATTERN = re.compile(r"CVE-\d{4}-\d{4,}", re.IGNORECASE)


async def run_correlation(scan_id: str) -> Correlation:
    """
    Run the correlation engine for a completed scan.
    Finds matching Wazuh alerts and creates link records.
    """
    scan = await Scan.get(scan_id)
    if not scan:
        raise ValueError(f"Scan {scan_id} not found")

    # Extract target host/IP for matching
    target_host = _extract_host(scan.target)

    # Fetch relevant alerts (last 30 days, up to 1000)
    alerts = await Alert.find().sort("-timestamp").limit(1000).to_list()

    links: list[CorrelationLink] = []

    for finding in scan.findings:
        f_dict = finding.model_dump() if hasattr(finding, "model_dump") else finding
        for alert in alerts:
            matched = _check_correlation(f_dict, alert, target_host)
            if matched:
                links.append(matched)

    # Deduplicate links (same finding + same alert)
    seen = set()
    unique_links = []
    for link in links:
        key = (link.finding_name, link.alert_wazuh_id, link.correlation_type)
        if key not in seen:
            seen.add(key)
            unique_links.append(link)

    # Check for existing correlation
    existing = await Correlation.find_one({"scan_id": scan_id})
    if existing:
        existing.links = unique_links
        existing.total_links = len(unique_links)
        existing.updated_at = datetime.now(timezone.utc)
        await existing.save()
        return existing

    correlation = Correlation(
        scan_id=scan_id,
        scan_target=scan.target,
        total_links=len(unique_links),
        links=unique_links,
    )
    await correlation.insert()

    # Generate AI summary if there are links
    if unique_links:
        try:
            from ai.llm_service import llm_service
            ai_summary = await _generate_correlation_summary(llm_service, scan, unique_links)
            correlation.ai_summary = ai_summary
            await correlation.save()
        except Exception as e:
            log.warning("Correlation AI summary failed: %s", str(e)[:200])

    return correlation


async def get_correlation(scan_id: str) -> Optional[Correlation]:
    """Get the correlation record for a scan."""
    return await Correlation.find_one({"scan_id": scan_id})


async def list_correlations(page: int = 1, size: int = 20) -> list[Correlation]:
    """List all correlations, newest first."""
    return (
        await Correlation.find()
        .sort("-created_at")
        .skip((page - 1) * size)
        .limit(size)
        .to_list()
    )


def _extract_host(target: str) -> str:
    """Extract hostname/IP from a target URL."""
    try:
        parsed = urlparse(target)
        return parsed.hostname or target
    except Exception:
        return target


def _check_correlation(finding: dict, alert: Alert, target_host: str) -> Optional[CorrelationLink]:
    """Check if a finding correlates with an alert. Returns a link or None."""
    # 1. IP/host match — alert from same host as scan target
    if _ip_match(alert, target_host):
        # 2. Attack pattern match
        pattern_match = _attack_pattern_match(finding, alert)
        if pattern_match:
            return CorrelationLink(
                finding_tool=finding.get("tool", ""),
                finding_name=finding.get("name", ""),
                finding_severity=finding.get("severity", "info"),
                finding_matched_at=finding.get("matched_at", ""),
                alert_wazuh_id=alert.wazuh_id,
                alert_rule_id=alert.rule_id,
                alert_rule_description=alert.rule_description,
                alert_rule_level=alert.rule_level,
                correlation_type="attack_pattern",
                confidence=0.8,
            )

        # 3. CVE match
        if _cve_match(finding, alert):
            return CorrelationLink(
                finding_tool=finding.get("tool", ""),
                finding_name=finding.get("name", ""),
                finding_severity=finding.get("severity", "info"),
                finding_matched_at=finding.get("matched_at", ""),
                alert_wazuh_id=alert.wazuh_id,
                alert_rule_id=alert.rule_id,
                alert_rule_description=alert.rule_description,
                alert_rule_level=alert.rule_level,
                correlation_type="cve_match",
                confidence=0.9,
            )

        # 4. Port match (nmap findings ↔ network alerts)
        if _port_match(finding, alert):
            return CorrelationLink(
                finding_tool=finding.get("tool", ""),
                finding_name=finding.get("name", ""),
                finding_severity=finding.get("severity", "info"),
                finding_matched_at=finding.get("matched_at", ""),
                alert_wazuh_id=alert.wazuh_id,
                alert_rule_id=alert.rule_id,
                alert_rule_description=alert.rule_description,
                alert_rule_level=alert.rule_level,
                correlation_type="port_match",
                confidence=0.6,
            )

    # 5. Keyword/description match (across all alerts)
    if _keyword_match(finding, alert):
        return CorrelationLink(
            finding_tool=finding.get("tool", ""),
            finding_name=finding.get("name", ""),
            finding_severity=finding.get("severity", "info"),
            finding_matched_at=finding.get("matched_at", ""),
            alert_wazuh_id=alert.wazuh_id,
            alert_rule_id=alert.rule_id,
            alert_rule_description=alert.rule_description,
            alert_rule_level=alert.rule_level,
            correlation_type="keyword",
            confidence=0.5,
        )

    return None


def _ip_match(alert: Alert, target_host: str) -> bool:
    """Check if the alert's agent IP matches the scan target."""
    if not target_host:
        return False
    target_lower = target_host.lower()
    if alert.agent_ip and alert.agent_ip == target_lower:
        return True
    if alert.agent_name and target_lower in alert.agent_name.lower():
        return True
    # Check in alert data for src/dst IP
    if alert.data:
        data_str = str(alert.data).lower()
        if target_lower in data_str:
            return True
    return False


def _attack_pattern_match(finding: dict, alert: Alert) -> bool:
    """Check if the finding tool/type matches alert rule groups."""
    tool = finding.get("tool", "")
    expected_groups = ATTACK_PATTERN_MAP.get(tool, [])
    if not expected_groups:
        return False
    alert_groups = [g.lower() for g in alert.rule_groups]
    return any(eg in ag for eg in expected_groups for ag in alert_groups)


def _cve_match(finding: dict, alert: Alert) -> bool:
    """Check if any CVE referenced in finding also appears in alert."""
    finding_cves = set()
    for ref in finding.get("reference", []):
        finding_cves.update(CVE_PATTERN.findall(ref))
    finding_cves.update(CVE_PATTERN.findall(finding.get("name", "")))
    finding_cves.update(CVE_PATTERN.findall(finding.get("description", "")))

    if not finding_cves:
        return False

    alert_text = f"{alert.rule_description} {alert.full_log}"
    if alert.data:
        alert_text += " " + str(alert.data)

    alert_cves = set(CVE_PATTERN.findall(alert_text))
    return bool(finding_cves & alert_cves)


def _port_match(finding: dict, alert: Alert) -> bool:
    """Check if a port from nmap findings appears in alert data."""
    if finding.get("tool") != "nmap":
        return False
    matched_at = finding.get("matched_at", "")
    # Extract port from "host:port" format
    port_match = re.search(r":(\d+)", matched_at)
    if not port_match:
        return False
    port = port_match.group(1)
    alert_text = f"{alert.full_log} {alert.data or ''}"
    return port in alert_text


def _keyword_match(finding: dict, alert: Alert) -> bool:
    """Check for significant keyword overlap between finding and alert."""
    finding_keywords = set()
    name = finding.get("name", "").lower()
    desc = finding.get("description", "").lower()

    # Extract significant words (>4 chars, not common)
    stopwords = {"the", "and", "for", "this", "that", "with", "from", "have", "been", "found", "detected"}
    for word in re.findall(r"\b[a-z]{5,}\b", f"{name} {desc}"):
        if word not in stopwords:
            finding_keywords.add(word)

    if len(finding_keywords) < 2:
        return False

    alert_text = f"{alert.rule_description} {alert.full_log}".lower()
    matches = sum(1 for kw in finding_keywords if kw in alert_text)
    return matches >= 2


async def _generate_correlation_summary(llm_service, scan, links: list[CorrelationLink]) -> str:
    """Generate an AI summary of the correlation results."""
    import json
    link_data = [
        {
            "finding": l.finding_name,
            "f_sev": l.finding_severity,
            "alert": l.alert_rule_description,
            "a_lvl": l.alert_rule_level,
            "type": l.correlation_type,
            "conf": l.confidence,
        }
        for l in links[:15]
    ]

    prompt = (
        "You are a senior cybersecurity analyst. Analyse the correlation between "
        "penetration test findings and SIEM alerts for the same target. "
        "Provide a 3-4 sentence summary explaining: which findings were confirmed "
        "by real-world alert activity, the overall risk implication, and priority actions.\n\n"
        f"Target: {scan.target}\n"
        f"Total correlations: {len(links)}\n"
        f"Links:\n{json.dumps(link_data, separators=(',', ':'))}"
    )

    return await llm_service._generate(prompt)
