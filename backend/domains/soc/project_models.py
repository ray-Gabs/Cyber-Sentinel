# ============================================================
# backend/domains/soc/project_models.py — SOC Project + SIEM Config Documents
# ============================================================

import re
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from beanie import Document
from pydantic import BaseModel, Field


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


class CustomRule(BaseModel):
    """A user-defined Wazuh XML detection rule scoped to a project."""
    id: str = Field(default_factory=lambda: str(uuid4()))
    name: str
    description: str
    xml_content: str
    enabled: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProjectSIEMConfig(Document):
    """
    Per-project SIEM configuration — stores user-defined Wazuh XML rules.
    One document per (owner_id, project_id) pair.
    """
    owner_id: str
    project_id: str
    custom_rules: list[CustomRule] = []
    rules_last_pushed: Optional[datetime] = None
    rules_push_status: Optional[str] = None  # "success" | "failed" | "pending"

    class Settings:
        name = "project_siem_configs"
        indexes = ["owner_id", "project_id"]
