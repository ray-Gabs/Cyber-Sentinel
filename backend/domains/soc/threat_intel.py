# ============================================================
# backend/domains/soc/threat_intel.py
# Threat Intelligence Enrichment — VirusTotal + AbuseIPDB
# ============================================================

import asyncio
import logging
import re
from typing import Any, Optional

import httpx

from core.config import settings

log = logging.getLogger(__name__)

VT_BASE = "https://www.virustotal.com/api/v3"
ABUSEIPDB_BASE = "https://api.abuseipdb.com/api/v2"
IP_PATTERN = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")


class ThreatIntelService:
    """Enrich alerts and findings with external threat intelligence."""

    # ---- VirusTotal ----

    async def vt_check_ip(self, ip: str) -> Optional[dict[str, Any]]:
        """Look up an IP address on VirusTotal."""
        if not settings.virustotal_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{VT_BASE}/ip_addresses/{ip}",
                    headers={"x-apikey": settings.virustotal_api_key},
                )
                if resp.status_code != 200:
                    return None
                data = resp.json().get("data", {}).get("attributes", {})
                stats = data.get("last_analysis_stats", {})
                return {
                    "source": "virustotal",
                    "ip": ip,
                    "malicious": stats.get("malicious", 0),
                    "suspicious": stats.get("suspicious", 0),
                    "harmless": stats.get("harmless", 0),
                    "undetected": stats.get("undetected", 0),
                    "reputation": data.get("reputation", 0),
                    "country": data.get("country", ""),
                    "as_owner": data.get("as_owner", ""),
                }
        except Exception as e:
            log.warning("VT IP lookup failed for %s: %s", ip, str(e)[:200])
            return None

    async def vt_check_domain(self, domain: str) -> Optional[dict[str, Any]]:
        """Look up a domain on VirusTotal."""
        if not settings.virustotal_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{VT_BASE}/domains/{domain}",
                    headers={"x-apikey": settings.virustotal_api_key},
                )
                if resp.status_code != 200:
                    return None
                data = resp.json().get("data", {}).get("attributes", {})
                stats = data.get("last_analysis_stats", {})
                return {
                    "source": "virustotal",
                    "domain": domain,
                    "malicious": stats.get("malicious", 0),
                    "suspicious": stats.get("suspicious", 0),
                    "harmless": stats.get("harmless", 0),
                    "reputation": data.get("reputation", 0),
                    "registrar": data.get("registrar", ""),
                }
        except Exception as e:
            log.warning("VT domain lookup failed for %s: %s", domain, str(e)[:200])
            return None

    async def vt_check_hash(self, file_hash: str) -> Optional[dict[str, Any]]:
        """Look up a file hash on VirusTotal."""
        if not settings.virustotal_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{VT_BASE}/files/{file_hash}",
                    headers={"x-apikey": settings.virustotal_api_key},
                )
                if resp.status_code != 200:
                    return None
                data = resp.json().get("data", {}).get("attributes", {})
                stats = data.get("last_analysis_stats", {})
                return {
                    "source": "virustotal",
                    "hash": file_hash,
                    "malicious": stats.get("malicious", 0),
                    "suspicious": stats.get("suspicious", 0),
                    "type_description": data.get("type_description", ""),
                    "meaningful_name": data.get("meaningful_name", ""),
                }
        except Exception as e:
            log.warning("VT hash lookup failed for %s: %s", file_hash, str(e)[:200])
            return None

    # ---- AbuseIPDB ----

    async def abuseipdb_check(self, ip: str) -> Optional[dict[str, Any]]:
        """Look up an IP on AbuseIPDB for abuse reports."""
        if not settings.abuseipdb_api_key:
            return None
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{ABUSEIPDB_BASE}/check",
                    params={"ipAddress": ip, "maxAgeInDays": 90},
                    headers={
                        "Key": settings.abuseipdb_api_key,
                        "Accept": "application/json",
                    },
                )
                if resp.status_code != 200:
                    return None
                data = resp.json().get("data", {})
                return {
                    "source": "abuseipdb",
                    "ip": ip,
                    "abuse_confidence": data.get("abuseConfidenceScore", 0),
                    "total_reports": data.get("totalReports", 0),
                    "country_code": data.get("countryCode", ""),
                    "isp": data.get("isp", ""),
                    "domain": data.get("domain", ""),
                    "is_tor": data.get("isTor", False),
                    "usage_type": data.get("usageType", ""),
                }
        except Exception as e:
            log.warning("AbuseIPDB lookup failed for %s: %s", ip, str(e)[:200])
            return None

    # ---- Combined Enrichment ----

    async def enrich_alert(self, alert) -> dict[str, Any]:
        """
        Enrich a Wazuh alert with threat intel from all available sources.
        Extracts IPs from alert data and checks VT + AbuseIPDB.
        """
        results: dict[str, Any] = {"virustotal": [], "abuseipdb": []}

        # Extract IPs from alert data
        ips = set()
        if alert.agent_ip and alert.agent_ip not in ("127.0.0.1", "::1", ""):
            ips.add(alert.agent_ip)

        # Extract IPs from full_log and data
        for source in [alert.full_log, str(alert.data or "")]:
            found = IP_PATTERN.findall(source)
            ips.update(ip for ip in found if not ip.startswith("127.") and not ip.startswith("0."))

        # Cap at 5 IPs to avoid API abuse
        ips_to_check = list(ips)[:5]

        # Concurrent lookups
        tasks = []
        for ip in ips_to_check:
            if settings.virustotal_api_key:
                tasks.append(("vt", ip, self.vt_check_ip(ip)))
            if settings.abuseipdb_api_key:
                tasks.append(("abuseipdb", ip, self.abuseipdb_check(ip)))

        if tasks:
            coros = [t[2] for t in tasks]
            raw_results = await asyncio.gather(*coros, return_exceptions=True)
            for (source, ip, _), result in zip(tasks, raw_results):
                if isinstance(result, Exception) or result is None:
                    continue
                results[source].append(result)

        return results

    async def enrich_ip(self, ip: str) -> dict[str, Any]:
        """Full enrichment for a single IP address."""
        results: dict[str, Any] = {}

        tasks = {}
        if settings.virustotal_api_key:
            tasks["virustotal"] = self.vt_check_ip(ip)
        if settings.abuseipdb_api_key:
            tasks["abuseipdb"] = self.abuseipdb_check(ip)

        if tasks:
            raw = await asyncio.gather(*tasks.values(), return_exceptions=True)
            for key, result in zip(tasks.keys(), raw):
                if not isinstance(result, Exception) and result is not None:
                    results[key] = result

        return results


# Singleton
threat_intel_service = ThreatIntelService()
