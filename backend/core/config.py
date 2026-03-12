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

    # ---- Groq (Llama 3.3 70B) ----
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

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

    # ---- SMTP (password reset emails) ----
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = True

    # ---- Rate limiting ----
    scan_rate_limit: int = 10  # max scans per user per hour

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
        if not self.groq_api_key:
            warnings.warn(
                "GROQ_API_KEY not set — AI analysis will be disabled.",
                stacklevel=2,
            )
        return self

    class Config:
        env_file = "../.env"        # relative to backend/
        env_file_encoding = "utf-8"
        extra = "ignore"            # ignore unknown env vars


# Singleton — import this everywhere
settings = Settings()
