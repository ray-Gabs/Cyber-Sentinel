# ============================================================
# backend/core/config.py — Centralized Settings
# ============================================================
# Uses pydantic-settings to load from .env automatically.
# Import anywhere:  from core.config import settings
# ============================================================

from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """All app configuration loaded from environment variables / .env file."""

    # ---- App ----
    app_name: str = "Cyber Sentinel"
    debug: bool = True

    # ---- MongoDB ----
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db_name: str = "cyber_sentinel"

    # ---- Redis ----
    redis_url: str = "redis://localhost:6379/0"

    # ---- JWT ----
    jwt_secret: str = "CHANGE_ME"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480  # 8 hours

    # ---- Gemini ----
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

    # ---- Frontend ----
    frontend_url: str = "http://localhost:5173"

    class Config:
        env_file = "../.env"        # relative to backend/
        env_file_encoding = "utf-8"
        extra = "ignore"            # ignore unknown env vars


# Singleton — import this everywhere
settings = Settings()
