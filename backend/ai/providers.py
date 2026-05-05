# ============================================================
# backend/ai/providers.py — Multi-Provider LLM Abstraction
# ============================================================
# Supported providers: groq | claude | openai | gemini
#
# Key-pool rotation (Claude / Groq / OpenAI):
#   Set CLAUDE_API_KEYS=sk-key2,sk-key3 (comma-separated extras).
#   On 429, the provider cycles to the next key immediately.
#   When all keys are exhausted, raises so _generate's jitter retry takes over.
#
# Gemini note: genai.configure() is a global SDK call — per-key clients are
#   not supported without the newer google-genai package. Single key only.
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


def _build_key_pool(primary: str, extras: str) -> list[str]:
    """Return a deduplicated ordered list of API keys from primary + comma-separated extras."""
    keys: list[str] = []
    for k in ([primary] + extras.split(",")) if extras else [primary]:
        k = k.strip()
        if k and k not in keys:
            keys.append(k)
    return keys


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
        keys = _build_key_pool(settings.groq_api_key, settings.groq_api_keys)
        if not keys:
            raise RuntimeError("GroqProvider: no API keys configured")
        self._clients = [AsyncGroq(api_key=k) for k in keys]
        self._key_index = 0
        self._model = settings.groq_model
        if len(keys) > 1:
            log.info("Groq: %d keys in pool", len(keys))

    async def generate(self, prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
        n = len(self._clients)
        start = self._key_index
        for attempt in range(n):
            idx = (start + attempt) % n
            client = self._clients[idx]
            try:
                response = await asyncio.wait_for(
                    client.chat.completions.create(
                        model=self._model,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=max_tokens,
                        temperature=temperature,
                    ),
                    timeout=_LLM_TIMEOUT,
                )
                self._key_index = (idx + 1) % n
                return response.choices[0].message.content
            except asyncio.TimeoutError:
                raise TimeoutError(f"Groq did not respond within {_LLM_TIMEOUT}s")
            except Exception as e:
                if "429" in str(e):
                    log.warning("Groq key[%d/%d] rate limited, trying next", idx + 1, n)
                    continue
                raise
        raise RuntimeError(
            f"429 rate_limit: all {n} Groq API key(s) are currently rate limited"
        )


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
        keys = _build_key_pool(settings.claude_api_key, settings.claude_api_keys)
        if not keys:
            raise RuntimeError("ClaudeProvider: no API keys configured")
        self._clients = [anthropic.AsyncAnthropic(api_key=k) for k in keys]
        self._key_index = 0
        self._model = settings.claude_model
        if len(keys) > 1:
            log.info("Claude: %d keys in pool", len(keys))

    async def generate(self, prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
        import anthropic
        n = len(self._clients)
        start = self._key_index
        for attempt in range(n):
            idx = (start + attempt) % n
            client = self._clients[idx]
            try:
                response = await asyncio.wait_for(
                    client.messages.create(
                        model=self._model,
                        max_tokens=max_tokens,
                        temperature=temperature,
                        messages=[{"role": "user", "content": prompt}],
                    ),
                    timeout=_LLM_TIMEOUT,
                )
                self._key_index = (idx + 1) % n
                return response.content[0].text
            except asyncio.TimeoutError:
                raise TimeoutError(f"Claude did not respond within {_LLM_TIMEOUT}s")
            except anthropic.RateLimitError:
                log.warning("Claude key[%d/%d] rate limited, trying next", idx + 1, n)
                continue
            except Exception:
                raise
        raise RuntimeError(
            f"429 rate_limit: all {n} Claude API key(s) are currently rate limited"
        )


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
        keys = _build_key_pool(settings.openai_api_key, settings.openai_api_keys)
        if not keys:
            raise RuntimeError("OpenAIProvider: no API keys configured")
        self._clients = [AsyncOpenAI(api_key=k) for k in keys]  # type: ignore[name-defined]
        self._key_index = 0
        self._model = settings.openai_model
        if len(keys) > 1:
            log.info("OpenAI: %d keys in pool", len(keys))

    async def generate(self, prompt: str, max_tokens: int = 2048, temperature: float = 0.2) -> str:
        from openai import RateLimitError  # type: ignore[import]
        n = len(self._clients)
        start = self._key_index
        for attempt in range(n):
            idx = (start + attempt) % n
            client = self._clients[idx]
            try:
                response = await asyncio.wait_for(
                    client.chat.completions.create(
                        model=self._model,
                        messages=[{"role": "user", "content": prompt}],
                        max_tokens=max_tokens,
                        temperature=temperature,
                    ),
                    timeout=_LLM_TIMEOUT,
                )
                self._key_index = (idx + 1) % n
                return response.choices[0].message.content
            except asyncio.TimeoutError:
                raise TimeoutError(f"OpenAI did not respond within {_LLM_TIMEOUT}s")
            except RateLimitError:
                log.warning("OpenAI key[%d/%d] rate limited, trying next", idx + 1, n)
                continue
            except Exception:
                raise
        raise RuntimeError(
            f"429 rate_limit: all {n} OpenAI API key(s) are currently rate limited"
        )


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
_soc_provider_instance: Optional[BaseLLMProvider] = None


def _init_provider(name: str) -> Optional[BaseLLMProvider]:
    """Try to instantiate a provider by name. Returns None on failure."""
    provider_cls = _PROVIDER_REGISTRY.get(name)
    if not provider_cls:
        return None
    try:
        instance = provider_cls()
        log.info("AI provider initialised: %s", instance.name)
        return instance
    except Exception as e:
        log.error("Failed to initialise provider '%s': %s", name, e)
        return None


def get_provider() -> Optional[BaseLLMProvider]:
    """
    Return the singleton main provider instance.

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
    candidates = [configured] + [p for p in _FALLBACK_ORDER if p != configured]

    for provider_name in candidates:
        if not key_map.get(provider_name, ""):
            continue
        if provider_name != configured:
            log.warning(
                "AI_PROVIDER='%s' has no API key — auto-falling back to '%s'.",
                configured,
                provider_name,
            )
        instance = _init_provider(provider_name)
        if instance is not None:
            _provider_instance = instance
            return _provider_instance

    log.warning(
        "No AI provider has an API key configured — AI features disabled. "
        "Set CLAUDE_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, or OPENAI_API_KEY in .env."
    )
    return None


def get_soc_provider() -> Optional[BaseLLMProvider]:
    """
    Return the singleton SOC triage provider instance.

    When SOC_AI_PROVIDER is set and differs from AI_PROVIDER, returns a dedicated
    provider for SOC alert triage so it doesn't compete with pentest report generation.
    Falls back to the main provider when SOC_AI_PROVIDER is unset or misconfigured.

    Recommended pattern:
        AI_PROVIDER=claude    (pentest reports — best reasoning)
        SOC_AI_PROVIDER=groq  (SOC triage — free, fast, handles high alert volume)
    """
    global _soc_provider_instance

    soc_name = (settings.soc_ai_provider or "").lower().strip()
    # No dedicated SOC provider configured — reuse main provider (no new instance)
    if not soc_name or soc_name == settings.ai_provider.lower():
        return get_provider()

    if _soc_provider_instance is not None:
        return _soc_provider_instance

    key_map = {
        "groq": settings.groq_api_key,
        "claude": settings.claude_api_key,
        "openai": settings.openai_api_key,
        "gemini": settings.gemini_api_key,
    }
    if not key_map.get(soc_name, ""):
        log.warning(
            "SOC_AI_PROVIDER='%s' has no API key — SOC triage falling back to main provider.",
            soc_name,
        )
        return get_provider()

    instance = _init_provider(soc_name)
    if instance is not None:
        _soc_provider_instance = instance
        log.info("SOC AI provider (dedicated): %s", instance.name)
        return _soc_provider_instance

    log.error("Failed to init SOC provider '%s' — falling back to main provider.", soc_name)
    return get_provider()
