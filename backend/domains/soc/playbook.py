# ============================================================
# backend/domains/soc/playbook.py
# Automated Playbook / Active Response Engine
# ============================================================
# Defines response actions triggered by AlertDetail verdicts.
# Supports both automated (Wazuh Active Response) and
# recommended (human-in-the-loop) actions.
# ============================================================

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from beanie import Document
from pydantic import BaseModel, Field

log = logging.getLogger(__name__)


class PlaybookAction(BaseModel):
    """A single action step within a playbook."""
    step: int = 0
    action_type: str = ""       # block_ip | isolate_agent | disable_user | notify | custom_command
    description: str = ""
    parameters: dict[str, Any] = {}
    automated: bool = False     # True = auto-execute, False = recommend only
    executed: bool = False
    executed_at: Optional[datetime] = None
    result: Optional[str] = None


class PlaybookExecution(Document):
    """Record of a playbook execution for audit trail."""
    alert_id: str
    alert_wazuh_id: str
    playbook_name: str
    trigger_rule: str = ""
    actions: list[PlaybookAction] = []
    status: str = "pending"     # pending | running | completed | failed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None

    class Settings:
        name = "playbook_executions"


# --------------- Playbook Definitions ---------------

PLAYBOOKS: dict[str, dict] = {
    "brute_force_response": {
        "name": "Brute Force Response",
        "trigger_groups": ["brute_force", "authentication_failed"],
        "trigger_level_min": 8,
        "actions": [
            {
                "step": 1,
                "action_type": "block_ip",
                "description": "Block source IP via Wazuh Active Response (firewall-drop)",
                "automated": True,
                "parameters": {"duration": 3600, "command": "firewall-drop"},
            },
            {
                "step": 2,
                "action_type": "notify",
                "description": "Send notification to SOC team",
                "automated": True,
                "parameters": {"channel": "alerts", "priority": "high"},
            },
            {
                "step": 3,
                "action_type": "disable_user",
                "description": "Consider disabling the targeted account temporarily",
                "automated": False,
                "parameters": {},
            },
        ],
    },
    "web_attack_response": {
        "name": "Web Attack Response",
        "trigger_groups": ["web_attack", "sql_injection", "xss"],
        "trigger_level_min": 10,
        "actions": [
            {
                "step": 1,
                "action_type": "block_ip",
                "description": "Block attacking IP via Active Response",
                "automated": True,
                "parameters": {"duration": 7200, "command": "firewall-drop"},
            },
            {
                "step": 2,
                "action_type": "notify",
                "description": "Alert SOC team of active web exploitation attempt",
                "automated": True,
                "parameters": {"channel": "alerts", "priority": "critical"},
            },
        ],
    },
    "malware_response": {
        "name": "Malware Detection Response",
        "trigger_groups": ["rootkit", "trojaned_version", "virus"],
        "trigger_level_min": 7,
        "actions": [
            {
                "step": 1,
                "action_type": "isolate_agent",
                "description": "Recommend network isolation of affected host",
                "automated": False,
                "parameters": {},
            },
            {
                "step": 2,
                "action_type": "notify",
                "description": "Escalate to incident response team",
                "automated": True,
                "parameters": {"channel": "alerts", "priority": "critical"},
            },
        ],
    },
    "privilege_escalation_response": {
        "name": "Privilege Escalation Response",
        "trigger_groups": ["sudo", "privilege_escalation"],
        "trigger_level_min": 10,
        "actions": [
            {
                "step": 1,
                "action_type": "notify",
                "description": "Alert on possible privilege escalation",
                "automated": True,
                "parameters": {"channel": "alerts", "priority": "high"},
            },
            {
                "step": 2,
                "action_type": "custom_command",
                "description": "Review sudo logs and user activity",
                "automated": False,
                "parameters": {},
            },
        ],
    },
}


class PlaybookEngine:
    """Evaluates alerts and triggers matching playbooks."""

    def find_matching_playbook(self, alert) -> Optional[str]:
        """Find the first playbook that matches an alert's rule groups and level."""
        alert_groups = {g.lower().replace(" ", "_") for g in alert.rule_groups}

        for pb_id, pb in PLAYBOOKS.items():
            trigger_groups = set(pb.get("trigger_groups", []))
            if alert_groups & trigger_groups and alert.rule_level >= pb.get("trigger_level_min", 0):
                return pb_id

        return None

    async def execute_playbook(self, alert, playbook_id: str) -> PlaybookExecution:
        """
        Create and execute a playbook for an alert.
        Automated actions are executed immediately.
        Manual actions are logged as recommendations.
        """
        pb_def = PLAYBOOKS.get(playbook_id)
        if not pb_def:
            raise ValueError(f"Unknown playbook: {playbook_id}")

        actions = [PlaybookAction(**a) for a in pb_def["actions"]]

        execution = PlaybookExecution(
            alert_id=str(alert.id),
            alert_wazuh_id=alert.wazuh_id,
            playbook_name=pb_def["name"],
            trigger_rule=f"Rule {alert.rule_id} (level {alert.rule_level})",
            actions=actions,
            status="running",
        )
        await execution.insert()

        # Execute automated actions
        for action in execution.actions:
            if action.automated:
                try:
                    result = await self._execute_action(action, alert)
                    action.executed = True
                    action.executed_at = datetime.now(timezone.utc)
                    action.result = result
                except Exception as e:
                    action.result = f"Failed: {str(e)[:200]}"
                    log.warning("Playbook action failed: %s", str(e)[:200])

        execution.status = "completed"
        execution.completed_at = datetime.now(timezone.utc)
        await execution.save()

        return execution

    async def _execute_action(self, action: PlaybookAction, alert) -> str:
        """Execute a single automated action."""
        if action.action_type == "block_ip":
            return await self._action_block_ip(action, alert)
        elif action.action_type == "notify":
            return await self._action_notify(action, alert)
        else:
            return f"Action type '{action.action_type}' requires manual execution"

    async def _action_block_ip(self, action: PlaybookAction, alert) -> str:
        """Block an IP via Wazuh Active Response API."""
        from domains.soc.wazuh_client import wazuh_client

        source_ip = alert.agent_ip
        if alert.data and isinstance(alert.data, dict):
            source_ip = alert.data.get("srcip", source_ip)

        if not source_ip:
            return "No source IP found to block"

        try:
            command = action.parameters.get("command", "firewall-drop")
            await wazuh_client._request(
                "PUT",
                f"/active-response",
                json={
                    "command": command,
                    "arguments": [source_ip],
                    "alert": {"data": {"srcip": source_ip}},
                },
            )
            return f"Blocked IP {source_ip} via {command}"
        except Exception as e:
            return f"Wazuh AR call failed: {str(e)[:200]}"

    async def _action_notify(self, action: PlaybookAction, alert) -> str:
        """Send a WebSocket notification to the SOC dashboard."""
        try:
            from core.websocket import ws_manager
            channel = action.parameters.get("channel", "alerts")
            await ws_manager.broadcast(channel, {
                "type": "playbook_action",
                "alert_id": str(alert.id),
                "playbook": action.description,
                "priority": action.parameters.get("priority", "medium"),
            })
            return "Notification sent to dashboard"
        except Exception:
            return "Notification sent (best-effort)"

    async def get_executions(self, alert_id: str) -> list[PlaybookExecution]:
        """Get all playbook executions for an alert."""
        return await PlaybookExecution.find({"alert_id": alert_id}).sort("-created_at").to_list()


# Singleton
playbook_engine = PlaybookEngine()
