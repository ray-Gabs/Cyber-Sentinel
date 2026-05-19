# ============================================================
# backend/domains/soc/threat_intel.py
# Threat Intelligence Enrichment — VirusTotal + AbuseIPDB
# ============================================================

import asyncio
import hashlib
import ipaddress
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any

import httpx

from core.config import settings

log = logging.getLogger(__name__)

VT_BASE        = "https://www.virustotal.com/api/v3"
ABUSEIPDB_BASE = "https://api.abuseipdb.com/api/v2"

IP_PATTERN     = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")

CACHE_TTL = 3600  # cache each indicator result for 1 hour

# Full RFC 1918 + special-use ranges — not indexed by any threat intel service
_PRIVATE_NETS = [
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),   # shared address space
    ipaddress.ip_network("198.51.100.0/24"),  # documentation
    ipaddress.ip_network("203.0.113.0/24"),   # documentation
]


def _is_public_ip(ip: str) -> bool:
    """Return True only for globally routable IPs that VT/AbuseIPDB actually index."""
    try:
        addr = ipaddress.ip_address(ip)
        if addr.version == 6:
            return False  # skip IPv6 for now — AbuseIPDB support is inconsistent
        return not any(addr in net for net in _PRIVATE_NETS)
    except ValueError:
        return False


def _cache_key(kind: str, value: str) -> str:
    h = hashlib.sha256(value.lower().encode()).hexdigest()[:20]
    return f"ti:{kind}:{h}"


