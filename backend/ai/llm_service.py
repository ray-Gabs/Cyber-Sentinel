# ============================================================
# backend/ai/llm_service.py — Shared LLM Service (Groq / Llama)
# ============================================================
# Replaces the old Gemini service with Groq's free-tier API
# running Llama 3.3 70B.  Same public interface so consumers
# (pentest tasks, SOC tasks) need only a one-line import change.
#
# Groq free tier: 30 req/min, 14,400 req/day — far more
# generous than Gemini's 15 req/min / 1,500 req/day.
# ============================================================

import asyncio
import json
import logging
import re as _re
from typing import Any
from pathlib import Path

from groq import AsyncGroq

from core.config import settings
from ai.cache import AiCache

log = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent / "prompts"

_MAX_FINDINGS_FOR_AI = 15
_MAX_DESC_LEN = 120
_LLM_TIMEOUT = 30
_SEV_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}


class LLMService:
    """Wrapper around the Groq API (Llama 3.3 70B)."""

    def __init__(self):
        if settings.groq_api_key:
            self.client = AsyncGroq(api_key=settings.groq_api_key)
            self.model = settings.groq_model
        else:
            self.client = None
            self.model = None
        self.cache = AiCache()

    def _load_prompt(self, name: str) -> str:
        path = PROMPTS_DIR / f"{name}.txt"
        if path.exists():
            return path.read_text(encoding="utf-8")
        return ""

    async def _generate(self, prompt: str, use_cache: bool = True) -> str:
        """Call Groq with caching, timeout, and one retry on 429."""
        if self.client is None:
            raise RuntimeError("Groq API key not configured")

        if use_cache:
            cached = await self.cache.get(prompt)
            if cached:
                return cached

        last_err = None
        for attempt in range(2):
            try:
                response = await asyncio.wait_for(
                    self.client.chat.completions.create(
                        model=self.model,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=1024,
                        temperature=0.2,
                    ),
                    timeout=_LLM_TIMEOUT,
                )
                text = response.choices[0].message.content
                if use_cache:
                    await self.cache.set(prompt, text)
                return text
            except asyncio.TimeoutError:
                last_err = TimeoutError(f"Groq did not respond within {_LLM_TIMEOUT}s")
                break
            except Exception as e:
                last_err = e
                if "429" in str(e) and attempt == 0:
                    log.warning("Groq 429 rate limit — retrying in 5s")
                    await asyncio.sleep(5)
                    continue
                break

        raise last_err  # type: ignore[misc]

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

        condensed = [
            {
                "t": f.tool,
                "s": f.severity,
                "n": f.name,
                "d": (f.description or "")[:_MAX_DESC_LEN],
                "u": f.matched_at or "",
            }
            for f in top
        ]

        prompt = template or (
            "You are a senior cybersecurity consultant. Analyse the following "
            "penetration test results and provide:\n"
            "1. executive_summary (2-3 sentences for non-technical stakeholders)\n"
            "2. remediation (bullet-point list of prioritised fixes)\n"
            "3. risk_score (float 0.0 – 10.0)\n\n"
            "Respond ONLY in valid JSON with keys: executive_summary, remediation, risk_score.\n\n"
        )
        prompt += (
            f"\nTarget: {scan.target}\nScan type: {scan.scan_type}\n"
            f"Total findings: {len(scan.findings)} (showing top {len(top)} by severity)\n"
            f"\nFindings:\n{json.dumps(condensed, separators=(',', ':'))}"
        )

        text = await self._generate(prompt)
        try:
            return json.loads(self._extract_json(text))
        except json.JSONDecodeError:
            return {"executive_summary": text[:500], "remediation": "", "risk_score": 5.0}

    async def generate_remediation(self, finding: dict) -> str:
        template = self._load_prompt("scan_remediation")
        compact = {k: (v[:200] if isinstance(v, str) else v) for k, v in finding.items()}
        prompt = (
            template
            or "You are a cybersecurity expert. Suggest a detailed remediation plan for this vulnerability:\n\n"
        ) + json.dumps(compact, separators=(",", ":"))
        return await self._generate(prompt)

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
