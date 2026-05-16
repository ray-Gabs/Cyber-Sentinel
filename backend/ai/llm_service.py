# ============================================================
# backend/ai/llm_service.py — Shared LLM Service
# ============================================================
# Provider-agnostic LLM service. Configure the active provider
# via AI_PROVIDER in .env (groq | claude | openai | gemini).
#
# All business logic (scan summaries, alert triage, etc.) lives
# here. Provider-specific API calls go through ai/providers.py.
# ============================================================

import asyncio
import json
import logging
import random
import re as _re
from datetime import datetime
from typing import Any
from pathlib import Path

from core.config import settings
from ai.cache import AiCache
from ai.providers import get_provider, get_soc_provider

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"

_MAX_FINDINGS_FOR_AI = 25  # narrative report sends at most 25; prevents batch-split duplication
_MAX_DESC_LEN = 350
_SEV_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}

# Patterns used to detect timeout/error findings by name
_TIMEOUT_PATTERNS = ("timed out", "timeout")
_ERROR_PATTERNS = ("error", "failed", "unavailable")


class LLMService:
    """
    Provider-agnostic LLM service.
    Uses whichever provider is configured via settings.ai_provider.
    """

    def __init__(self):
        self.cache = AiCache()

    @property
    def _provider(self):
        """Lazily fetch the main provider (pentest reports, etc.)."""
        return get_provider()

    @property
    def _soc_provider(self):
        """Lazily fetch the SOC triage provider (may be same as _provider)."""
        return get_soc_provider()

    @property
    def is_available(self) -> bool:
        return self._provider is not None

    def _load_prompt(self, name: str) -> str:
        path = PROMPTS_DIR / f"{name}.txt"
        if path.exists():
            return path.read_text(encoding="utf-8")
        return ""

    async def _generate(
        self,
        prompt: str,
        use_cache: bool = True,
        max_tokens: int = 2048,
        _provider=None,
    ) -> str:
        """Generate text via the configured provider, with caching and 429 retry backoff.

        Pass _provider to route a call to a specific provider (e.g. the SOC provider)
        without changing the default for other callers.
        """
        provider = _provider if _provider is not None else self._provider
        if provider is None:
            raise RuntimeError(
                f"AI provider '{settings.ai_provider}' is not configured. "
                "Set the matching API key in .env."
            )

        if use_cache:
            cached = await self.cache.get(prompt)
            if cached:
                return cached

        # Truncate oversized prompts to avoid blowing the provider's context limit
        if len(prompt) > 25000:
            log.warning("AI prompt truncated from %d to 25000 chars", len(prompt))
            prompt = prompt[:25000] + "\n[... findings truncated due to size limit ...]"

        # Exponential backoff with full jitter on 429 rate-limit responses.
        # Full jitter: wait = random(0, base_delay) — spreads concurrent Celery
        # worker retries across the window instead of all retrying simultaneously.
        _base_delays = [5, 15, 30, 60]
        last_exc: Exception | None = None

        for attempt in range(len(_base_delays) + 1):
            if attempt > 0:
                base = _base_delays[attempt - 1]
                wait_secs = random.uniform(0, base)  # full jitter
                log.warning(
                    "AI provider 429 rate limit — waiting %.1fs (jittered from %ds base) retry %d/%d",
                    wait_secs, base, attempt, len(_base_delays),
                )
                await asyncio.sleep(wait_secs)
            try:
                text = await provider.generate(prompt, max_tokens=max_tokens, temperature=0.2)
                log.info("AI prompt chars: %d, response chars: %d", len(prompt), len(text))
                if use_cache:
                    await self.cache.set(prompt, text)
                return text
            except Exception as exc:
                err_str = str(exc)
                if "429" in err_str or "rate_limit" in err_str.lower() or "rate limit" in err_str.lower():
                    last_exc = exc
                    continue  # retry with jittered backoff
                raise  # non-429 error: propagate immediately

        # All retries exhausted
        log.error("AI provider 429 — all %d retries exhausted.", len(_base_delays))
        from core.exceptions import AIProviderError
        raise AIProviderError("AI rate limit retries exhausted — alert queued for manual review")

    # ======================== CONTEXT HELPERS ========================

    @staticmethod
    def _extract_nmap_context(scan) -> str:
        """Extract open ports/services summary from nmap_raw.

        nmap_raw is keyed by host IP: {ip_str: {"hostname": ..., "state": ...,
        "protocols": {"tcp": {port_int: port_info, ...}, ...}}}
        """
        nmap_raw = getattr(scan, "nmap_raw", None)
        if not nmap_raw or not isinstance(nmap_raw, dict):
            return "Nmap: No data available\n"

        lines = ["Open ports/services (from Nmap):"]
        found_any = False
        host_count = 0
        for host_addr, host_data in nmap_raw.items():
            if not isinstance(host_data, dict):
                continue
            host_count += 1
            if host_count > 3:  # cap at 3 hosts
                break
            protocols = host_data.get("protocols", {})
            if not isinstance(protocols, dict):
                continue
            for proto, port_map in protocols.items():
                if not isinstance(port_map, dict):
                    continue
                port_count = 0
                for portnum in sorted(port_map.keys()):
                    if port_count >= 20:  # cap at 20 ports per host
                        break
                    port_info = port_map[portnum]
                    if not isinstance(port_info, dict):
                        continue
                    state = port_info.get("state", "")
                    if state != "open":
                        continue
                    service = port_info.get("name", "unknown")
                    product = port_info.get("product", "")
                    version = port_info.get("version", "")
                    version_str = f"{product} {version}".strip()
                    entry = f"  - {portnum}/{proto}: {service}"
                    if version_str:
                        entry += f" ({version_str})"
                    lines.append(entry)
                    found_any = True
                    port_count += 1

        if not found_any:
            return "Nmap: No open ports detected\n"
        return "\n".join(lines) + "\n"

    @staticmethod
    def _extract_ssl_context(scan) -> str:
        """Extract SSL/TLS grade and key issues from sslyze_raw."""
        sslyze_raw = getattr(scan, "sslyze_raw", None)
        if not sslyze_raw:
            return "SSL/TLS: No data available\n"

        # sslyze_raw may be a dict or a list; normalise to dict
        if isinstance(sslyze_raw, list):
            if not sslyze_raw:
                return "SSL/TLS: No data available\n"
            sslyze_raw = sslyze_raw[0] if isinstance(sslyze_raw[0], dict) else {}

        if not isinstance(sslyze_raw, dict):
            return "SSL/TLS: No data available\n"

        parts = []

        grade = sslyze_raw.get("grade", sslyze_raw.get("ssl_grade", ""))
        if grade:
            parts.append(f"Grade {grade}")

        # Weak protocols
        weak_protocols = []
        protocols = sslyze_raw.get("protocols", sslyze_raw.get("supported_protocols", {}))
        if isinstance(protocols, dict):
            for proto, enabled in protocols.items():
                if enabled and proto.lower() in ("sslv2", "sslv3", "tlsv1", "tlsv1.1", "tls_1_0", "tls_1_1"):
                    weak_protocols.append(proto)
        elif isinstance(protocols, list):
            for proto in protocols:
                if isinstance(proto, str) and proto.lower() in ("sslv2", "sslv3", "tlsv1", "tlsv1.1"):
                    weak_protocols.append(proto)
        if weak_protocols:
            parts.append(f"Weak protocols enabled: {', '.join(weak_protocols)}")

        # Certificate info
        cert = sslyze_raw.get("certificate_info", sslyze_raw.get("cert", {}))
        if isinstance(cert, dict):
            expiry = cert.get("not_valid_after", cert.get("expiry", ""))
            if expiry:
                parts.append(f"Cert expires: {str(expiry)[:10]}")

        # Known vulnerabilities
        vulns = []
        for vuln in ("heartbleed", "robot", "openssl_ccs", "fallback_scsv"):
            val = sslyze_raw.get(vuln)
            if val is True or (isinstance(val, dict) and val.get("is_vulnerable")):
                vulns.append(vuln.upper())
        if vulns:
            parts.append(f"Vulnerable: {', '.join(vulns)}")

        if not parts:
            return "SSL/TLS: Scanned (no critical issues detected)\n"
        return "SSL/TLS: " + " | ".join(parts) + "\n"

    @staticmethod
    def _compute_scan_duration(scan) -> str:
        """Return human-readable scan duration from started_at/completed_at."""
        started = getattr(scan, "started_at", None)
        completed = getattr(scan, "completed_at", None)
        if not started or not completed:
            return "N/A"
        if not isinstance(started, datetime) or not isinstance(completed, datetime):
            return "N/A"
        delta_secs = int((completed - started).total_seconds())
        if delta_secs < 0:
            log.warning("Scan duration is negative — possible clock skew")
            return "N/A"
        if delta_secs >= 3600:
            h = delta_secs // 3600
            m = (delta_secs % 3600) // 60
            s = delta_secs % 60
            return f"{h}h {m}m {s}s"
        m = delta_secs // 60
        s = delta_secs % 60
        return f"{m}m {s}s"

    @staticmethod
    def _build_tool_coverage(scan) -> dict[str, str]:
        """
        Determine status of each enabled tool: success | timeout | error | skipped.

        Detection relies on info-severity findings whose names follow the patterns:
          - "{tool} timed out"  → timeout
          - "{tool} error"      → error
        These are generated by tasks.py's exception handlers.
        """
        enabled: list[str] = list(getattr(scan, "tools_enabled", []) or [])
        completed: set[str] = set(getattr(scan, "completed_tools", []) or [])
        findings = getattr(scan, "findings", []) or []

        timeout_tools: set[str] = set()
        error_tools: set[str] = set()

        for f in findings:
            sev = (f.severity if hasattr(f, "severity") else f.get("severity", "")) or ""
            if sev != "info":
                continue
            # Use the finding's tool field as the primary identifier — more reliable than
            # substring-matching the name (avoids false positives on "error_handling" tool key).
            f_tool = (f.tool if hasattr(f, "tool") else f.get("tool", "")) or ""
            name_lower = ((f.name if hasattr(f, "name") else f.get("name", "")) or "").lower()
            if f_tool in enabled:
                if any(p in name_lower for p in _TIMEOUT_PATTERNS):
                    timeout_tools.add(f_tool)
                elif any(p in name_lower for p in _ERROR_PATTERNS):
                    error_tools.add(f_tool)

        coverage: dict[str, str] = {}
        for tool_key in enabled:
            if tool_key in timeout_tools:
                coverage[tool_key] = "timeout"
            elif tool_key in error_tools:
                coverage[tool_key] = "error"
            elif tool_key in completed:
                coverage[tool_key] = "success"
            else:
                coverage[tool_key] = "skipped"
        return coverage

    @staticmethod
    def _derive_confidence(finding) -> str:
        """
        Derive confidence level from evidence fields.
          Confirmed — evidence + request_snippet both present
          Likely    — evidence present, no request_snippet
          Possible  — neither present
        """
        evidence = getattr(finding, "evidence", None)
        request = getattr(finding, "request_snippet", None)
        if evidence and request:
            return "Confirmed"
        if evidence:
            return "Likely"
        return "Possible"

    # ======================== PENTESTING ========================

    async def generate_scan_summary(self, scan) -> dict[str, Any]:
        if not scan.findings:
            return {
                "executive_summary": "No findings were detected during the scan.",
                "remediation": "",
                "risk_score": 0.0,
                "attack_chain": "",
            }

        template = self._load_prompt("scan_executive_summary")

        sorted_findings = sorted(
            scan.findings,
            key=lambda f: _SEV_RANK.get(f.severity, 5),
        )
        top = sorted_findings[:_MAX_FINDINGS_FOR_AI]

        condensed = []
        for f in top:
            entry: dict[str, Any] = {
                "tool": f.tool,
                "severity": f.severity,
                "name": f.name,
                "description": (f.description or "")[:_MAX_DESC_LEN],
                "url": f.matched_at or "",
                "confidence": self._derive_confidence(f),
            }
            if f.owasp_category:
                entry["owasp"] = f.owasp_category
            if f.cve_data:
                entry["cves"] = [
                    {
                        "id": c.cve_id,
                        "cvss": c.cvss_score,
                        "epss": c.epss_score,
                        "cvss_vector": c.cvss_vector or "",
                        "cwes": c.cwes or [],
                    }
                    for c in f.cve_data[:3]
                ]
            if getattr(f, "reference", None):
                refs = f.reference if isinstance(f.reference, list) else [f.reference]
                entry["refs"] = refs[:3]
            # Include enriched fields when present
            if getattr(f, "affected_parameter", None):
                entry["param"] = f.affected_parameter
            if getattr(f, "http_method", None):
                entry["method"] = f.http_method
            if getattr(f, "injection_point", None):
                entry["injection_point"] = f.injection_point
            if getattr(f, "evidence", None):
                entry["evidence"] = f.evidence[:200]
            if getattr(f, "plain_english", None):
                entry["plain_english"] = f.plain_english[:200]
            if getattr(f, "business_impact", None):
                entry["business_impact"] = f.business_impact[:200]
            if getattr(f, "remediation_priority", None):
                entry["fix_priority"] = f.remediation_priority
            condensed.append(entry)

        # Severity counts
        counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for f in scan.findings:
            if f.severity in counts:
                counts[f.severity] += 1

        # OWASP category distribution
        owasp_cats: dict[str, int] = {}
        for f in scan.findings:
            if f.owasp_category:
                owasp_cats[f.owasp_category] = owasp_cats.get(f.owasp_category, 0) + 1

        owasp_names = {
            "A01:2025": "Broken Access Control",
            "A02:2025": "Security Misconfiguration",
            "A03:2025": "Software Supply Chain Failures",
            "A04:2025": "Cryptographic Failures",
            "A05:2025": "Injection",
            "A06:2025": "Insecure Design",
            "A07:2025": "Authentication Failures",
            "A08:2025": "Software or Data Integrity Failures",
            "A09:2025": "Security Logging and Alerting Failures",
            "A10:2025": "Mishandling of Exceptional Conditions",
        }

        prompt = template or (
            "You are a senior penetration tester writing a professional security assessment report.\n"
            "Analyse all scan data provided and produce a comprehensive report with:\n"
            "1. executive_summary: 4-6 sentences for executive/non-technical audience covering what was found, "
            "what risks it poses, and the overall security posture\n"
            "2. remediation: Numbered prioritised fixes grouped by OWASP 2025 category, with specific "
            "technical steps for each issue. Include code examples where relevant.\n"
            "3. risk_score: float 0.0–10.0 based on severity/count of findings AND scan coverage. "
            "If scan coverage is low, bias score higher to account for unknown exposure.\n"
            "4. attack_chain: 1-3 realistic multi-step attack scenarios combining the findings found.\n\n"
            "IMPORTANT: Account for tools that failed — missing data means unknown risk, not no risk.\n"
            "Respond ONLY in valid JSON with keys: executive_summary, remediation, risk_score, attack_chain.\n\n"
        )
        prompt += (
            f"\n=== SCAN DATA ===\n"
            f"Target: {scan.target}\nScan type: {scan.scan_type}\n"
            f"Scan duration: {self._compute_scan_duration(scan)}\n"
            f"Total findings: {len(scan.findings)} (showing top {len(top)} by severity)\n"
            f"Severity breakdown: {json.dumps(counts)}\n"
        )
        if owasp_cats:
            prompt += f"OWASP 2025 categories affected: {json.dumps(owasp_cats)}\n"
            prompt += f"OWASP 2025 category names: {json.dumps(owasp_names)}\n"
        if scan.completed_tools:
            prompt += f"Tools executed: {', '.join(scan.completed_tools)}\n"

        # Tool coverage matrix
        tool_cov = self._build_tool_coverage(scan)
        if tool_cov:
            prompt += f"Tool coverage: {json.dumps(tool_cov)}\n"

        # Failed tools context — critical for accurate AI analysis
        failed_tools = getattr(scan, "failed_tools", []) or []
        scan_coverage = getattr(scan, "scan_coverage", None)
        if failed_tools:
            prompt += f"IMPORTANT — Tools that failed or timed out: {', '.join(failed_tools)}\n"
            prompt += "Note: Findings from these tools are missing. The actual risk may be higher than reported.\n"
        if scan_coverage is not None:
            pct = int(scan_coverage * 100)
            prompt += f"Scan coverage: {pct}% of planned tools completed successfully\n"
            if pct < 70:
                prompt += f"WARNING: Low scan coverage ({pct}%). Risk score may underestimate actual exposure.\n"

        # Nmap and SSL context
        prompt += self._extract_nmap_context(scan)
        prompt += self._extract_ssl_context(scan)

        # ZAP DAST findings summary
        zap_raw = getattr(scan, "zap_raw", None)
        if zap_raw and isinstance(zap_raw, list) and len(zap_raw) > 0:
            zap_summary = f"ZAP DAST found {len(zap_raw)} alerts (included in findings above)\n"
            prompt += zap_summary
        elif "zap" in failed_tools:
            prompt += "ZAP DAST: Did not run (timed out or daemon unavailable) — dynamic analysis missing\n"

        # WhatWeb technology fingerprint
        whatweb_raw = getattr(scan, "whatweb_raw", None)
        if whatweb_raw and isinstance(whatweb_raw, dict):
            techs = whatweb_raw.get("technologies", [])
            method = whatweb_raw.get("method", "")
            if techs:
                tech_names = [t.get("name", "") for t in techs if isinstance(t, dict) and t.get("name")]
                if tech_names:
                    prompt += f"WhatWeb fingerprint ({method}): {', '.join(tech_names[:20])}\n"

        if getattr(scan, "auth_config", None) and scan.auth_config.auth_type != "none":
            prompt += f"Authentication: {scan.auth_config.auth_type} (authenticated scan)\n"

        # Technology context from fingerprinting
        tech_data_found = False
        if getattr(scan, "fingerprint_raw", None) and isinstance(scan.fingerprint_raw, dict):
            techs = scan.fingerprint_raw.get("technologies", {})
            if techs:
                spa_frameworks = ["react", "vue.js", "angular", "next.js", "nuxt.js", "svelte", "vite"]
                cms_platforms = ["wordpress", "joomla", "drupal"]

                has_spa = any(fw in techs for fw in spa_frameworks)

                clean_techs = {}
                for k, t in techs.items():
                    if has_spa and k in cms_platforms:
                        continue
                    if has_spa and isinstance(t, dict) and t.get("source", "").startswith("Known path:"):
                        if k in cms_platforms or "exposed" in k:
                            continue
                    clean_techs[k] = t

                if clean_techs:
                    tech_names = [
                        f"{t.get('name', k)} {t.get('version', '')}".strip()
                        for k, t in clean_techs.items() if isinstance(t, dict)
                    ]
                    if tech_names:
                        prompt += f"Technology stack: {', '.join(tech_names)}\n"
                        tech_data_found = True
        if not tech_data_found:
            prompt += "Technology stack: No data available (fingerprinting tool may not have run or detected nothing)\n"

        prompt += f"\nFindings:\n{json.dumps(condensed, separators=(',', ':'))}"

        text = await self._generate(prompt, max_tokens=2048)
        try:
            result = json.loads(self._extract_json(text))
            # Ensure attack_chain key always present
            if "attack_chain" not in result:
                result["attack_chain"] = ""
            return result
        except json.JSONDecodeError:
            return {
                "executive_summary": text[:500],
                "remediation": "",
                "risk_score": 0.0,
                "attack_chain": "",
            }

    async def generate_remediation(self, finding: dict) -> str:
        template = self._load_prompt("scan_remediation")
        # Keep relevant fields, trim long strings
        compact: dict[str, Any] = {}
        for k, v in finding.items():
            if isinstance(v, str):
                compact[k] = v[:300]
            elif isinstance(v, list):
                compact[k] = v[:5]
            else:
                compact[k] = v
        prompt = (
            template
            or "You are a cybersecurity expert. Suggest a detailed remediation plan for this vulnerability:\n\n"
        ) + "\n\nVulnerability data:\n" + json.dumps(compact, separators=(",", ":"))
        return await self._generate(prompt, max_tokens=2048)

    async def generate_narrative_report(self, scan) -> str:
        """Generate a full professional narrative pentest report."""
        if not scan.findings:
            return ""

        template = self._load_prompt("scan_narrative_report")
        if not template:
            return ""

        sorted_findings = sorted(
            scan.findings,
            key=lambda f: _SEV_RANK.get(f.severity, 5),
        )
        top = sorted_findings[:_MAX_FINDINGS_FOR_AI]

        counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for f in scan.findings:
            if f.severity in counts:
                counts[f.severity] += 1

        owasp_cats: dict[str, list[str]] = {}
        for f in scan.findings:
            cat = f.owasp_category or "Uncategorised"
            if cat not in owasp_cats:
                owasp_cats[cat] = []
            owasp_cats[cat].append(f"{f.severity.upper()}: {f.name}")

        owasp_names = {
            "A01:2025": "Broken Access Control",
            "A02:2025": "Security Misconfiguration",
            "A03:2025": "Software Supply Chain Failures",
            "A04:2025": "Cryptographic Failures",
            "A05:2025": "Injection",
            "A06:2025": "Insecure Design",
            "A07:2025": "Authentication Failures",
            "A08:2025": "Software or Data Integrity Failures",
            "A09:2025": "Security Logging and Alerting Failures",
            "A10:2025": "Mishandling of Exceptional Conditions",
        }

        def _build_finding_entry(f) -> dict[str, Any]:
            entry: dict[str, Any] = {
                "tool": f.tool,
                "severity": f.severity,
                "name": f.name,
                "description": (f.description or "")[:_MAX_DESC_LEN],
                "url": f.matched_at or "",
                "owasp": f.owasp_category or "",
                "confidence": self._derive_confidence(f),
            }
            if f.cve_data:
                entry["cves"] = [
                    {
                        "id": c.cve_id,
                        "cvss": c.cvss_score,
                        "epss": c.epss_score,
                        "cvss_vector": c.cvss_vector or "",
                        "cwes": c.cwes or [],
                    }
                    for c in f.cve_data[:3]
                ]
            if getattr(f, "affected_parameter", None):
                entry["param"] = f.affected_parameter
            if getattr(f, "http_method", None):
                entry["method"] = f.http_method
            if getattr(f, "injection_point", None):
                entry["injection_point"] = f.injection_point
            if getattr(f, "evidence", None):
                entry["evidence"] = f.evidence[:250]
            if getattr(f, "request_snippet", None):
                entry["request"] = f.request_snippet[:200]
            if getattr(f, "technical_detail", None):
                entry["technical_detail"] = f.technical_detail[:250]
            if getattr(f, "plain_english", None):
                entry["plain_english"] = f.plain_english[:200]
            if getattr(f, "business_impact", None):
                entry["business_impact"] = f.business_impact[:200]
            if getattr(f, "remediation_priority", None):
                entry["fix_priority"] = f.remediation_priority
            return entry

        # Technology stack (same filtering logic as generate_scan_summary)
        tech_info = ""
        if scan.fingerprint_raw and isinstance(scan.fingerprint_raw, dict):
            techs = scan.fingerprint_raw.get("technologies", {})
            if techs:
                spa_frameworks = ["react", "vue.js", "angular", "next.js", "nuxt.js", "svelte", "vite"]
                cms_platforms = ["wordpress", "joomla", "drupal"]

                has_spa = any(fw in techs for fw in spa_frameworks)

                clean_techs = {}
                for k, t in techs.items():
                    if has_spa and k in cms_platforms:
                        continue
                    if has_spa and isinstance(t, dict) and t.get("source", "").startswith("Known path:"):
                        if k in cms_platforms or "exposed" in k:
                            continue
                    clean_techs[k] = t

                if clean_techs:
                    tech_names = [
                        f"{t.get('name', k)} {t.get('version', '')}".strip()
                        for k, t in clean_techs.items() if isinstance(t, dict)
                    ]
                    tech_info = f"Detected technologies: {', '.join(tech_names)}\n" if tech_names else "Detected technologies: No data available\n"
                else:
                    tech_info = "Detected technologies: No data available\n"
            else:
                tech_info = "Detected technologies: No data available\n"
        else:
            tech_info = "Detected technologies: No data available\n"

        # Crawler stats
        crawler_info = ""
        if scan.crawler_raw and isinstance(scan.crawler_raw, dict):
            endpoint_count = scan.crawler_raw.get("total_urls")
            if endpoint_count is None:
                endpoints = scan.crawler_raw.get("endpoints", [])
                endpoint_count = len(endpoints) if isinstance(endpoints, list) else 0
            crawler_info = f"Crawler discovered {endpoint_count} endpoints/pages.\n"

        # Additional context
        nmap_ctx = self._extract_nmap_context(scan)
        ssl_ctx = self._extract_ssl_context(scan)
        tool_cov = self._build_tool_coverage(scan)
        duration = self._compute_scan_duration(scan)

        # Failed tools context for narrative
        failed_tools = getattr(scan, "failed_tools", []) or []
        scan_coverage = getattr(scan, "scan_coverage", None)
        failed_tools_ctx = ""
        if failed_tools:
            failed_tools_ctx = f"Failed/skipped tools: {', '.join(failed_tools)}\n"
            failed_tools_ctx += "These tools did not produce results — actual risk may be higher.\n"
        coverage_ctx = ""
        if scan_coverage is not None:
            pct = int(scan_coverage * 100)
            coverage_ctx = f"Scan coverage: {pct}%\n"

        # ZAP context for narrative
        zap_raw = getattr(scan, "zap_raw", None)
        zap_ctx = ""
        if zap_raw and isinstance(zap_raw, list):
            zap_ctx = f"ZAP DAST: {len(zap_raw)} alerts (included in findings)\n"
        elif "zap" in failed_tools:
            zap_ctx = "ZAP DAST: Did not complete — dynamic scan results unavailable\n"

        # WhatWeb context for narrative
        whatweb_raw = getattr(scan, "whatweb_raw", None)
        whatweb_ctx = ""
        if whatweb_raw and isinstance(whatweb_raw, dict):
            techs = whatweb_raw.get("technologies", [])
            if techs:
                tech_names = [t.get("name", "") for t in techs if isinstance(t, dict) and t.get("name")]
                if tech_names:
                    whatweb_ctx = f"WhatWeb ({whatweb_raw.get('method', '')}): {', '.join(tech_names[:15])}\n"

        # Report header — show exact counts so the AI doesn't infer phantom findings.
        # "Showing X of Y" prevents hallucination when total > top slice.
        header = template + (
            f"\n\n=== SCAN DATA ===\n"
            f"Target: {scan.target}\n"
            f"Scan type: {scan.scan_type}\n"
            f"Scan duration: {duration}\n"
            f"Tools executed: {', '.join(scan.completed_tools or [])}\n"
            f"Tool coverage: {json.dumps(tool_cov)}\n"
            f"Total findings: {len(scan.findings)} "
            f"(showing top {len(top)} by severity — base your report ONLY on the findings listed below)\n"
            f"Severity breakdown: Critical={counts['critical']}, High={counts['high']}, "
            f"Medium={counts['medium']}, Low={counts['low']}, Info={counts['info']}\n"
            f"{tech_info}{crawler_info}"
            f"{nmap_ctx}{ssl_ctx}"
            f"{zap_ctx}{whatweb_ctx}"
            f"{failed_tools_ctx}{coverage_ctx}"
            f"OWASP 2025 category names: {json.dumps(owasp_names)}\n"
            f"\nOWASP 2025 Category Distribution (for reference only — do NOT invent findings for categories not in the findings list below):\n"
        )
        for cat, items in owasp_cats.items():
            header += f"  {cat}: {len(items)} findings\n"

        _NARRATIVE_TIMEOUT = 120  # seconds; outer guard in addition to per-provider timeout

        def _timeout_fallback() -> str:
            tools_str = ", ".join(scan.completed_tools or ["unknown"])
            return (
                f"--- ENGAGEMENT OVERVIEW ---\n"
                f"Automated assessment of {scan.target} using {tools_str}. "
                f"{len(scan.findings)} findings identified.\n\n"
                f"--- RISK ASSESSMENT ---\n"
                f"Risk score: {getattr(scan, 'risk_score', 'N/A')}. "
                f"Breakdown: Critical={counts['critical']}, High={counts['high']}, "
                f"Medium={counts['medium']}, Low={counts['low']}, Info={counts['info']}.\n"
                f"AI narrative generation timed out — detailed analysis unavailable."
            )

        try:
            # Single-call path only — no batch splitting.
            # Batch splitting caused KEY FINDINGS and other sections to appear 2-3x because
            # each batch received the full prompt template and both tried to write all sections.
            # _MAX_FINDINGS_FOR_AI caps findings at 25 to stay within token budget.
            prompt = (
                header
                + f"\nFindings (top {len(top)} by severity — ONLY base your report on these):\n"
                + json.dumps([_build_finding_entry(f) for f in top], indent=1, separators=(",", ":"))
            )
            return await asyncio.wait_for(
                self._generate(prompt, max_tokens=6000),
                timeout=_NARRATIVE_TIMEOUT,
            )

        except (asyncio.TimeoutError, TimeoutError):
            log.warning("Narrative report generation timed out for scan %s", scan.target)
            return _timeout_fallback()
        except Exception as e:
            log.warning("Narrative report generation failed: %s", str(e)[:200])
            return ""

    # ======================== SOC / WAZUH ========================

    async def analyse_alert(
        self,
        alert_dict: dict,
        context: dict,
        use_v2_prompt: bool = True,
    ) -> dict[str, Any]:
        """
        Triage a Wazuh alert using the configured LLM.

        Returns a dict with:
          classification, confidence, severity_label, reasoning, action,
          response_recommendations, false_positive_indicators, iocs, triage_notes

        Args:
            alert_dict:    Serialised alert fields (rule_id, description, level, log, etc.)
            context:       Agent metadata, MITRE techniques, open ports, etc.
            use_v2_prompt: If True, use the enhanced v2 prompt (recommended).
        """
        from domains.soc.models import AiVerdict

        similar = (
            await AiVerdict.find(
                {"rule_id": alert_dict.get("rule_id"), "analyst_agreed": {"$exists": True}},
            )
            .sort("-created_at")
            .limit(5)
            .to_list()
        )

        few_shot = [
            {
                "verdict": s.verdict,
                "analyst_agreed": s.analyst_agreed,
                "reasoning": s.reasoning,
                "action": s.action,
            }
            for s in similar
        ]

        prompt_name = "alert_triage_v2" if use_v2_prompt else "alert_analysis"
        template = self._load_prompt(prompt_name)
        if not template:
            template = self._load_prompt("alert_analysis")

        prompt = template or (
            "You are an expert SOC L2 analyst. Analyse this Wazuh SIEM alert.\n"
            "Respond ONLY in valid JSON with keys: classification, confidence, "
            "severity_label, reasoning, action, response_recommendations, "
            "false_positive_indicators, iocs, triage_notes\n\n"
        )
        prompt += f"\n\nALERT:\n{json.dumps(alert_dict, separators=(',', ':'))}"
        prompt += f"\n\nAGENT CONTEXT:\n{json.dumps(context, separators=(',', ':'))}"
        if few_shot:
            prompt += (
                f"\n\nHISTORICAL ANALYST FEEDBACK ({len(few_shot)} similar alerts):\n"
                + json.dumps(few_shot, separators=(",", ":"))
            )

        text = await self._generate(prompt, use_cache=False, max_tokens=1024, _provider=self._soc_provider)
        try:
            result = json.loads(self._extract_json(text))
        except json.JSONDecodeError:
            result = {
                "classification": "UNKNOWN",
                "confidence": 0,
                "reasoning": text[:300],
                "action": "MONITOR",
            }

        # Ensure all v2 keys are present with safe defaults
        result.setdefault("severity_label", self._map_severity_label(
            alert_dict.get("rule_level", 0),
            result.get("classification", "UNKNOWN"),
        ))
        result.setdefault("response_recommendations", [])
        result.setdefault("false_positive_indicators", [])
        result.setdefault("iocs", {
            "ips": [], "domains": [], "hashes": [],
            "users": [], "processes": [], "files": [],
        })
        result.setdefault("triage_notes", "")

        # Normalise iocs — each field must be a list
        iocs = result["iocs"]
        for key in ("ips", "domains", "hashes", "users", "processes", "files"):
            if not isinstance(iocs.get(key), list):
                iocs[key] = []

        return result

    @staticmethod
    def _map_severity_label(rule_level: int, classification: str) -> str:
        """
        Derive a human severity label from Wazuh rule_level.
        Used as a fallback when the LLM does not return severity_label.
        """
        if classification == "FALSE_POSITIVE":
            return "INFO"
        if rule_level >= 12:
            return "CRITICAL"
        if rule_level >= 8:
            return "HIGH"
        if rule_level >= 4:
            return "MEDIUM"
        if rule_level >= 1:
            return "LOW"
        return "INFO"

    async def generate_alert_remediation(
        self,
        alert_dict: dict,
        verdict: dict,
    ) -> str:
        """
        Generate a structured incident response plan for a confirmed TRUE_POSITIVE alert.

        Args:
            alert_dict: The serialised alert (same shape used in analyse_alert)
            verdict:    The AI triage result (classification, severity_label, iocs, etc.)

        Returns a plain-text remediation guide with sections:
          THREAT SUMMARY / IMMEDIATE CONTAINMENT / INVESTIGATION CHECKLIST /
          ROOT CAUSE ANALYSIS / LONG-TERM REMEDIATION
        """
        template = self._load_prompt("alert_remediation")
        if not template:
            template = (
                "You are a senior SOC analyst writing a remediation guide.\n"
                "Produce sections: THREAT SUMMARY, IMMEDIATE CONTAINMENT, "
                "INVESTIGATION CHECKLIST, ROOT CAUSE ANALYSIS, LONG-TERM REMEDIATION.\n"
                "Be specific. Reference actual alert fields.\n\n"
            )

        combined = {
            "alert": alert_dict,
            "ai_verdict": {
                "classification": verdict.get("classification"),
                "severity_label": verdict.get("severity_label"),
                "confidence": verdict.get("confidence"),
                "action": verdict.get("action"),
                "reasoning": verdict.get("reasoning"),
                "iocs": verdict.get("iocs", {}),
                "response_recommendations": verdict.get("response_recommendations", []),
                "mitre_techniques": alert_dict.get("mitre_techniques", []),
            },
        }

        prompt = template + f"\n\nALERT + TRIAGE CONTEXT:\n{json.dumps(combined, separators=(',', ':'))}"
        return await self._generate(prompt, max_tokens=1500, _provider=self._soc_provider)

    async def batch_analyse_alerts(
        self,
        alerts: list[dict],
        context_map: dict[str, dict] | None = None,
    ) -> list[dict]:
        """
        Analyse a list of alerts sequentially with a 1-second gap between calls
        to respect provider rate limits.

        Args:
            alerts:      List of alert_dicts (same shape as analyse_alert)
            context_map: Optional {alert_id → context_dict} mapping

        Returns list of result dicts, each including the original alert_id.
        """
        results: list[dict] = []
        for i, alert in enumerate(alerts):
            if i > 0:
                await asyncio.sleep(1)
            alert_id = alert.get("alert_id", str(i))
            ctx = (context_map or {}).get(alert_id, {})
            try:
                verdict = await self.analyse_alert(alert, ctx)
            except Exception as exc:
                log.warning("batch_analyse_alerts failed for alert %s: %s", alert_id, exc)
                verdict = {
                    "classification": "UNKNOWN",
                    "confidence": 0,
                    "severity_label": "MEDIUM",
                    "reasoning": f"Analysis error: {str(exc)[:150]}",
                    "action": "MONITOR",
                    "response_recommendations": [],
                    "false_positive_indicators": [],
                    "iocs": {"ips": [], "domains": [], "hashes": [], "users": [], "processes": [], "files": []},
                    "triage_notes": "Batch triage failed — manual review required.",
                }
            verdict["alert_id"] = alert_id
            results.append(verdict)
        return results

    # ======================== HELPERS ========================

    @staticmethod
    def _extract_json(text: str) -> str:
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines).strip()
        match = _re.search(r"\{.*\}", text, _re.DOTALL)
        if match:
            return match.group()
        return text.strip()


# Singleton — backward-compatible alias
llm_service = LLMService()
gemini_service = llm_service  # old name for existing imports
