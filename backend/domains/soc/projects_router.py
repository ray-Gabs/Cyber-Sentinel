# ============================================================
# backend/domains/soc/projects_router.py — SOC Projects API
# ============================================================
# Mounted at prefix /api/soc in main.py
# ============================================================

import logging
import socket
import ipaddress
from datetime import datetime, timedelta, timezone
from typing import Optional

log = logging.getLogger(__name__)

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel

from core.config import settings
from core.dependencies import get_current_user
from domains.auth.models import User
from domains.soc.models import Alert
from domains.soc.project_models import SocProject, _slugify
from domains.soc.wazuh_client import wazuh_client

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    target_url: str
    description: Optional[str] = None
    wazuh_agent_name: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    target_url: Optional[str] = None
    description: Optional[str] = None
    wazuh_agent_registered: Optional[bool] = None
    wazuh_agent_id: Optional[str] = None
    wazuh_agent_name: Optional[str] = None



# ── Internal helpers ──────────────────────────────────────────────────────────

def _project_to_response(p: SocProject) -> dict:
    agent_name = p.wazuh_agent_name or p.slug
    install_cmd = (
        f"curl -so wazuh-agent.deb https://packages.wazuh.com/4.x/apt/pool/main/w/wazuh-agent/wazuh-agent_4.14.5-1_amd64.deb && "
        f"WAZUH_MANAGER=\"{settings.wazuh_host_public}\" WAZUH_AGENT_NAME=\"{agent_name}\" "
        f"dpkg -i wazuh-agent.deb && systemctl start wazuh-agent"
    )
    return {
        "id": str(p.id),
        "name": p.name,
        "slug": p.slug,
        "target_url": p.target_url,
        "description": p.description,
        "wazuh_agent_registered": p.wazuh_agent_registered,
        "wazuh_agent_id": p.wazuh_agent_id,
        "wazuh_agent_name": p.wazuh_agent_name,
        "install_cmd": install_cmd,
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


def _is_private_ip(hostname: str) -> bool:
    """Return True if hostname resolves to a private/loopback IP (SSRF guard)."""
    try:
        addr = socket.gethostbyname(hostname)
        ip = ipaddress.ip_address(addr)
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except Exception:
        return False


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
    agent_name = project.wazuh_agent_name or project.slug
    try:
        agent = await wazuh_client.get_agent_by_name(agent_name)
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
        Alert.agent_name == agent_name,
        Alert.timestamp >= yesterday,
    ).count()
    if agent.get("status") == "active" and alert_count == 0:
        issues.append(
            "No alerts received in 24h — verify detection rules are active and target is generating traffic"
        )

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    critical_today = await Alert.find(
        Alert.agent_name == agent_name,
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
        wazuh_agent_name=data.wazuh_agent_name.strip() if data.wazuh_agent_name else None,
    )
    await project.insert()
    return _project_to_response(project)


