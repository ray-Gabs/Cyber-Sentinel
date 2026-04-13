# ============================================================
# backend/domains/soc/projects_router.py — SOC Projects API
# ============================================================

from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from pydantic import BaseModel

from core.dependencies import get_current_user
from domains.auth.models import User
from domains.soc.project_models import SocProject, _slugify

router = APIRouter()


class ProjectCreate(BaseModel):
    name: str
    target_url: str
    description: Optional[str] = None


def _to_response(p: SocProject) -> dict:
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
    """Fetch project and verify ownership. Raises 404/403 as appropriate."""
    try:
        project = await SocProject.get(ObjectId(project_id))
    except Exception:
        raise HTTPException(status_code=404, detail="Project not found")
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    if project.owner_id != str(user.id):
        raise HTTPException(status_code=403, detail="Not your project")
    return project


@router.get("/")
async def list_projects(user: User = Depends(get_current_user)):
    """List all SOC projects owned by the current user."""
    projects = await SocProject.find(
        SocProject.owner_id == str(user.id)
    ).sort("+created_at").to_list()
    return [_to_response(p) for p in projects]


@router.post("/", status_code=201)
async def create_project(
    data: ProjectCreate,
    user: User = Depends(get_current_user),
):
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
        created_at=datetime.now(timezone.utc),
    )
    await project.insert()
    return _to_response(project)


@router.delete("/{project_id}", status_code=200)
async def delete_project(
    project_id: str,
    user: User = Depends(get_current_user),
):
    """Delete a SOC project (owner only)."""
    project = await _get_owned(project_id, user)
    await project.delete()
    return {"deleted": project_id}


@router.get("/{project_id}/agent-status")
async def agent_status(
    project_id: str,
    user: User = Depends(get_current_user),
):
    """Return the Wazuh agent registration status for a project."""
    project = await _get_owned(project_id, user)
    return {
        "project_id": project_id,
        "wazuh_agent_registered": project.wazuh_agent_registered,
        "wazuh_agent_id": project.wazuh_agent_id,
        "wazuh_agent_name": project.wazuh_agent_name,
    }


@router.get("/{project_id}/agent-compose")
async def agent_compose(
    project_id: str,
    user: User = Depends(get_current_user),
):
    """Download a docker-compose.yml for deploying a Wazuh agent for this project."""
    project = await _get_owned(project_id, user)
    agent_name = project.slug or project.name.lower().replace(" ", "-")
    compose = (
        'version: "3.9"\n'
        "services:\n"
        f"  wazuh-agent-{agent_name}:\n"
        "    image: wazuh/wazuh-agent:4.7.0\n"
        f"    container_name: wazuh-agent-{agent_name}\n"
        f"    hostname: {agent_name}\n"
        "    restart: unless-stopped\n"
        "    environment:\n"
        "      - WAZUH_MANAGER=${WAZUH_MANAGER_IP}\n"
        f"      - WAZUH_AGENT_NAME={agent_name}\n"
        "      - WAZUH_REGISTRATION_PASSWORD=${WAZUH_REG_PASSWORD}\n"
        "    volumes:\n"
        "      - /var/log:/var/log:ro\n"
        "      - /proc:/proc:ro\n"
        "      - /sys:/sys:ro\n"
        "    network_mode: host\n"
        "    cap_add:\n"
        "      - SYS_PTRACE\n"
        "      - NET_ADMIN\n"
    )
    return Response(
        content=compose,
        media_type="text/yaml",
        headers={
            "Content-Disposition": (
                f"attachment; filename=wazuh-agent-{agent_name}.yml"
            )
        },
    )
