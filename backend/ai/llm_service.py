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
import re as _re
from datetime import datetime
from typing import Any
from pathlib import Path

from core.config import settings
from ai.cache import AiCache
from ai.providers import get_provider

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"

_MAX_FINDINGS_FOR_AI = 25
_MAX_DESC_LEN = 350
_SEV_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}

# Patterns used to detect timeout/error findings by name
_TIMEOUT_PATTERNS = ("timed out", "timeout")
_ERROR_PATTERNS = ("error", "failed")


class LLMService:
    """
    Provider-agnostic LLM service.
    Uses whichever provider is configured via settings.ai_provider.
    """

    def __init__(self):
        self.cache = AiCache()

    @property
    def _provider(self):
        """Lazily fetch the configured provider (singleton via get_provider)."""
        return get_provider()

    @property
    def is_available(self) -> bool:
        return self._provider is not None

    def _load_prompt(self, name: str) -> str:
        path = PROMPTS_DIR / f"{name}.txt"
        if path.exists():
            return path.read_text(encoding="utf-8")
        return ""

    async def _generate(self, prompt: str, use_cache: bool = True, max_tokens: int = 2048) -> str:
        """Generate text via the configured provider, with caching."""
        provider = self._provider
        if provider is None:
            raise RuntimeError(
                f"AI provider '{settings.ai_provider}' is not configured. "
                "Set the matching API key in .env."
            )

        if use_cache:
            cached = await self.cache.get(prompt)
            if cached:
                return cached

        text = await provider.generate(prompt, max_tokens=max_tokens, temperature=0.2)
        log.info("AI prompt chars: %d, response chars: %d", len(prompt), len(text))

        if use_cache:
            await self.cache.set(prompt, text)

        return text

    # ======================== CONTEXT HELPERS ========================

    @staticmethod
    def _extract_nmap_context(scan) -> str:
        """Extract open ports/services summary from nmap_raw."""
        nmap_raw = getattr(scan, "nmap_raw", None)
        if not nmap_raw or not isinstance(nmap_raw, dict):
            return "Nmap: No data available\n"

        hosts = nmap_raw.get("hosts", [])
        if not hosts or not isinstance(hosts, list):
            return "Nmap: No host data available\n"

        lines = ["Open ports/services (from Nmap):"]
        found_any = False
        for host in hosts[:3]:  # cap at 3 hosts
            if not isinstance(host, dict):
                continue
            host_addr = host.get("host", host.get("address", "unknown"))
            ports = host.get("ports", [])
            if not isinstance(ports, list):
                continue
            for port in ports[:20]:  # cap at 20 ports per host
                if not isinstance(port, dict):
                    continue
                state = port.get("state", "")
                if state != "open":
                    continue
                portnum = port.get("port", port.get("portid", "?"))
                proto = port.get("protocol", port.get("proto", "tcp"))
                service = port.get("service", port.get("name", "unknown"))
                version = port.get("version", port.get("product", ""))
                entry = f"  - {portnum}/{proto}: {service}"
                if version:
                    entry += f" ({version})"
                lines.append(entry)
                found_any = True

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
            "You are a senior cybersecurity consultant. Analyse the following "
            "penetration test results and provide:\n"
            "1. executive_summary (3-5 sentences for non-technical stakeholders)\n"
            "2. remediation (numbered prioritised fixes grouped by OWASP 2025 category)\n"
            "3. risk_score (float 0.0 – 10.0)\n"
            "4. attack_chain (1-2 multi-step attack chains from combined findings)\n\n"
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

        # Nmap and SSL context
        prompt += self._extract_nmap_context(scan)
        prompt += self._extract_ssl_context(scan)

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
                "risk_score": 5.0,
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

        # Build base header (reused by both single and batched calls)
        header = template + (
            f"\n\n=== SCAN DATA ===\n"
            f"Target: {scan.target}\n"
            f"Scan type: {scan.scan_type}\n"
            f"Scan duration: {duration}\n"
            f"Tools executed: {', '.join(scan.completed_tools or [])}\n"
            f"Tool coverage: {json.dumps(tool_cov)}\n"
            f"Total findings: {len(scan.findings)}\n"
            f"Severity breakdown: Critical={counts['critical']}, High={counts['high']}, "
            f"Medium={counts['medium']}, Low={counts['low']}, Info={counts['info']}\n"
            f"{tech_info}{crawler_info}"
            f"{nmap_ctx}{ssl_ctx}"
            f"OWASP 2025 category names: {json.dumps(owasp_names)}\n"
            f"\nOWASP 2025 Category Distribution:\n"
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
            # Batch split if more than 20 findings to avoid token limits.
            # Both batches receive the full scan context header so each can
            # produce complete, accurate sections independently.
            if len(top) > 20:
                mid = len(top) // 2
                batch1 = top[:mid]
                batch2 = top[mid:]

                prompt1 = (
                    header
                    + f"\nTop Findings — Batch 1 of 2 (highest severity):\n"
                    + json.dumps([_build_finding_entry(f) for f in batch1], indent=1, separators=(",", ":"))
                    + "\n\nWrite sections: ENGAGEMENT OVERVIEW, RISK ASSESSMENT, KEY FINDINGS, ATTACK CHAIN ANALYSIS, OWASP TOP 10:2025 COVERAGE, ATTACK SURFACE ANALYSIS, PER-FINDING REMEDIATION GUIDE."
                )
                prompt2 = (
                    header
                    + f"\nTop Findings — Batch 2 of 2 (remaining findings):\n"
                    + json.dumps([_build_finding_entry(f) for f in batch2], indent=1, separators=(",", ":"))
                    + "\n\nWrite sections: STRATEGIC RECOMMENDATIONS, TOOL COVERAGE MATRIX."
                )

                text1, text2 = await asyncio.wait_for(
                    asyncio.gather(
                        self._generate(prompt1, max_tokens=3000),
                        self._generate(prompt2, max_tokens=1500),
                    ),
                    timeout=_NARRATIVE_TIMEOUT,
                )
                return text1 + "\n\n" + text2
            else:
                prompt = header + f"\nTop Findings (by severity):\n{json.dumps([_build_finding_entry(f) for f in top], indent=1, separators=(',', ':'))}"
                return await asyncio.wait_for(
                    self._generate(prompt, max_tokens=4096),
                    timeout=_NARRATIVE_TIMEOUT,
                )

        except (asyncio.TimeoutError, TimeoutError):
            log.warning("Narrative report generation timed out for scan %s", scan.target)
            return _timeout_fallback()
        except Exception as e:
            log.warning("Narrative report generation failed: %s", str(e)[:200])
            return ""

    # ======================== SOC / WAZUH ========================

    async def analyse_alert(self, alert_dict: dict, context: dict) -> dict[str, Any]:
        from domains.soc.models import AiVerdict

        similar = (
            await AiVerdict.find(
                {"rule_id": alert_dict.get("rule_id"), "analyst_agreed": {"$exists": True}},
            )
            .sort("-created_at")
            .limit(3)
            .to_list()
        )

        few_shot = [
            {"verdict": s.verdict, "analyst_agreed": s.analyst_agreed, "reasoning": s.reasoning}
            for s in similar
        ]

        template = self._load_prompt("alert_analysis")
        prompt = template or (
            "You are an expert SOC L1 analyst. Analyse this Wazuh SIEM alert and determine:\n"
            "1. classification: TRUE_POSITIVE or FALSE_POSITIVE\n"
            "2. confidence: 0-100\n"
            "3. reasoning: 2-3 sentences\n"
            "4. action: ESCALATE | MONITOR | DISMISS\n\n"
            "Respond ONLY in valid JSON with those 4 keys.\n\n"
        )
        prompt += f"\nALERT:\n{json.dumps(alert_dict, separators=(',', ':'))}"
        prompt += f"\n\nCONTEXT:\n{json.dumps(context, separators=(',', ':'))}"
        if few_shot:
            prompt += f"\n\nHISTORICAL ANALYST FEEDBACK:\n{json.dumps(few_shot, separators=(',', ':'))}"

        text = await self._generate(prompt, use_cache=False)
        try:
            return json.loads(self._extract_json(text))
        except json.JSONDecodeError:
            return {
                "classification": "UNKNOWN",
                "confidence": 0.0,
                "reasoning": text[:300],
                "action": "MONITOR",
            }

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
