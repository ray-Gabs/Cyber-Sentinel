# ============================================================
# backend/ai/providers.py — Multi-Provider LLM Abstraction
# ============================================================
# Supported providers: groq | claude | openai | gemini
#
# Add a new provider:
#   1. Create a class inheriting BaseLLMProvider
#   2. Implement _call_api(prompt, max_tokens, temperature)
#   3. Register in get_provider()
# ============================================================

import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Optional

from core.config import settings

log = logging.getLogger(__name__)

_LLM_TIMEOUT = 60


class BaseLLMProvider(ABC):
    """Abstract base class for all LLM providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        max_tokens: int = 2048,
        temperature: float = 0.2,
    ) -> str:
        """Generate a completion for the given prompt."""
        ...

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable provider name."""
        ...


# ─────────────────────────────────────────────
# Groq Provider (Llama 3.3 70B — default)
# ─────────────────────────────────────────────

class GroqProvider(BaseLLMProvider):
    name = "Groq (Llama 3.3 70B)"

    def __init__(self) -> None:
        from groq import AsyncGroq
        self._client = AsyncGroq(api_key=settings.groq_api_key)
        self._model = settings.groq_model

    async def generate(self, prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
        for attempt in range(2):
            try:
                response = await asyncio.wait_for(
                    self._client.chat.completions.create(
                        model=self._model,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=max_tokens,
                        temperature=temperature,
                    ),
                    timeout=_LLM_TIMEOUT,
                )
                return response.choices[0].message.content
            except asyncio.TimeoutError:
                raise TimeoutError(f"Groq did not respond within {_LLM_TIMEOUT}s")
            except Exception as e:
                if "429" in str(e) and attempt == 0:
                    log.warning("Groq 429 rate limit — retrying in 5s")
                    await asyncio.sleep(5)
                    continue
                raise


# ─────────────────────────────────────────────
# Claude Provider (Anthropic)
# ─────────────────────────────────────────────

class ClaudeProvider(BaseLLMProvider):
    name = "Claude (Anthropic)"

    def __init__(self) -> None:
        try:
            import anthropic
        except ImportError:
            raise RuntimeError(
                "anthropic package not installed. Run: pip install anthropic"
            )
        self._client = anthropic.AsyncAnthropic(api_key=settings.claude_api_key)
        self._model = settings.claude_model

    async def generate(self, prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
        import anthropic
        for attempt in range(2):
            try:
                response = await asyncio.wait_for(
                    self._client.messages.create(
                        model=self._model,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        messages=[{"role": "user", "content": prompt}],
                    ),
                    timeout=_LLM_TIMEOUT,
                )
                return response.content[0].text
            except asyncio.TimeoutError:
                raise TimeoutError(f"Claude did not respond within {_LLM_TIMEOUT}s")
            except anthropic.RateLimitError:
                if attempt == 0:
                    log.warning("Claude rate limit — retrying in 10s")
                    await asyncio.sleep(10)
                    continue
                raise
            except Exception:
                raise


# ─────────────────────────────────────────────
# OpenAI Provider
# ─────────────────────────────────────────────

class OpenAIProvider(BaseLLMProvider):
    name = "OpenAI"

    def __init__(self) -> None:
        try:
            from openai import AsyncOpenAI
        except ImportError:
            raise RuntimeError(
                "openai package not installed. Run: pip install openai"
            )
        self._client = AsyncOpenAI(api_key=settings.openai_api_key)  # type: ignore[name-defined]
        self._model = settings.openai_model

    async def generate(self, prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
        from openai import RateLimitError  # type: ignore[import]
        for attempt in range(2):
            try:
                response = await asyncio.wait_for(
                    self._client.chat.completions.create(
                        model=self._model,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=max_tokens,
                        temperature=temperature,
                    ),
                    timeout=_LLM_TIMEOUT,
                )
                return response.choices[0].message.content
            except asyncio.TimeoutError:
                raise TimeoutError(f"OpenAI did not respond within {_LLM_TIMEOUT}s")
            except RateLimitError:
                if attempt == 0:
                    log.warning("OpenAI rate limit — retrying in 10s")
                    await asyncio.sleep(10)
                    continue
                raise
            except Exception:
                raise


# ─────────────────────────────────────────────
# Gemini Provider (Google)
# ─────────────────────────────────────────────

class GeminiProvider(BaseLLMProvider):
    name = "Gemini (Google)"

    def __init__(self) -> None:
        try:
            import google.generativeai as genai
        except ImportError:
            raise RuntimeError(
                "google-generativeai not installed. Run: pip install google-generativeai"
            )
        genai.configure(api_key=settings.gemini_api_key)
        self._model = genai.GenerativeModel(settings.gemini_model)

    async def generate(self, prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
        import google.generativeai as genai
        config = genai.types.GenerationConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )
        try:
            response = await asyncio.wait_for(
                self._model.generate_content_async(prompt, generation_config=config),
                timeout=_LLM_TIMEOUT,
            )
            try:
                return response.text
            except ValueError as e:
                # Gemini's safety filters may block the response, making .text inaccessible
                raise RuntimeError(f"Gemini response blocked or empty (safety filter): {e}") from e
        except asyncio.TimeoutError:
            raise TimeoutError(f"Gemini did not respond within {_LLM_TIMEOUT}s")


# ─────────────────────────────────────────────
# Factory
# ─────────────────────────────────────────────

_PROVIDER_REGISTRY: dict[str, type[BaseLLMProvider]] = {
    "groq": GroqProvider,
    "claude": ClaudeProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
}

# Fallback order when the configured provider has no API key
_FALLBACK_ORDER = ["claude", "groq", "gemini", "openai"]

_provider_instance: Optional[BaseLLMProvider] = None


def get_provider() -> Optional[BaseLLMProvider]:
    """
    Return a singleton provider instance.

    Tries AI_PROVIDER first. If that key is missing, auto-falls back to the
    first provider in _FALLBACK_ORDER that has an API key set in the environment.
    Returns None only when no provider has a key configured.
    """
    global _provider_instance
    if _provider_instance is not None:
        return _provider_instance

    key_map = {
        "groq": settings.groq_api_key,
        "claude": settings.claude_api_key,
        "openai": settings.openai_api_key,
        "gemini": settings.gemini_api_key,
    }

    configured = settings.ai_provider.lower()
    # Configured provider first, then remaining fallbacks in priority order
    candidates = [configured] + [p for p in _FALLBACK_ORDER if p != configured]

    for provider_name in candidates:
        if not key_map.get(provider_name, ""):
            continue
        provider_cls = _PROVIDER_REGISTRY.get(provider_name)
        if provider_cls is None:
            continue
        if provider_name != configured:
            log.warning(
                "AI_PROVIDER='%s' has no API key — auto-falling back to '%s'.",
                configured,
                provider_name,
            )
        try:
            _provider_instance = provider_cls()
            log.info("AI provider initialised: %s", _provider_instance.name)
            return _provider_instance
        except Exception as e:
            log.error("Failed to initialise provider '%s': %s — trying next.", provider_name, e)
            continue

    log.warning(
        "No AI provider has an API key configured — AI features disabled. "
        "Set CLAUDE_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in .env."
    )
    return None
