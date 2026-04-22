# ============================================================
# backend/domains/soc/projects_router.py — SOC Projects + SIEM Config API
# ============================================================
# Mounted at prefix /api/soc in main.py
# ============================================================

import ipaddress
import logging
import socket
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

log = logging.getLogger(__name__)

import httpx
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel

from core.config import settings
from core.dependencies import get_current_user
from domains.auth.models import User
from domains.soc.models import Alert
from domains.soc.project_models import CustomRule, ProjectSIEMConfig, SocProject, _slugify
from domains.soc.wazuh_client import wazuh_client

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    target_url: str
    description: Optional[str] = None


class CustomRuleBody(BaseModel):
    name: str
    description: str
    xml_content: str
    enabled: bool = True


class RulesReplaceBody(BaseModel):
    rules: list[CustomRuleBody]


class FetchXmlBody(BaseModel):
    url: str


# ── Internal helpers ──────────────────────────────────────────────────────────

def _project_to_response(p: SocProject) -> dict:
    return {
        "id": str(p.id),
        "name": p.name,
        "slug": p.slug,
        "target_url": p.target_url,
        "description": p.description,
        "wazuh_agent_registered": p.wazuh_agent_registered,
        "wazuh_agent_id": p.wazuh_agent_id,
        "wazuh_agent_name": p.wazuh_agent_name,
        "created_at": p.created_at,
    }