@router.patch("/{project_id}", status_code=200)
async def update_project(project_id: str, data: ProjectUpdate, user: User = Depends(get_current_user)):
    """Update a SOC project (owner only). Used to confirm agent registration or edit metadata."""
    project = await _get_owned(project_id, user)
    if data.name is not None:
        project.name = data.name.strip()
        project.slug = _slugify(project.name)
    if data.target_url is not None:
        project.target_url = data.target_url.strip()
    if data.description is not None:
        project.description = data.description
    if data.wazuh_agent_registered is not None:
        project.wazuh_agent_registered = data.wazuh_agent_registered
    if data.wazuh_agent_id is not None:
        project.wazuh_agent_id = data.wazuh_agent_id
    if data.wazuh_agent_name is not None:
        project.wazuh_agent_name = data.wazuh_agent_name
    await project.save()
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
    is_admin = user.role == "admin"
    # Use wazuh_agent_name when set (e.g. "lab-target"); fall back to slug for new projects
    project_agent_names = [p.wazuh_agent_name or p.slug for p in projects]

    # Build the base alert query for this user.
    # Admin sees all alerts. Non-admin: tenant_id bucket (from per-user webhook token)
    # combined with resolved agent names — so alerts show up regardless of name/slug mismatch.
    def _base_query() -> dict:
        if is_admin:
            return {}
        conditions: list[dict] = [{"tenant_id": str(user.id)}]
        if project_agent_names:
            conditions.append({"agent_name": {"$in": project_agent_names}})
        return {"$or": conditions} if len(conditions) > 1 else conditions[0]

    base_q = _base_query()

    # Summary stats from tenant-scoped query (not per-project slug matching)
    alerts_today_total = await Alert.find({**base_q, "timestamp": {"$gte": today}}).count()
    critical_unread = await Alert.find({**base_q, "rule_level": {"$gte": 12}}).count()
    high_unread = await Alert.find({**base_q, "rule_level": {"$gte": 9, "$lt": 12}}).count()

    active_agents = 0
    disconnected_agents = 0
    per_project: list[dict] = []

    for project in projects:
        proj_agent_name = project.wazuh_agent_name or project.slug
        try:
            agent = await wazuh_client.get_agent_by_name(proj_agent_name)
            if agent and agent.get("status") == "active":
                active_agents += 1
                agent_status = "connected"
            elif agent:
                disconnected_agents += 1
                agent_status = "disconnected"
            else:
                agent_status = "never_registered"
        except Exception as exc:
            log.debug("Wazuh agent lookup failed for project %s: %s", proj_agent_name, exc)
            agent = None
            agent_status = "unknown"

        proj_alerts_today = await Alert.find(
            Alert.agent_name == proj_agent_name,
            Alert.timestamp >= today,
        ).count()

        proj_critical = await Alert.find(
            Alert.agent_name == proj_agent_name,
            Alert.rule_level >= 12,
            Alert.timestamp >= today,
        ).count()

        last_alert = await Alert.find(
            Alert.agent_name == proj_agent_name,
        ).sort(-Alert.timestamp).limit(1).first_or_none()

        health_issues = await _get_project_health_issues(project)
        agent_ip = agent.get("ip") if agent else None

        entry: dict = {
            "project_id": str(project.id),
            "project_name": project.name,
            "agent_name": proj_agent_name,
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

    # Severity breakdown from tenant-scoped query (catches alerts not matched by project slug)
    severity_ranges = [
        ("critical", 12, 15),
        ("high", 9, 11),
        ("medium", 6, 8),
        ("low", 3, 5),
        ("informational", 0, 2),
    ]
    alerts_by_severity = {
        label: await Alert.find({**base_q, "rule_level": {"$gte": mn, "$lte": mx}}).count()
        for label, mn, mx in severity_ranges
    }

    # Recent alerts from tenant-scoped query (not just project slugs)
    # Map both slug and wazuh_agent_name → project name for display
    slug_to_name = {p.slug: p.name for p in projects}
    slug_to_name.update({p.wazuh_agent_name: p.name for p in projects if p.wazuh_agent_name})
    recent = await Alert.find(base_q).sort(-Alert.timestamp).limit(10).to_list()
    recent_alerts: list[dict] = [
        {
            "id": str(a.id),
            "wazuh_id": a.wazuh_id,
            "agent_name": a.agent_name,
            "project_name": slug_to_name.get(a.agent_name, a.agent_name or "—"),
            "rule_description": a.rule_description,
            "rule_level": a.rule_level,
            "severity": _severity_from_level(a.rule_level),
            "timestamp": a.timestamp.isoformat(),
            "ai_verdict": a.ai_verdict,
            "ai_action": a.ai_action,
        }
        for a in recent
    ]

    # Admin sees per-project health in the cards; skip the user-scoped global check
    if user.role == "admin":
        system_notifications = []
    else:
        try:
            system_notifications = await _get_global_health_issues(str(user.id))
        except Exception as exc:
            log.warning("Global health check failed for user %s: %s", str(user.id), exc)
            system_notifications = []

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

    proj_agent_name = project.wazuh_agent_name or project.slug
    reachable = await wazuh_client.check_reachable()
    if not reachable:
        return {
            "agent_name": proj_agent_name,
            "status": "unknown",
            "manager_reachable": False,
            "error": "Cannot reach Wazuh manager",
            "health_issues": ["Cannot reach Wazuh manager — check lab network connection"],
        }

    agent = await wazuh_client.get_agent_by_name(proj_agent_name)
    log.info("[agent-status] project=%s agent_name=%s wazuh_result=%s", project_id, proj_agent_name, agent)
    if not agent:
        # Fallback: search all active agents for a name match (case-insensitive)
        try:
            all_agents = await wazuh_client.get_active_agents()
            agent = next(
                (a for a in all_agents if a.get("name", "").lower() == proj_agent_name.lower()),
                None,
            )
            if agent:
                log.info("[agent-status] Found agent via fallback search: %s", agent)
        except Exception as exc:
            log.warning("[agent-status] Fallback agent search failed: %s", exc)
    if not agent:
        return {
            "agent_name": proj_agent_name,
            "wazuh_agent_id": None,
            "status": "never_registered",
            "manager_reachable": True,
            "message": "Agent not yet registered — deploy the compose file on your target server",
            "health_issues": ["Wazuh agent not yet registered — deploy the agent compose file on your target server"],
        }

    today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday = datetime.now(timezone.utc) - timedelta(hours=24)
    alerts_today = await Alert.find(Alert.agent_name == proj_agent_name, Alert.timestamp >= today).count()
    alerts_24h = await Alert.find(Alert.agent_name == proj_agent_name, Alert.timestamp >= yesterday).count()
    last_alert = await Alert.find(
        Alert.agent_name == proj_agent_name
    ).sort(-Alert.timestamp).limit(1).first_or_none()

    health_issues = await _get_project_health_issues(project)

    is_active = agent.get("status", "").lower() == "active"
    if is_active and not project.wazuh_agent_registered:
        project.wazuh_agent_registered = True
        project.wazuh_agent_id = agent.get("id")
        await project.save()

    return {
        "agent_name": proj_agent_name,
        "wazuh_agent_id": agent.get("id"),
        "status": "connected" if is_active else "disconnected",
        "last_seen": agent.get("lastKeepAlive"),
        "os": (agent.get("os") or {}).get("name"),
        "os_version": (agent.get("os") or {}).get("version"),
        "ip": agent.get("ip"),
        "wazuh_version": agent.get("version"),
        "manager_reachable": True,
        "alerts_today": alerts_today,
        "alerts_last_24h": alerts_24h,
        "last_alert_at": last_alert.timestamp.isoformat() if last_alert else None,
        "health_issues": health_issues,
    }


# ── Agent Compose Download ────────────────────────────────────────────────────

@router.get("/{project_id}/agent-compose")
async def agent_compose(project_id: str, user: User = Depends(get_current_user)):
    """Download a docker-compose.yml that connects a Wazuh agent to the lab manager."""
    project = await _get_accessible(project_id, user)
    agent_name = project.wazuh_agent_name or project.slug

    reg_password = settings.wazuh_reg_password or ""
    compose = (
        f"# Wazuh Agent for project: {project.name}\n"
        f"# Agent name : {agent_name}\n"
        f"# Run        : docker compose up -d\n"
        f"# Connects to the lab Wazuh manager automatically.\n\n"
        f"services:\n"
        f"  wazuh-agent:\n"
        f"    image: ubuntu:22.04\n"
        f"    hostname: {agent_name}\n"
        f"    environment:\n"
        f"      WAZUH_MANAGER: \"{settings.wazuh_host_public}\"\n"
        f"      WAZUH_AGENT_NAME: \"{agent_name}\"\n"
        f"      WAZUH_REGISTRATION_PASSWORD: \"{reg_password}\"\n"
        f"    entrypoint:\n"
        f"      - /bin/bash\n"
        f"      - -c\n"
        f"      - |\n"
        f"        set -e\n"
        f"        apt-get update -qq\n"
        f"        apt-get install -y -qq curl gnupg2\n"
        f"        curl -sO https://packages.wazuh.com/key/GPG-KEY-WAZUH\n"
        f"        gpg --dearmor < GPG-KEY-WAZUH | tee /usr/share/keyrings/wazuh.gpg > /dev/null\n"
        f"        echo 'deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main' \\\n"
        f"          | tee /etc/apt/sources.list.d/wazuh.list\n"
        f"        apt-get update -qq\n"
        f"        WAZUH_MANAGER=\"$$WAZUH_MANAGER\" WAZUH_AGENT_NAME=\"$$WAZUH_AGENT_NAME\" \\\n"
        f"          WAZUH_REGISTRATION_PASSWORD=\"$$WAZUH_REGISTRATION_PASSWORD\" \\\n"
        f"          apt-get install -y wazuh-agent\n"
        f"        /var/ossec/bin/wazuh-agentd -f\n"
        f"    restart: unless-stopped\n"
        f"    volumes:\n"
        f"      - wazuh_agent_data:/var/ossec/data\n\n"
        f"volumes:\n"
        f"  wazuh_agent_data:\n"
    )

    return Response(
        content=compose,
        media_type="text/yaml",
        headers={"Content-Disposition": f"attachment; filename=wazuh-agent-{agent_name}.yml"},
    )

