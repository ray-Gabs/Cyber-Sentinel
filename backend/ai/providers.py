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
            return response.text
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

_provider_instance: Optional[BaseLLMProvider] = None


def get_provider() -> Optional[BaseLLMProvider]:
    """
    Return a singleton provider instance based on settings.ai_provider.
    Returns None if the provider is not configured (missing API key).
    """
    global _provider_instance
    if _provider_instance is not None:
        return _provider_instance

    provider_name = settings.ai_provider.lower()
    provider_cls = _PROVIDER_REGISTRY.get(provider_name)

    if provider_cls is None:
        log.error(
            "Unknown AI provider '%s'. Valid options: %s",
            provider_name,
            ", ".join(_PROVIDER_REGISTRY.keys()),
        )
        return None

    # Check that the API key exists for this provider
    key_map = {
        "groq": settings.groq_api_key,
        "claude": settings.claude_api_key,
        "openai": settings.openai_api_key,
        "gemini": settings.gemini_api_key,
    }
    if not key_map.get(provider_name, ""):
        log.warning("AI provider '%s' has no API key — AI features disabled.", provider_name)
        return None

    try:
        _provider_instance = provider_cls()
        log.info("AI provider initialised: %s", _provider_instance.name)
        return _provider_instance
    except Exception as e:
        log.error("Failed to initialise AI provider '%s': %s", provider_name, e)
        return None