async def _get_owned(project_id: str, user: User) -> SocProject:
    """Fetch project and verify ownership. Always 404 to prevent enumeration."""
    try:
        project = await SocProject.get(ObjectId(project_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project or project.owner_id != str(user.id):
        raise HTTPException(status_code=404, detail="Project not found")
    return project


async def _get_accessible(project_id: str, user: User) -> SocProject:
    """Fetch project for read access. Admin can access any project; others must own it."""
    try:
        project = await SocProject.get(ObjectId(project_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if user.role != "admin" and project.owner_id != str(user.id):
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _validate_xml(xml_content: str, rule_name: str) -> None:
    """Raises 422 if xml_content cannot be parsed."""
    try:
        ET.fromstring(xml_content)
    except ET.ParseError as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Rule '{rule_name}': invalid XML — {exc}",
        )


def _is_private_ip(hostname: str) -> bool:
    """Return True if hostname resolves to a private/loopback IP (SSRF guard)."""
    try:
        addr = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(addr)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except Exception:
        return False


async def _get_or_create_siem_config(project_id: str, owner_id: str) -> ProjectSIEMConfig:
    config = await ProjectSIEMConfig.find_one({"project_id": project_id})
    if not config:
        config = ProjectSIEMConfig(owner_id=owner_id, project_id=project_id)
        await config.insert()
    return config


def _severity_from_level(level: int) -> str:
    if level >= 12:
        return "critical"
    if level >= 9:
        return "high"
    if level >= 6:
        return "medium"
    if level >= 3:
        return "low"
    return "informational"


async def _get_project_health_issues(project: SocProject) -> list[str]:
    """Return human-readable health warnings for a project's Wazuh agent."""
    issues: list[str] = []
    try:
        agent = await wazuh_client.get_agent_by_name(project.slug)
    except Exception:
        issues.append("Cannot reach Wazuh manager — check lab network connection")
        return issues

    if not agent:
        issues.append(
            "Wazuh agent not yet registered — deploy the agent compose file on your target server"
        )
        return issues

    if agent.get("status") != "active":
        last_seen = agent.get("lastKeepAlive", "unknown time")
        issues.append(
            f"Agent disconnected since {last_seen} — check if Docker container is running on your server"
        )

    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    alert_count = await Alert.find(
        Alert.agent_name == project.slug,
        Alert.timestamp >= yesterday,
    ).count()
    if agent.get("status") == "active" and alert_count == 0:
        issues.append(
            "No alerts received in 24h — verify detection rules are active and target is generating traffic"
        )

    config = await ProjectSIEMConfig.find_one({"project_id": str(project.id)})
    if config and config.rules_push_status == "failed":
        issues.append("Last custom rule push failed — check rule XML syntax in SIEM Configuration")

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    critical_today = await Alert.find(
        Alert.agent_name == project.slug,
        Alert.rule_level >= 12,
        Alert.timestamp >= today,
    ).count()
    if critical_today > 20:
        issues.append(
            f"{critical_today} critical alerts today — possible incident or overly sensitive rule — investigate"
        )

    return issues


async def _get_global_health_issues(owner_id: str) -> list[dict]:
    """Aggregate health notifications across all user projects."""
    notifications: list[dict] = []
    reachable = await wazuh_client.check_reachable()
    if not reachable:
        notifications.append({
            "level": "error",
            "project_id": None,
            "project_name": None,
            "message": "Cannot reach Wazuh manager — all agent monitoring is offline",
            "action": "Contact lab administrator",
        })
        return notifications

    projects = await SocProject.find(SocProject.owner_id == owner_id).to_list()
    for project in projects:
        issues = await _get_project_health_issues(project)
        for issue in issues:
            is_error = any(kw in issue for kw in ["disconnected", "failed", "Cannot"])
            notifications.append({
                "level": "error" if is_error else "warning",
                "project_id": str(project.id),
                "project_name": project.name,
                "message": issue,
                "action": None,
            })
    return notifications


# ── Project CRUD ──────────────────────────────────────────────────────────────

@router.get("/")
async def list_projects(user: User = Depends(get_current_user)):
    """List SOC projects. Admin: all projects with owner info. Others: own projects only."""
    if user.role == "admin":
        projects = await SocProject.find().sort("+created_at").limit(500).to_list()
        # Pre-fetch owners to avoid N+1
        owner_ids = list({p.owner_id for p in projects})
        try:
            oid_list = [ObjectId(oid) for oid in owner_ids]
        except (InvalidId, Exception) as exc:
            raise HTTPException(status_code=422, detail=f"Invalid owner ID: {exc}") from exc
        owners = await User.find({"_id": {"$in": oid_list}}).limit(500).to_list()
        owner_map = {str(o.id): o for o in owners}
        result = []
        for p in projects:
            resp = _project_to_response(p)
            owner = owner_map.get(p.owner_id)
            resp["owner_username"] = owner.username if owner else p.owner_id
            resp["owner_email"] = owner.email if owner else None
            result.append(resp)
        return result
    projects = await SocProject.find(
        SocProject.owner_id == str(user.id)
    ).sort("+created_at").limit(500).to_list()
    return [_project_to_response(p) for p in projects]


@router.post("/", status_code=201)
async def create_project(data: ProjectCreate, user: User = Depends(get_current_user)):
    """Create a new SOC monitoring project."""
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name is required")
    project = SocProject(
        owner_id=str(user.id),
        name=name,
        slug=_slugify(name),
        target_url=data.target_url.strip(),
        description=data.description,
    )
    await project.insert()
    return _project_to_response(project)


@router.delete("/{project_id}", status_code=200)
async def delete_project(project_id: str, user: User = Depends(get_current_user)):
    """Delete a SOC project (owner only)."""
    project = await _get_owned(project_id, user)
    await project.delete()
    return {"deleted": project_id}


# ── SOC Health (manager status, no credentials exposed) ───────────────────────

@router.get("/health")
async def soc_health(_: User = Depends(get_current_user)):
    """Wazuh manager reachability — no credentials or IP addresses in response."""
    reachable = await wazuh_client.check_reachable()
    if not reachable:
        return {
            "manager_reachable": False,
            "manager_host": "redacted",
            "error": "Cannot connect to Wazuh manager",
        }
    try:
        agents = await wazuh_client.get_agents(limit=500)
        active = sum(1 for a in agents if a.get("status") == "active")
        disconnected = sum(1 for a in agents if a.get("status") == "disconnected")
        return {
            "manager_reachable": True,
            "manager_host": "redacted",
            "total_registered_agents": len(agents),
            "active_agents": active,
            "disconnected_agents": disconnected,
        }
    except Exception:
        return {
            "manager_reachable": True,
            "manager_host": "redacted",
            "total_registered_agents": 0,
            "active_agents": 0,
            "disconnected_agents": 0,
        }


# ── SOC Dashboard (unified view across all user projects) ─────────────────────

@router.get("/dashboard")
async def soc_dashboard(user: User = Depends(get_current_user)):
    """Unified SOC overview: agent counts, alert totals, per-project cards, recent alerts.
    Admin: all users' projects with owner attribution. Others: own projects only."""
    if user.role == "admin":
        projects = await SocProject.find().limit(500).to_list()
        # Pre-fetch owners for admin attribution
        owner_ids = list({p.owner_id for p in projects})
        try:
            oid_list = [ObjectId(oid) for oid in owner_ids]
        except (InvalidId, Exception) as exc:
            raise HTTPException(status_code=422, detail=f"Invalid owner ID: {exc}") from exc
        owners = await User.find({"_id": {"$in": oid_list}}).limit(500).to_list()
        owner_map: dict[str, str] = {str(o.id): o.username for o in owners}
    else:
        projects = await SocProject.find(SocProject.owner_id == str(user.id)).limit(500).to_list()
        owner_map = {}
    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    active_agents = 0
    disconnected_agents = 0
    alerts_today_total = 0
    critical_unread = 0
    high_unread = 0
    per_project: list[dict] = []

    for project in projects:
        try:
            agent = await wazuh_client.get_agent_by_name(project.slug)
            if agent and agent.get("status") == "active":
                active_agents += 1
                agent_status = "connected"
            elif agent:
                disconnected_agents += 1
                agent_status = "disconnected"
            else:
                agent_status = "never_registered"
        except Exception as exc:
            log.debug("Wazuh agent lookup failed for project %s: %s", project.slug, exc)
            agent = None
            agent_status = "unknown"

        proj_alerts_today = await Alert.find(
            Alert.agent_name == project.slug,
            Alert.timestamp >= today,
        ).count()
        alerts_today_total += proj_alerts_today

        proj_critical = await Alert.find(
            Alert.agent_name == project.slug,
            Alert.rule_level >= 12,
            Alert.timestamp >= today,
        ).count()
        critical_unread += proj_critical

        proj_high = await Alert.find(
            Alert.agent_name == project.slug,
            Alert.rule_level >= 9,
            Alert.rule_level < 12,
            Alert.timestamp >= today,
        ).count()
        high_unread += proj_high

        last_alert = await Alert.find(
            Alert.agent_name == project.slug,
        ).sort(-Alert.timestamp).limit(1).first_or_none()

        health_issues = await _get_project_health_issues(project)
        agent_ip = agent.get("ip") if agent else None

        entry: dict = {
            "project_id": str(project.id),
            "project_name": project.name,
            "agent_name": project.slug,
            "agent_status": agent_status,
            "agent_ip": agent_ip,
            "alerts_today": proj_alerts_today,
            "critical_today": proj_critical,
            "last_alert_at": last_alert.timestamp.isoformat() if last_alert else None,
            "health_issues": health_issues,
        }
        if owner_map:
            entry["owner_username"] = owner_map.get(project.owner_id, project.owner_id)
        per_project.append(entry)

    # Severity breakdown across all user's projects
    agent_names = [p.slug for p in projects]
    if agent_names:
        severity_ranges = [
            ("critical", 12, 15),
            ("high", 9, 11),
            ("medium", 6, 8),
            ("low", 3, 5),
            ("informational", 0, 2),
        ]
        alerts_by_severity = {
            label: await Alert.find(
                {"agent_name": {"$in": agent_names}, "rule_level": {"$gte": mn, "$lte": mx}}
            ).count()
            for label, mn, mx in severity_ranges
        }
    else:
        alerts_by_severity = {k: 0 for k in ["critical", "high", "medium", "low", "informational"]}

    # Recent alerts (last 10) across all user projects
    recent_alerts: list[dict] = []
    if agent_names:
        recent = await Alert.find(
            {"agent_name": {"$in": agent_names}}
        ).sort(-Alert.timestamp).limit(10).to_list()
        slug_to_name = {p.slug: p.name for p in projects}
        for a in recent:
            recent_alerts.append({
                "id": str(a.id),
                "wazuh_id": a.wazuh_id,
                "agent_name": a.agent_name,
                "project_name": slug_to_name.get(a.agent_name, "Unknown"),
                "rule_description": a.rule_description,
                "rule_level": a.rule_level,
                "severity": _severity_from_level(a.rule_level),
                "timestamp": a.timestamp.isoformat(),
                "ai_verdict": a.ai_verdict,
                "ai_action": a.ai_action,
            })

    # Admin sees per-project health in the cards; skip the user-scoped global check
    system_notifications = [] if user.role == "admin" else await _get_global_health_issues(str(user.id))

    return {
        "summary": {
            "total_agents": len(projects),
            "active_agents": active_agents,
            "disconnected_agents": disconnected_agents,
            "alerts_today": alerts_today_total,
            "critical_unread": critical_unread,
            "high_unread": high_unread,
        },
        "alerts_by_severity": alerts_by_severity,
        "per_project": per_project,
        "recent_alerts": recent_alerts,
        "system_notifications": system_notifications,
    }


# ── Agent Status (live Wazuh API query) ──────────────────────────────────────

@router.get("/{project_id}/agent-status")
async def agent_status(project_id: str, user: User = Depends(get_current_user)):
    """Rich agent status from Wazuh API. Returns health_issues array."""
    project = await _get_accessible(project_id, user)

    reachable = await wazuh_client.check_reachable()
    if not reachable:
        return {
            "agent_name": project.slug,
            "status": "unknown",
            "manager_reachable": False,
            "error": "Cannot reach Wazuh manager",
            "health_issues": ["Cannot reach Wazuh manager — check lab network connection"],
        }

    agent = await wazuh_client.get_agent_by_name(project.slug)
    if not agent:
        return {
            "agent_name": project.slug,
            "wazuh_agent_id": None,
            "status": "never_registered",
            "manager_reachable": True,
            "message": "Agent not yet registered — deploy the compose file on your target server",
            "health_issues": ["Wazuh agent not yet registered — deploy the agent compose file on your target server"],
        }

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    alerts_today = await Alert.find(Alert.agent_name == project.slug, Alert.timestamp >= today).count()
    alerts_24h = await Alert.find(Alert.agent_name == project.slug, Alert.timestamp >= yesterday).count()
    last_alert = await Alert.find(
        Alert.agent_name == project.slug
    ).sort(-Alert.timestamp).limit(1).first_or_none()

    config = await ProjectSIEMConfig.find_one({"project_id": str(project.id)})
    health_issues = await _get_project_health_issues(project)

    return {
        "agent_name": project.slug,
        "wazuh_agent_id": agent.get("id"),
        "status": "connected" if agent.get("status") == "active" else "disconnected",
        "last_seen": agent.get("lastKeepAlive"),
        "os": (agent.get("os") or {}).get("name"),
        "os_version": (agent.get("os") or {}).get("version"),
        "ip": agent.get("ip"),
        "wazuh_version": agent.get("version"),
        "manager_reachable": True,
        "alerts_today": alerts_today,
        "alerts_last_24h": alerts_24h,
        "last_alert_at": last_alert.timestamp.isoformat() if last_alert else None,
        "rule_push_status": config.rules_push_status if config else None,
        "health_issues": health_issues,
    }


# ── Agent Compose Download ────────────────────────────────────────────────────

@router.get("/{project_id}/agent-compose")
async def agent_compose(project_id: str, user: User = Depends(get_current_user)):
    """Download a docker-compose.yml that connects a Wazuh agent to the lab manager."""
    project = await _get_accessible(project_id, user)
    agent_name = project.slug

    compose = (
        f"version: '3.8'\n"
        f"# Wazuh Agent for project: {project.name}\n"
        f"# Agent name: {agent_name}\n"
        f"# Run: docker compose up -d\n"
        f"# This agent connects to the lab Wazuh manager automatically.\n\n"
        f"services:\n"
        f"  wazuh-agent:\n"
        f"    image: wazuh/wazuh-agent:4.9.0\n"
        f"    hostname: {agent_name}\n"
        f"    environment:\n"
        f"      WAZUH_MANAGER: \"{settings.wazuh_host_public}\"\n"
        f"      WAZUH_REGISTRATION_PASSWORD: \"{settings.wazuh_reg_password}\"\n"
        f"      WAZUH_AGENT_NAME: \"{agent_name}\"\n"
        f"    restart: unless-stopped\n"
        f"    volumes:\n"
        f"      - wazuh_agent_data:/var/ossec/data\n"
        f"    networks:\n"
        f"      - wazuh-net\n\n"
        f"volumes:\n"
        f"  wazuh_agent_data:\n\n"
        f"networks:\n"
        f"  wazuh-net:\n"
        f"    driver: bridge\n"
    )

    return Response(
        content=compose,
        media_type="text/yaml",
        headers={"Content-Disposition": f"attachment; filename=wazuh-agent-{agent_name}.yml"},
    )


# ── SIEM Config — Get / Create ────────────────────────────────────────────────

@router.get("/{project_id}/siem-config")
async def get_siem_config(project_id: str, user: User = Depends(get_current_user)):
    """Get or create SIEM config for a project. Never returns 404."""
    project = await _get_accessible(project_id, user)
    # Use the project's actual owner_id so auto-created configs belong to the owner, not admin
    config = await _get_or_create_siem_config(str(project.id), project.owner_id)
    return {
        "project_id": str(project.id),
        "custom_rules": [r.model_dump() for r in config.custom_rules],
        "rules_last_pushed": config.rules_last_pushed.isoformat() if config.rules_last_pushed else None,
        "rules_push_status": config.rules_push_status,
    }


# ── SIEM Config — Replace All Rules ──────────────────────────────────────────

@router.put("/{project_id}/siem-config/rules")
async def replace_rules(
    project_id: str,
    body: RulesReplaceBody,
    user: User = Depends(get_current_user),
):
    """Replace all custom rules for a project. Validates XML for every rule first."""
    project = await _get_owned(project_id, user)
    for rule_body in body.rules:
        if not rule_body.name.strip():
            raise HTTPException(status_code=422, detail="Rule name must not be empty")
        if not rule_body.description.strip():
            raise HTTPException(status_code=422, detail="Rule description must not be empty")
        _validate_xml(rule_body.xml_content, rule_body.name)

    config = await _get_or_create_siem_config(str(project.id), str(user.id))
    now = datetime.now(timezone.utc)
    config.custom_rules = [
        CustomRule(
            id=str(uuid4()),
            name=r.name.strip(),
            description=r.description.strip(),
            xml_content=r.xml_content,
            enabled=r.enabled,
            created_at=now,
            updated_at=now,
        )
        for r in body.rules
    ]
    await config.save()
    return {
        "project_id": str(project.id),
        "custom_rules": [r.model_dump() for r in config.custom_rules],
    }


# ── SIEM Config — Add Single Rule ────────────────────────────────────────────

@router.post("/{project_id}/siem-config/rules", status_code=201)
async def add_rule(
    project_id: str,
    body: CustomRuleBody,
    user: User = Depends(get_current_user),
):
    """Add a single custom rule. Validates XML before saving."""
    if not body.name.strip():
        raise HTTPException(status_code=422, detail="Rule name is required")
    if not body.description.strip():
        raise HTTPException(status_code=422, detail="Rule description is required")
    _validate_xml(body.xml_content, body.name)

    project = await _get_owned(project_id, user)
    config = await _get_or_create_siem_config(str(project.id), str(user.id))
    now = datetime.now(timezone.utc)
    new_rule = CustomRule(
        id=str(uuid4()),
        name=body.name.strip(),
        description=body.description.strip(),
        xml_content=body.xml_content,
        enabled=body.enabled,
        created_at=now,
        updated_at=now,
    )
    config.custom_rules.append(new_rule)
    await config.save()
    return {
        "project_id": str(project.id),
        "custom_rules": [r.model_dump() for r in config.custom_rules],
    }


# ── SIEM Config — Delete Single Rule ─────────────────────────────────────────

@router.delete("/{project_id}/siem-config/rules/{rule_id}")
async def delete_rule(
    project_id: str,
    rule_id: str,
    user: User = Depends(get_current_user),
):
    """Delete a custom rule by ID from a project's config."""
    project = await _get_owned(project_id, user)
    config = await _get_or_create_siem_config(str(project.id), str(user.id))
    before = len(config.custom_rules)
    config.custom_rules = [r for r in config.custom_rules if r.id != rule_id]
    if len(config.custom_rules) == before:
        raise HTTPException(status_code=404, detail="Rule not found")
    await config.save()
    return {
        "project_id": str(project.id),
        "custom_rules": [r.model_dump() for r in config.custom_rules],
    }


# ── SIEM Config — Fetch XML from URL ─────────────────────────────────────────

@router.post("/{project_id}/siem-config/fetch-xml")
async def fetch_xml_rules(
    project_id: str,
    body: FetchXmlBody,
    user: User = Depends(get_current_user),
):
    """
    Fetch a Wazuh rules XML file from a URL and return parsed rule candidates.
    Does NOT auto-save — the user selects rules and calls PUT /rules to save.

    Security:
    - Only http/https URLs accepted
    - Private IPs blocked (SSRF guard), except the lab Wazuh manager 10.4.89.178
    """
    await _get_owned(project_id, user)

    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=422, detail="URL must use http:// or https://")

    from urllib.parse import urlparse as _urlparse
    parsed_url = _urlparse(url)
    hostname = parsed_url.hostname or ""
    # Allow the lab Wazuh manager IP; block all other private IPs
    if hostname != "10.4.89.178" and _is_private_ip(hostname):
        raise HTTPException(
            status_code=422,
            detail="Fetching from private/internal IP addresses is not allowed",
        )

    try:
        async with httpx.AsyncClient(verify=False, timeout=10.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            xml_text = resp.text
    except httpx.TimeoutException:
        raise HTTPException(status_code=422, detail="Request timed out after 10 seconds")
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=422, detail=f"HTTP {exc.response.status_code} from URL")
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Failed to fetch URL: {exc!s}")

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid XML: {exc}")

    candidates: list[dict] = []
    for rule_el in root.iter("rule"):
        desc_el = rule_el.find("description")
        rule_id = rule_el.get("id", "")
        description = (
            desc_el.text.strip()
            if desc_el is not None and desc_el.text
            else f"Rule {rule_id}"
        )
        candidates.append({
            "name": description,
            "description": description,
            "xml_content": ET.tostring(rule_el, encoding="unicode"),
            "enabled": True,
        })

    return {"candidates": candidates, "total": len(candidates)}
