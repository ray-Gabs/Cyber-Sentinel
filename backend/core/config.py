# ============================================================
# backend/core/config.py — Centralized Settings
# ============================================================
# Uses pydantic-settings to load from .env automatically.
# Import anywhere:  from core.config import settings
# ============================================================

import os
import secrets
import warnings
from pathlib import Path

from pydantic_settings import BaseSettings
from pydantic import Field, model_validator

# Resolve .env location relative to this file's actual path — works both
# when running locally (project root/.env) and inside Docker (no .env file;
# docker-compose passes vars as real env vars via its own env_file directive).
_here = Path(__file__).resolve().parent          # backend/core/
_project_root = _here.parent.parent              # Cyber-Sentinel/
_env_candidates = [
    _project_root / ".env",                      # local dev: project root
    _here.parent / ".env",                       # fallback: backend/.env
]
_env_file = next((str(p) for p in _env_candidates if p.exists()), None)


class Settings(BaseSettings):
    """All app configuration loaded from environment variables / .env file."""

    # ---- App ----
    app_name: str = "Cyber Sentinel"
    debug: bool = False
    log_level: str = "INFO"   # DEBUG | INFO | WARNING | ERROR

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
    # Set AI_PROVIDER to one of: claude | groq | openai | gemini
    # claude (Anthropic) is the recommended provider.
    ai_provider: str = "claude"

    # ---- Claude (Anthropic) ----
    claude_api_key: str = ""
    claude_model: str = "claude-sonnet-4-6"
    # Additional Claude keys for key-pool rotation (comma-separated, no spaces).
    # e.g. CLAUDE_API_KEYS=sk-ant-key2,sk-ant-key3
    # When all keys are rate-limited, the normal jitter-backoff retry kicks in.
    claude_api_keys: str = ""

    # ---- OpenAI ----
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    openai_api_keys: str = ""

    # ---- Groq (Llama 3.3 70B — free tier) ----
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"
    groq_api_keys: str = ""

    # ---- Gemini (Google) ----
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"
    # Note: Gemini's SDK uses a global configure() — multi-key pool not supported.

    # ---- SOC AI Provider (optional dedicated provider for alert triage) ----
    # When set, SOC alert triage uses this provider; pentest reports use ai_provider.
    # Recommended: SOC_AI_PROVIDER=groq (free Llama 70B — fast for quick triage)
    # This prevents triage tasks from burning your Claude quota during heavy scan periods.
    # Leave empty to share the same provider for both SOC and pentesting.
    soc_ai_provider: str = ""

    # ---- Wazuh ----
    wazuh_api_url: str = "https://localhost:55000"
    wazuh_api_user: str = "wazuh-wui"
    wazuh_api_password: str = ""
    wazuh_verify_ssl: bool = False
    # Shared secret for the incoming Wazuh webhook. Leave empty to skip verification
    # (acceptable on isolated lab networks). Set to a random token in production.
    wazuh_webhook_token: str = ""
    # Public-facing IP for Wazuh agent docker-compose files (what students put in WAZUH_MANAGER)
    # May differ from wazuh_api_url if behind NAT (e.g. wazuh_api_url uses https:// + port)
    wazuh_host_public: str = "10.4.89.178"
    # Agent registration password — find with: cat /var/ossec/etc/authd.pass on Wazuh VM
    wazuh_reg_password: str = ""

    # ---- ZAP ----
    zap_api_url: str = "http://localhost:8080"
    zap_api_key: str = ""

    # ---- NIST NVD (CVE lookup) ----
    nvd_api_key: str = ""           # Optional - increases rate limit

    # ---- Threat Intelligence ----
    virustotal_api_key: str = ""
    abuseipdb_api_key: str = ""

    # ---- S3 Report Storage ----
    # When S3_BUCKET is set, reports (PDF/HTML) are uploaded to S3 and
    # served via pre-signed URLs. When empty, reports are served from memory.
    s3_bucket: str = ""
    s3_region: str = "ap-southeast-1"
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    # Prefix for all report objects in the bucket — keeps them namespaced
    s3_reports_prefix: str = "reports/"
    # Pre-signed URL expiry in seconds (default: 1 hour)
    s3_url_expires: int = 3600

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

    # ---- First-boot Admin Seed ----
    # If the users collection is empty on startup, Cyber Sentinel creates one admin
    # account using these credentials. After that, these vars are ignored.
    # Set them in .env before the FIRST `docker compose up` on a fresh database.
    # Change the password immediately after logging in for the first time.
    first_admin_username: str = "admin"
    first_admin_email: str = ""
    first_admin_password: str = ""

    # ---- Lab / Dev Mode ----
    # Set to true only in controlled lab environments where scanning private IPs
    # (e.g. DVWA, Juice Shop on local network) is intentional.
    # NEVER set this to true on a production or internet-facing deployment.
    allow_private_targets: bool = False

    # ---- Rate limiting (slowapi format: "N/period") ----
    # These protect against brute-force and abuse on public endpoints.
    # Period: second | minute | hour | day
    rate_limit_login: str = "10/minute"          # per IP
    rate_limit_forgot_password: str = "5/hour"   # per IP — prevent email flooding
    rate_limit_register: str = "10/hour"         # per IP
    rate_limit_scan: str = "20/hour"             # per IP — prevent scan abuse

    # Per-user scan quota (MongoDB-based, checked against authenticated user ID)
    scan_rate_limit: int = 20                    # max scans per user per hour

    # Max scans a single user may have actively running/pending at the same time.
    # Prevents one user from flooding the Celery queue and starving others.
    # Increase if the deployment has a high-concurrency Celery worker pool.
    max_concurrent_scans_per_user: int = 3

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
            # Uvicorn spawns multiple worker processes — each re-imports this module
            # and would generate a different random secret, making cross-worker token
            # validation fail with 401. Use atomic file creation so all workers on the
            # same container share a single runtime-generated secret.
            _secret_file = Path("/tmp/.cs_jwt_secret")
            try:
                # O_CREAT | O_EXCL is atomic — raises FileExistsError if already present
                fd = os.open(str(_secret_file), os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
                generated = secrets.token_urlsafe(64)
                os.write(fd, generated.encode())
                os.close(fd)
                self.jwt_secret = generated
            except FileExistsError:
                self.jwt_secret = _secret_file.read_text().strip()
            warnings.warn(
                "JWT_SECRET not set — using a runtime-generated key shared across workers. "
                "Sessions will NOT persist across container restarts. "
                "Set JWT_SECRET in your .env file for persistent sessions.",
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
        soc = (self.soc_ai_provider or "").lower().strip()
        if soc and soc != self.ai_provider.lower() and not _provider_key_map.get(soc, ""):
            warnings.warn(
                f"SOC_AI_PROVIDER='{soc}' has no API key — SOC triage will fall back to "
                f"the main provider '{self.ai_provider}'. Set {soc.upper()}_API_KEY in .env.",
                stacklevel=2,
            )
        return self

    class Config:
        env_file = _env_file        # resolved at import time; None in Docker (uses real env vars)
        env_file_encoding = "utf-8"
        extra = "ignore"            # ignore unknown env vars


# Singleton — import this everywhere
settings = Settings()
