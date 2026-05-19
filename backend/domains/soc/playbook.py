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
from typing import Any

from beanie import Document
from pydantic import BaseModel, Field
from pymongo import ASCENDING, DESCENDING, IndexModel

log = logging.getLogger(__name__)


class PlaybookAction(BaseModel):
    """A single action step within a playbook."""
    step: int = 0
    action_type: str = ""       # block_ip | isolate_agent | disable_user | notify | custom_command
    description: str = ""
    parameters: dict[str, Any] = {}
    automated: bool = False     # True = auto-execute, False = recommend only
    executed: bool = False
    executed_at: datetime | None = None
    result: str | None = None


class PlaybookExecution(Document):
    """Record of a playbook execution for audit trail."""
    alert_id: str
    alert_wazuh_id: str
    playbook_name: str
    trigger_rule: str = ""
    actions: list[PlaybookAction] = []
    status: str = "pending"     # pending | running | completed | failed
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: datetime | None = None

    class Settings:
        name = "playbook_executions"
        indexes = [
            IndexModel([("alert_id", ASCENDING)]),
            IndexModel([("created_at", DESCENDING)]),
            IndexModel([("status", ASCENDING)]),
            # TTL — expire execution records after 90 days
            IndexModel([("created_at", ASCENDING)], expireAfterSeconds=7_776_000),
        ]


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

    def find_matching_playbook(self, alert) -> str | None:
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

        any_failed = False

        # Execute automated actions
        for action in execution.actions:
            if action.automated:
                try:
                    result = await self._execute_action(action, alert)
                    action.executed = True
                    action.executed_at = datetime.now(timezone.utc)
                    action.result = result
                except Exception as e:
                    action.executed = False
                    action.result = f"Failed: {str(e)[:200]}"
                    any_failed = True
                    log.warning("[Playbook] Action '%s' failed for alert %s: %s", action.action_type, alert.wazuh_id, str(e)[:200])

        execution.status = "completed_with_errors" if any_failed else "completed"
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
            raise RuntimeError("No source IP found in alert — cannot execute block")

        agent_ids = [alert.agent_id] if getattr(alert, "agent_id", None) else []
        if not agent_ids:
            raise RuntimeError("No agent_id on alert — Wazuh Active Response requires a target agent")

        command = action.parameters.get("command", "firewall-drop")
        # Raises on failure — let execute_playbook mark the action as failed
        await wazuh_client.run_active_response(
            command=command,
            agent_ids=agent_ids,
            alert={"data": {"srcip": source_ip}},
            arguments=[source_ip],
        )
        return f"Blocked {source_ip} on agent {agent_ids[0]} via {command}"

    async def _action_notify(self, action: PlaybookAction, alert) -> str:
        """
        Persist an in-app notification AND broadcast over WebSocket.
        This is an in-platform notification only — no email or external channels.
        """
        from core.websocket import ws_manager
        from domains.auth.models import User

        priority = action.parameters.get("priority", "medium")
        channel  = action.parameters.get("channel", "alerts")

        # WebSocket broadcast to all connected clients
        try:
            await ws_manager.broadcast(channel, {
                "type": "playbook_action",
                "alert_id": str(alert.id),
                "playbook": action.description,
                "priority": priority,
            })
        except Exception as exc:
            log.debug("[Playbook] WebSocket broadcast failed: %s", exc)

        # Persist notification to DB so it appears in the notification bell
        # even if the analyst wasn't connected when the playbook ran.
        try:
            owner: User | None = None
            if getattr(alert, "tenant_id", None):
                try:
                    owner = await User.get(alert.tenant_id)
                except Exception:
                    pass
            if owner:
                from domains.notifications.service import create_notification
                notif_type = "soc_critical" if priority == "critical" else "soc_high" if priority == "high" else "soc_alert"
                await create_notification(
                    user_id=str(owner.id),
                    type=notif_type,
                    title=f"[Playbook] {action.description}",
                    body=f"Rule {alert.rule_id} · {alert.rule_description[:80]}",
                )
        except Exception as exc:
            log.debug("[Playbook] Persisted notification failed: %s", exc)

        return f"In-app notification sent (WebSocket + persisted) — priority: {priority}"

    async def get_executions(self, alert_id: str) -> list[PlaybookExecution]:
        """Get all playbook executions for an alert."""
        return await PlaybookExecution.find({"alert_id": alert_id}).sort("-created_at").to_list()


# Singleton
playbook_engine = PlaybookEngine()
