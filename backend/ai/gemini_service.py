# ============================================================
# backend/ai/gemini_service.py — Shared Gemini Flash AI Service
# ============================================================
# Single service class with multiple prompt-methods.
# Both pentesting and SOC domains call into this.
#
# Key design:
#   - Load prompt templates from ai/prompts/ files
#   - Cache responses by content hash (saves $$)
#   - Always request JSON output from Gemini for easy parsing
# ============================================================

import json
import os
from typing import Any, Optional
from pathlib import Path

import google.generativeai as genai

from core.config import settings
from ai.cache import AiCache

PROMPTS_DIR = Path(__file__).parent / "prompts"


class GeminiService:
    """Wrapper around the Google Gemini Flash API."""

    def __init__(self):
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel(settings.gemini_model)
        self.cache = AiCache()

    def _load_prompt(self, name: str) -> str:
        """Load a .txt prompt template from ai/prompts/."""
        path = PROMPTS_DIR / f"{name}.txt"
        if path.exists():
            return path.read_text(encoding="utf-8")
        return ""

    async def _generate(self, prompt: str, use_cache: bool = True) -> str:
        """
        Call Gemini Flash with caching.
        Returns the raw text response.
        """
        if use_cache:
            cached = await self.cache.get(prompt)
            if cached:
                return cached

        response = self.model.generate_content(prompt)
        text = response.text

        if use_cache:
            await self.cache.set(prompt, text)
        return text

    # ======================== PENTESTING ========================

    async def generate_scan_summary(self, scan) -> dict[str, Any]:
        """
        Generate an executive summary + remediation advice for a
        completed scan.

        Since Nuclei already provides severity + description, we only
        send Gemini a condensed summary — saving tokens.

        Returns:
            {
                "executive_summary": str,
                "remediation": str,
                "risk_score": float,
            }
        """
        template = self._load_prompt("scan_executive_summary")

        # Build condensed findings list (not full raw data)
        condensed = []
        for f in scan.findings:
            condensed.append({
                "tool": f.tool,
                "severity": f.severity,
                "name": f.name,
                "description": f.description[:200],  # Truncate
                "matched_at": f.matched_at,
            })

        prompt = template or (
            "You are a senior cybersecurity consultant. Analyse the following "
            "penetration test results and provide:\n"
            "1. executive_summary (2-3 sentences for non-technical stakeholders)\n"
            "2. remediation (bullet-point list of prioritised fixes)\n"
            "3. risk_score (float 0.0 – 10.0)\n\n"
            "Respond ONLY in valid JSON with keys: executive_summary, remediation, risk_score.\n\n"
        )
        prompt += f"\nTarget: {scan.target}\nScan type: {scan.scan_type}\n"
        prompt += f"\nFindings ({len(condensed)} total):\n{json.dumps(condensed, indent=2)}"

        text = await self._generate(prompt)
        try:
            return json.loads(self._extract_json(text))
        except json.JSONDecodeError:
            return {"executive_summary": text, "remediation": "", "risk_score": 5.0}

    async def generate_remediation(self, finding: dict) -> str:
        """Generate step-by-step remediation for a single finding."""
        template = self._load_prompt("scan_remediation")
        prompt = (template or "You are a cybersecurity expert. Suggest a detailed remediation plan for this vulnerability:\n\n") + json.dumps(finding, indent=2)
        return await self._generate(prompt)

    # ======================== SOC / WAZUH ========================

    async def analyse_alert(self, alert_dict: dict, context: dict) -> dict[str, Any]:
        """
        Classify a Wazuh alert as TRUE_POSITIVE / FALSE_POSITIVE.

        Uses few-shot examples from past analyst overrides to improve
        accuracy over time.

        Returns:
            {
                "classification": "TRUE_POSITIVE" | "FALSE_POSITIVE",
                "confidence": float 0-100,
                "reasoning": str,
                "action": "ESCALATE" | "MONITOR" | "DISMISS",
            }
        """
        # Get historical analyst decisions for the same rule_id (few-shot)
        from domains.soc.models import AiVerdict
        similar = await AiVerdict.find(
            {"rule_id": alert_dict.get("rule_id"), "analyst_agreed": {"$exists": True}},
        ).sort("-created_at").limit(5).to_list()

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
        prompt += f"\nALERT:\n{json.dumps(alert_dict, indent=2)}"
        prompt += f"\n\nCONTEXT:\n{json.dumps(context, indent=2)}"
        if few_shot:
            prompt += f"\n\nHISTORICAL ANALYST FEEDBACK (for similar alerts):\n{json.dumps(few_shot, indent=2)}"

        text = await self._generate(prompt, use_cache=False)  # Don't cache alert analyses
        try:
            return json.loads(self._extract_json(text))
        except json.JSONDecodeError:
            return {
                "classification": "UNKNOWN",
                "confidence": 0.0,
                "reasoning": text,
                "action": "MONITOR",
            }

    # ======================== HELPERS ========================

    @staticmethod
    def _extract_json(text: str) -> str:
        """
        Extract JSON from Gemini's response which may include markdown
        code fences.
        """
        text = text.strip()
        if text.startswith("```"):
            # Remove code fence
            lines = text.split("\n")
            # Remove first and last lines (```json and ```)
            lines = [l for l in lines if not l.strip().startswith("```")]
            text = "\n".join(lines)
        return text.strip()


# Singleton — import this everywhere
gemini_service = GeminiService()
