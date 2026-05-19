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
from datetime import datetime, timedelta, timezone
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
_PORT_RE = re.compile(r":(\d+)")
_WORD_RE = re.compile(r"\b[a-z]{5,}\b")
_STOPWORDS = frozenset({
    "the", "and", "for", "this", "that", "with", "from", "have", "been", "found", "detected"
})


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
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    alerts = await Alert.find({"timestamp": {"$gte": cutoff}}).sort("-timestamp").limit(1000).to_list()

    links: list[CorrelationLink] = []

    for finding in scan.findings:
        f_dict = finding.model_dump() if hasattr(finding, "model_dump") else finding
        f_keywords = _finding_keywords(f_dict)
        for alert in alerts:
            matched = _check_correlation(f_dict, alert, target_host, f_keywords)
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


async def get_correlation(scan_id: str) -> Correlation | None:
    """Get the correlation record for a scan."""
    return await Correlation.find_one({"scan_id": scan_id})


async def list_correlations(
    page: int = 1, size: int = 20, user_id: str | None = None
) -> list[Correlation]:
    """List correlations newest first. If user_id given, scope to that user's scans."""
    if user_id is not None:
        # Limit scan ID fetch to recent 30 days to prevent O(N) memory load
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        user_scans = await Scan.find({"user_id": user_id, "created_at": {"$gte": cutoff}}).limit(200).to_list()
        scan_ids = [str(s.id) for s in user_scans]
        return (
            await Correlation.find({"scan_id": {"$in": scan_ids}})
            .sort("-created_at")
            .skip((page - 1) * size)
            .limit(size)
            .to_list()
        )
    return (
        await Correlation.find()
        .sort("-created_at")
        .skip((page - 1) * size)
        .limit(size)
        .to_list()
    )


async def count_correlations(user_id: str | None = None) -> int:
    """Count correlations scoped to a user's scans."""
    if user_id is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        user_scans = await Scan.find({"user_id": user_id, "created_at": {"$gte": cutoff}}).limit(200).to_list()
        scan_ids = [str(s.id) for s in user_scans]
        return await Correlation.find({"scan_id": {"$in": scan_ids}}).count()
    return await Correlation.find().count()


async def delete_correlation(correlation_id: str, user_id: str) -> None:
    """Delete a single correlation, verifying the user owns the related scan."""
    from beanie import PydanticObjectId
    from fastapi import HTTPException
    try:
        corr = await Correlation.get(PydanticObjectId(correlation_id))
    except Exception:
        corr = None
    if not corr:
        raise HTTPException(status_code=404, detail="Correlation not found")
    scan = await Scan.find_one({"_id": PydanticObjectId(corr.scan_id)})
    if not scan or (scan.user_id != user_id):
        raise HTTPException(status_code=403, detail="Not authorized")
    await corr.delete()


async def delete_all_correlations(user_id: str) -> int:
    """Delete all correlations for a user's scans. Returns count deleted."""
    col = Scan.get_motor_collection()
    cursor = col.find({"user_id": user_id}, {"_id": 1})
    scan_ids = [str(doc["_id"]) async for doc in cursor]
    if not scan_ids:
        return 0
    result = await Correlation.get_motor_collection().delete_many({"scan_id": {"$in": scan_ids}})
    return result.deleted_count


def _extract_host(target: str) -> str:
    """Extract hostname/IP from a target URL."""
    try:
        parsed = urlparse(target)
        return parsed.hostname or target
    except Exception:
        return target


def _finding_keywords(finding: dict) -> frozenset[str]:
    """Extract significant keywords from a finding, computed once per finding."""
    name = finding.get("name", "").lower()
    desc = finding.get("description", "").lower()
    return frozenset(w for w in _WORD_RE.findall(f"{name} {desc}") if w not in _STOPWORDS)


def _check_correlation(finding: dict, alert: Alert, target_host: str, f_keywords: frozenset[str]) -> CorrelationLink | None:  # noqa: E501
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
    if _keyword_match(alert, f_keywords):
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
    """Check if the finding tool/type matches alert rule groups (exact token match)."""
    tool = finding.get("tool", "")
    expected_groups = ATTACK_PATTERN_MAP.get(tool, [])
    if not expected_groups:
        return False
    # Normalise alert groups to a set for exact matching.
    # Previously used substring matching (eg in ag) which caused false positives
    # e.g. "attack" matching inside "web_attack" for unrelated findings.
    alert_group_set = {g.lower() for g in alert.rule_groups}
    return bool(set(expected_groups) & alert_group_set)


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
    m = _PORT_RE.search(matched_at)
    if not m:
        return False
    port = m.group(1)
    alert_text = f"{alert.full_log} {alert.data or ''}"
    return port in alert_text


def _keyword_match(alert: Alert, f_keywords: frozenset[str]) -> bool:
    """
    Check for significant keyword overlap between finding keywords and alert text.

    Requires at least 3 keyword matches AND that matched keywords cover at least
    30% of the finding's keyword set. The old threshold of 2 was too permissive —
    any generic alert would match findings with large keyword sets.
    """
    if len(f_keywords) < 3:
        return False
    alert_text = f"{alert.rule_description} {alert.full_log}".lower()
    matches = sum(1 for kw in f_keywords if kw in alert_text)
    if matches < 3:
        return False
    return (matches / len(f_keywords)) >= 0.30


async def _generate_correlation_summary(llm_service, scan, links: list[CorrelationLink]) -> str:
    """Generate an AI summary of the correlation results."""
    import json
    link_data = [
        {
            "finding": lnk.finding_name,
            "f_sev": lnk.finding_severity,
            "alert": lnk.alert_rule_description,
            "a_lvl": lnk.alert_rule_level,
            "type": lnk.correlation_type,
            "conf": lnk.confidence,
        }
        for lnk in links[:15]
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
