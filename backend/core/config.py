# ============================================================
# backend/core/config.py — Centralized Settings
# ============================================================
# Uses pydantic-settings to load from .env automatically.
# Import anywhere:  from core.config import settings
# ============================================================

import secrets
import warnings

from pydantic_settings import BaseSettings
from pydantic import Field, model_validator


class Settings(BaseSettings):
    """All app configuration loaded from environment variables / .env file."""

    # ---- App ----
    app_name: str = "Cyber Sentinel"
    debug: bool = False

    # ---- MongoDB ----
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "cyber_sentinel"

    # ---- Redis ----
    redis_url: str = "redis://localhost:6379/0"

    # ---- JWT ----
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480  # 8 hours

    # ---- AI Provider ----
    # Set ai_provider to one of: groq | claude | openai | gemini
    ai_provider: str = "groq"

    # ---- Groq (Llama 3.3 70B — free tier) ----
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # ---- Claude (Anthropic) ----
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"

    # ---- OpenAI ----
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # ---- Gemini (Google) ----
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # ---- Wazuh ----
    wazuh_api_url: str = "https://localhost:55000"
    wazuh_api_user: str = "wazuh-wui"
    wazuh_api_password: str = ""
    wazuh_verify_ssl: bool = False

    # ---- ZAP ----
    zap_api_url: str = "http://localhost:8080"
    zap_api_key: str = ""

    # ---- NIST NVD (CVE lookup) ----
    nvd_api_key: str = ""           # Optional - increases rate limit

    # ---- Threat Intelligence ----
    virustotal_api_key: str = ""
    abuseipdb_api_key: str = ""

    # ---- Metasploit RPC (Advanced) ----
    msf_rpc_host: str = "127.0.0.1"
    msf_rpc_port: int = 55553
    msf_rpc_password: str = ""

    # ---- Frontend ----
    frontend_url: str = "http://localhost:5173"
    # Comma-separated list of additional allowed CORS origins.
    # Use this when deploying on a network so other machines can reach the UI.
    # Example: CORS_EXTRA_ORIGINS=http://192.168.1.50:5173,http://10.0.0.5:5173
    cors_extra_origins: str = ""

    # ---- SMTP (password reset emails) ----
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True

    # ---- Rate limiting (slowapi format: "N/period") ----
    # These protect against brute-force and abuse on public endpoints.
    # Period: second | minute | hour | day
    rate_limit_login: str = "10/minute"          # per IP
    rate_limit_forgot_password: str = "5/hour"   # per IP — prevent email flooding
    rate_limit_register: str = "10/hour"         # per IP
    rate_limit_scan: str = "20/hour"             # per IP — prevent scan abuse

    # Per-user scan quota (MongoDB-based, checked against authenticated user ID)
    scan_rate_limit: int = 20                    # max scans per user per hour

    @property
    def cors_origins(self) -> list[str]:
        """All allowed CORS origins: primary frontend + any extras from env.
        Wildcards are never permitted regardless of env var values."""
        origins = [self.frontend_url] if self.frontend_url != "*" else []
        if self.cors_extra_origins:
            extras = [
                o.strip()
                for o in self.cors_extra_origins.split(",")
                if o.strip() and o.strip() != "*"
            ]
            origins.extend(extras)
        return origins

    @model_validator(mode="after")
    def _validate_secrets(self):
        if not self.jwt_secret or self.jwt_secret == "CHANGE_ME":
            self.jwt_secret = secrets.token_urlsafe(64)
            warnings.warn(
                "JWT_SECRET not set — generated random key. "
                "Sessions will not persist across restarts. "
                "Set JWT_SECRET in your .env file.",
                stacklevel=2,
            )
        # Check that the configured provider has a key
        _provider_key_map = {
            "groq": self.groq_api_key,
            "claude": self.claude_api_key,
            "openai": self.openai_api_key,
            "gemini": self.gemini_api_key,
        }
        if not _provider_key_map.get(self.ai_provider, ""):
            warnings.warn(
                f"No API key found for AI provider '{self.ai_provider}' — "
                "AI analysis will be disabled. Set the matching *_API_KEY in .env.",
                stacklevel=2,
            )
        return self

    class Config:
        env_file = "../.env"        # relative to backend/
        env_file_encoding = "utf-8"
        extra = "ignore"            # ignore unknown env vars


# Singleton — import this everywhere
settings = Settings()
