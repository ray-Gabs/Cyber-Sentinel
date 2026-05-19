# ============================================================
# backend/core/config.py — Centralized Settings
# ============================================================
# Uses pydantic-settings to load from .env automatically.
# Import anywhere:  from core.config import settings
# ============================================================

import warnings
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings

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
    mongo_username: str = ""
    mongo_password: str = ""

    # ---- Redis ----
    redis_url: str = "redis://localhost:6379/0"
    redis_password: str = ""
    # Celery result backend — DB 1 (separate from broker DB 0 to allow independent flush)
    celery_result_url: str = "redis://localhost:6379/1"
    # App-level Redis: locks, rate limiting, triage sorted set — DB 2
    # Note: WS pub/sub uses redis_url (DB 0), not this DB
    app_redis_url: str = "redis://localhost:6379/2"

    # ---- JWT ----
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60  # 1 hour — use refresh tokens for longer sessions

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
    wazuh_host_public: str = ""
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

    # ---- Demo User Seed ----
    demo_user_email: str = ""
    demo_user_password: str = ""
    demo_juiceshop_url: str = "http://localhost:3000"
    demo_dvwa_url: str = "http://localhost:8080"
    # Pre-set Wazuh token for the demo user — avoids reading startup logs to find it.
    # Leave empty to auto-generate on first boot.
    demo_wazuh_token: str = ""

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
    rate_limit_forgot_password: str = "5/hour"   # per IP — prevent email flooding  # noqa: S105
    rate_limit_register: str = "10/hour"         # per IP
    rate_limit_scan: str = "10/hour"             # per IP — prevent scan abuse

    # Per-user scan quota (MongoDB-based, checked against authenticated user ID).
    # Each completed scan triggers up to 2 LLM API calls (summary + narrative).
    # Keep this low in lab/shared environments to control AI billing.
    scan_rate_limit: int = 5                     # max scans per user per hour

    # Rate limit for report export endpoints (PDF / HTML).
    # These are CPU-bound (no AI calls) but limit server resource abuse.
    rate_limit_report_export: str = "20/hour"    # per user

    # Max scans a single user may have actively running/pending at the same time.
    # Prevents one user from flooding the Celery queue and starving others.
    # Increase if the deployment has a high-concurrency Celery worker pool.
    max_concurrent_scans_per_user: int = 3

    # System-wide concurrent scan cap — must not exceed Celery pentest worker concurrency.
    # With --concurrency=2 on the pentest worker, 2 scans can actually run in parallel.
    # Set to match the celery worker --concurrency value.
    max_concurrent_scans: int = 2

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
        if not self.jwt_secret or self.jwt_secret == "CHANGE_ME":  # noqa: S105
            raise ValueError(
                "JWT_SECRET must be set in your .env file. "
                "Generate one with:  python -c \"import secrets; print(secrets.token_urlsafe(64))\"\n"
                "Then add:  JWT_SECRET=<generated-value>  to your .env"
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
