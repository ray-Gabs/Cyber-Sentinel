# ============================================================
# backend/domains/soc/project_models.py — SOC Project Document
# ============================================================

import re
from datetime import datetime, timezone
from typing import Optional

from beanie import Document
from pydantic import Field


def _slugify(name: str) -> str:
    """Convert a project name to a URL-safe slug."""
    s = name.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s.strip("-")[:80]


class SocProject(Document):
    """
    A monitored deployment — ties a target URL and optional Wazuh agent
    to a project so alerts are scoped per project.
    """
    owner_id: str
    name: str
    slug: str
    target_url: str
    description: Optional[str] = None
    wazuh_agent_registered: bool = False
    wazuh_agent_id: Optional[str] = None
    wazuh_agent_name: Optional[str] = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )

    class Settings:
        name = "soc_projects"
        indexes = ["owner_id"]