class ThreatIntelService:

    # ── Redis cache helpers ────────────────────────────────────

    async def _cache_get(self, key: str) -> dict | None:
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
            try:
                raw = await r.get(key)
                return json.loads(raw) if raw else None
            finally:
                await r.aclose()
        except Exception:
            return None

    async def _cache_set(self, key: str, value: dict) -> None:
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.redis_url, socket_connect_timeout=2)
            try:
                await r.setex(key, CACHE_TTL, json.dumps(value))
            finally:
                await r.aclose()
        except Exception:
            pass

    # ── VirusTotal ────────────────────────────────────────────

    async def vt_check_ip(self, ip: str) -> dict[str, Any] | None:
        if not settings.virustotal_api_key:
            return None
        key = _cache_key("vt_ip", ip)
        if (hit := await self._cache_get(key)) is not None:
            return hit
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{VT_BASE}/ip_addresses/{ip}",
                    headers={"x-apikey": settings.virustotal_api_key},
                )
            if resp.status_code == 429:
                log.warning("VirusTotal rate limit hit for IP %s", ip)
                return {"error": "rate_limited", "ip": ip, "source": "virustotal"}
            if resp.status_code == 404:
                return {"error": "not_found", "ip": ip, "source": "virustotal"}
            if resp.status_code != 200:
                log.warning("VT IP lookup returned %d for %s", resp.status_code, ip)
                return None
            data  = resp.json().get("data", {}).get("attributes", {})
            stats = data.get("last_analysis_stats", {})
            result: dict[str, Any] = {
                "source":     "virustotal",
                "type":       "ip",
                "ip":         ip,
                "malicious":  stats.get("malicious",  0),
                "suspicious": stats.get("suspicious", 0),
                "harmless":   stats.get("harmless",   0),
                "undetected": stats.get("undetected", 0),
                "reputation": data.get("reputation",  0),
                "country":    data.get("country",     ""),
                "as_owner":   data.get("as_owner",    ""),
            }
            await self._cache_set(key, result)
            return result
        except Exception as exc:
            log.warning("VT IP lookup failed for %s: %s", ip, str(exc)[:200])
            return None

    async def vt_check_domain(self, domain: str) -> dict[str, Any] | None:
        if not settings.virustotal_api_key:
            return None
        key = _cache_key("vt_domain", domain)
        if (hit := await self._cache_get(key)) is not None:
            return hit
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{VT_BASE}/domains/{domain}",
                    headers={"x-apikey": settings.virustotal_api_key},
                )
            if resp.status_code == 429:
                log.warning("VirusTotal rate limit hit for domain %s", domain)
                return {"error": "rate_limited", "domain": domain, "source": "virustotal"}
            if resp.status_code == 404:
                return {"error": "not_found", "domain": domain, "source": "virustotal"}
            if resp.status_code != 200:
                return None
            data  = resp.json().get("data", {}).get("attributes", {})
            stats = data.get("last_analysis_stats", {})
            result = {
                "source":     "virustotal",
                "type":       "domain",
                "domain":     domain,
                "malicious":  stats.get("malicious",  0),
                "suspicious": stats.get("suspicious", 0),
                "harmless":   stats.get("harmless",   0),
                "reputation": data.get("reputation",  0),
                "registrar":  data.get("registrar",   ""),
            }
            await self._cache_set(key, result)
            return result
        except Exception as exc:
            log.warning("VT domain lookup failed for %s: %s", domain, str(exc)[:200])
            return None

    async def vt_check_hash(self, file_hash: str) -> dict[str, Any] | None:
        if not settings.virustotal_api_key:
            return None
        key = _cache_key("vt_hash", file_hash)
        if (hit := await self._cache_get(key)) is not None:
            return hit
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{VT_BASE}/files/{file_hash}",
                    headers={"x-apikey": settings.virustotal_api_key},
                )
            if resp.status_code == 429:
                return {"error": "rate_limited", "hash": file_hash, "source": "virustotal"}
            if resp.status_code == 404:
                return {"error": "not_found", "hash": file_hash, "source": "virustotal"}
            if resp.status_code != 200:
                return None
            data  = resp.json().get("data", {}).get("attributes", {})
            stats = data.get("last_analysis_stats", {})
            result = {
                "source":           "virustotal",
                "type":             "hash",
                "hash":             file_hash,
                "malicious":        stats.get("malicious",        0),
                "suspicious":       stats.get("suspicious",       0),
                "harmless":         stats.get("harmless",         0),
                "type_description": data.get("type_description",  ""),
                "meaningful_name":  data.get("meaningful_name",   ""),
                "size":             data.get("size"),
            }
            await self._cache_set(key, result)
            return result
        except Exception as exc:
            log.warning("VT hash lookup failed for %s: %s", file_hash, str(exc)[:200])
            return None

    # ── AbuseIPDB ─────────────────────────────────────────────

    async def abuseipdb_check(self, ip: str) -> dict[str, Any] | None:
        if not settings.abuseipdb_api_key:
            return None
        key = _cache_key("abuse", ip)
        if (hit := await self._cache_get(key)) is not None:
            return hit
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(
                    f"{ABUSEIPDB_BASE}/check",
                    params={"ipAddress": ip, "maxAgeInDays": 90},
                    headers={"Key": settings.abuseipdb_api_key, "Accept": "application/json"},
                )
            if resp.status_code == 429:
                log.warning("AbuseIPDB rate limit hit for %s", ip)
                return {"error": "rate_limited", "ip": ip, "source": "abuseipdb"}
            if resp.status_code != 200:
                log.warning("AbuseIPDB returned %d for %s", resp.status_code, ip)
                return None
            data = resp.json().get("data", {})
            result = {
                "source":           "abuseipdb",
                "type":             "ip",
                "ip":               ip,
                "abuse_confidence": data.get("abuseConfidenceScore", 0),
                "total_reports":    data.get("totalReports",          0),
                "country_code":     data.get("countryCode",           ""),
                "isp":              data.get("isp",                   ""),
                "domain":           data.get("domain",                ""),
                "is_tor":           data.get("isTor",                 False),
                "usage_type":       data.get("usageType",             ""),
            }
            await self._cache_set(key, result)
            return result
        except Exception as exc:
            log.warning("AbuseIPDB lookup failed for %s: %s", ip, str(exc)[:200])
            return None

    # ── Combined enrichment ────────────────────────────────────

    async def enrich_alert(self, alert) -> dict[str, Any]:
        """
        Enrich a Wazuh alert with VT + AbuseIPDB.

        Sources (in priority order):
          1. AI triage IOCs  — structured, highest quality
          2. alert.agent_ip  — the reporting agent
          3. Raw text regex  — fallback for unstructured logs

        Returns a dict that always includes 'errors' and 'enriched_at'
        so the frontend can distinguish no-keys / private-only / success.
        """
        errors: list[str] = []
        has_vt    = bool(settings.virustotal_api_key)
        has_abuse = bool(settings.abuseipdb_api_key)

        results: dict[str, Any] = {
            "virustotal":          [],
            "abuseipdb":           [],
            "errors":              errors,
            "enriched_at":         datetime.now(timezone.utc).isoformat(),
            "indicators_checked":  0,
            "private_ips_skipped": 0,
        }

        if not has_vt and not has_abuse:
            errors.append("no_api_keys")
            return results

        # ── Collect indicators ─────────────────────────────────
        ips:     set[str] = set()
        domains: set[str] = set()
        hashes:  set[str] = set()
        private_count = 0

        # 1. AI triage IOCs — already structured by the LLM
        iocs = getattr(alert, "iocs", None) or {}
        for ip in iocs.get("ips", []):
            if isinstance(ip, str):
                if _is_public_ip(ip):
                    ips.add(ip)
                else:
                    private_count += 1
        for domain in iocs.get("domains", []):
            if isinstance(domain, str) and "." in domain and len(domain) > 3:
                domains.add(domain.lower().strip("."))
        for h in iocs.get("hashes", []):
            if isinstance(h, str) and len(h) in (32, 40, 64):  # MD5 / SHA1 / SHA256
                hashes.add(h.lower())

        # 2. Agent IP
        agent_ip = getattr(alert, "agent_ip", "") or ""
        if agent_ip and agent_ip not in ("", "::1", "0.0.0.0"):  # nosec B104 — string comparison not socket bind
            if _is_public_ip(agent_ip):
                ips.add(agent_ip)
            else:
                private_count += 1

        # 3. Raw text regex fallback (caps at 10 candidates before filtering)
        raw_text = " ".join(filter(None, [
            getattr(alert, "full_log", "") or "",
            str(getattr(alert, "data", "") or ""),
        ]))
        for ip in list(IP_PATTERN.findall(raw_text))[:20]:
            if _is_public_ip(ip):
                ips.add(ip)
            elif ip not in ("127.0.0.1",):
                private_count += 1

        results["private_ips_skipped"] = private_count

        # Cap to avoid burning quota
        ips_list     = list(ips)[:5]
        domains_list = list(domains)[:3]
        hashes_list  = list(hashes)[:3]

        if not ips_list and not domains_list and not hashes_list:
            errors.append("only_private_ips" if private_count > 0 else "no_indicators")
            return results

        results["indicators_checked"] = len(ips_list) + len(domains_list) + len(hashes_list)

        # ── Build concurrent task list ─────────────────────────
        coros:  list = []
        labels: list[str] = []

        for ip in ips_list:
            if has_vt:
                coros.append(self.vt_check_ip(ip))
                labels.append("vt")
            if has_abuse:
                coros.append(self.abuseipdb_check(ip))
                labels.append("abuse")

        for domain in domains_list:
            if has_vt:
                coros.append(self.vt_check_domain(domain))
                labels.append("vt")

        for h in hashes_list:
            if has_vt:
                coros.append(self.vt_check_hash(h))
                labels.append("vt")

        raw_results = await asyncio.gather(*coros, return_exceptions=True)

        rate_limited = False
        for label, result in zip(labels, raw_results, strict=False):
            if isinstance(result, Exception) or result is None:
                continue
            err = result.get("error") if isinstance(result, dict) else None
            if err == "rate_limited":
                rate_limited = True
                continue
            if err == "not_found":
                continue
            if label == "vt":
                results["virustotal"].append(result)
            else:
                results["abuseipdb"].append(result)

        if rate_limited:
            errors.append("rate_limited")

        return results

    async def enrich_ip(self, ip: str) -> dict[str, Any]:
        """Standalone enrichment for a single public IP."""
        out: dict[str, Any] = {}
        tasks: dict[str, Any] = {}
        if settings.virustotal_api_key:
            tasks["virustotal"] = self.vt_check_ip(ip)
        if settings.abuseipdb_api_key:
            tasks["abuseipdb"] = self.abuseipdb_check(ip)
        if tasks:
            raw = await asyncio.gather(*tasks.values(), return_exceptions=True)
            for k, result in zip(tasks.keys(), raw, strict=False):
                if not isinstance(result, Exception) and result is not None:
                    out[k] = result
        return out


# Singleton
threat_intel_service = ThreatIntelService()
