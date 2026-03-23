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
from typing import Any
from pathlib import Path

from core.config import settings
from ai.cache import AiCache
from ai.providers import get_provider

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"

_MAX_FINDINGS_FOR_AI = 25
_MAX_DESC_LEN = 200
_SEV_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


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

        if use_cache:
            await self.cache.set(prompt, text)

        return text

    # ======================== PENTESTING ========================

    async def generate_scan_summary(self, scan) -> dict[str, Any]:
        if not scan.findings:
            return {
                "executive_summary": "No findings were detected during the scan.",
                "remediation": "",
                "risk_score": 0.0,
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
            }
            if f.owasp_category:
                entry["owasp"] = f.owasp_category
            if f.cve_data:
                entry["cves"] = [
                    {"id": c.cve_id, "cvss": c.cvss_score, "epss": c.epss_score}
                    for c in f.cve_data[:3]
                ]
            if getattr(f, "reference", None):
                refs = f.reference if isinstance(f.reference, list) else [f.reference]
                entry["refs"] = refs[:3]
            condensed.append(entry)

        # Build severity counts
        counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
        for f in scan.findings:
            if f.severity in counts:
                counts[f.severity] += 1

        # Build OWASP category distribution
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
            "3. risk_score (float 0.0 – 10.0)\n\n"
            "Respond ONLY in valid JSON with keys: executive_summary, remediation, risk_score.\n\n"
        )
        prompt += (
            f"\n=== SCAN DATA ===\n"
            f"Target: {scan.target}\nScan type: {scan.scan_type}\n"
            f"Total findings: {len(scan.findings)} (showing top {len(top)} by severity)\n"
            f"Severity breakdown: {json.dumps(counts)}\n"
        )
        if owasp_cats:
            prompt += f"OWASP 2025 categories affected: {json.dumps(owasp_cats)}\n"
            prompt += f"OWASP 2025 category names: {json.dumps(owasp_names)}\n"
        if scan.completed_tools:
            prompt += f"Tools executed: {', '.join(scan.completed_tools)}\n"
        if getattr(scan, "auth_config", None) and scan.auth_config.auth_type != "none":
            prompt += f"Authentication: {scan.auth_config.auth_type} (authenticated scan)\n"
        # Technology context from fingerprinting
        tech_data_found = False
        if getattr(scan, "fingerprint_raw", None) and isinstance(scan.fingerprint_raw, dict):
            techs = scan.fingerprint_raw.get("technologies", {})
            if techs:
                # Filter out obvious inconsistencies (SPA + CMS is impossible)
                spa_frameworks = ["react", "vue.js", "angular", "next.js", "nuxt.js", "svelte", "vite"]
                cms_platforms = ["wordpress", "joomla", "drupal"]
                
                has_spa = any(fw in techs for fw in spa_frameworks)
                has_cms = any(cms in techs for cms in cms_platforms)
                
                # Clean technology list
                clean_techs = {}
                for k, t in techs.items():
                    # Skip CMS if SPA is detected (impossible coexistence)
                    if has_spa and k in cms_platforms:
                        continue
                    # Skip if source is "Known path" and it's a CMS/sensitive file on a SPA
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
                        prompt += f"Technology stack: {', '.join(tech_names)}\\n"
                        tech_data_found = True
        if not tech_data_found:
            prompt += "Technology stack: No data available (fingerprinting tool may not have run or detected nothing)\\n"
        prompt += f"\nFindings:\n{json.dumps(condensed, separators=(',', ':'))}"

        text = await self._generate(prompt, max_tokens=2048)
        try:
            return json.loads(self._extract_json(text))
        except json.JSONDecodeError:
            return {"executive_summary": text[:500], "remediation": "", "risk_score": 5.0}

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

        # Build comprehensive context for narrative
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

        condensed = []
        for f in top:
            entry: dict[str, Any] = {
                "tool": f.tool,
                "severity": f.severity,
                "name": f.name,
                "description": (f.description or "")[:_MAX_DESC_LEN],
                "url": f.matched_at or "",
                "owasp": f.owasp_category or "",
            }
            if f.cve_data:
                entry["cves"] = [
                    {"id": c.cve_id, "cvss": c.cvss_score, "epss": c.epss_score}
                    for c in f.cve_data[:3]
                ]
            condensed.append(entry)

        # Technology stack
        tech_info = ""
        if scan.fingerprint_raw and isinstance(scan.fingerprint_raw, dict):
            techs = scan.fingerprint_raw.get("technologies", {})
            if techs:
                # Filter out inconsistencies (same logic as generate_scan_summary)
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
                        tech_info = f"Detected technologies: {', '.join(tech_names)}\\n"
                    else:
                        tech_info = "Detected technologies: No data available\\n"
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

        prompt = template + (
            f"\n\n=== SCAN DATA ===\n"
            f"Target: {scan.target}\n"
            f"Scan type: {scan.scan_type}\n"
            f"Tools executed: {', '.join(scan.completed_tools or [])}\n"
            f"Total findings: {len(scan.findings)}\n"
            f"Severity breakdown: Critical={counts['critical']}, High={counts['high']}, "
            f"Medium={counts['medium']}, Low={counts['low']}, Info={counts['info']}\n"
            f"{tech_info}{crawler_info}"
            f"OWASP 2025 category names: {json.dumps(owasp_names)}\n"
            f"\nOWASP 2025 Category Distribution:\n"
        )
        for cat, items in owasp_cats.items():
            prompt += f"  {cat}: {len(items)} findings\n"

        prompt += f"\nTop Findings (by severity):\n{json.dumps(condensed, indent=1, separators=(',', ':'))}"

        try:
            return await self._generate(prompt, max_tokens=4096)
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
