# ============================================================
# backend/domains/soc/wazuh_client.py — Wazuh REST API Client
# ============================================================
# Full async wrapper for the Wazuh Manager REST API v4.
# Wazuh API docs: https://documentation.wazuh.com/current/user-manual/api/
# ============================================================

import httpx
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from core.config import settings


class WazuhClient:
    """
    Async HTTP client for the Wazuh Manager REST API.

    Usage:
        client = WazuhClient()
        token = await client.authenticate()
        alerts = await client.get_alerts(limit=100)
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
    ):
        self.base_url = base_url or settings.wazuh_api_url
        self.user = user or settings.wazuh_api_user
        self.password = password or settings.wazuh_api_password
        self.verify_ssl = settings.wazuh_verify_ssl
        self._token: Optional[str] = None
        self._token_expires: Optional[datetime] = None

    # ─────────────────────────────────────────────
    # Auth
    # ─────────────────────────────────────────────

    async def authenticate(self) -> str:
        """
        Authenticate with the Wazuh API and cache the JWT token.
        Tokens expire after 15 minutes by default; we refresh at 13 minutes.
        """
        async with httpx.AsyncClient(verify=self.verify_ssl) as client:
            resp = await client.post(
                f"{self.base_url}/security/user/authenticate",
                auth=(self.user, self.password),
                timeout=10.0,
            )
            resp.raise_for_status()
            self._token = resp.json()["data"]["token"]
            self._token_expires = datetime.now(timezone.utc) + timedelta(minutes=13)
            return self._token

    async def _get_token(self) -> str:
        """Return cached token or re-authenticate if missing/expired."""
        now = datetime.now(timezone.utc)
        if not self._token or (self._token_expires and now >= self._token_expires):
            await self.authenticate()
        return self._token

    async def _request(self, method: str, path: str, **kwargs) -> dict:
        """Make an authenticated request to the Wazuh API."""
        token = await self._get_token()
        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient(verify=self.verify_ssl, timeout=30.0) as client:
            resp = await client.request(
                method,
                f"{self.base_url}{path}",
                headers=headers,
                **kwargs,
            )
            if resp.status_code == 401:
                await self.authenticate()
                headers["Authorization"] = f"Bearer {self._token}"
                resp = await client.request(
                    method,
                    f"{self.base_url}{path}",
                    headers=headers,
                    **kwargs,
                )
            resp.raise_for_status()
            return resp.json()

    def _items(self, data: dict) -> list[dict]:
        """Extract affected_items from a standard Wazuh response envelope."""
        return data.get("data", {}).get("affected_items", [])

    # ─────────────────────────────────────────────
    # Manager / Cluster
    # ─────────────────────────────────────────────

    async def get_manager_info(self) -> dict:
        """Return Wazuh Manager version, revision, and OS info."""
        data = await self._request("GET", "/")
        return data.get("data", {})

    async def get_cluster_status(self) -> dict:
        """Return cluster enabled/disabled status and node list."""
        data = await self._request("GET", "/cluster/status")
        return data.get("data", {})

    async def get_cluster_nodes(self) -> list[dict]:
        """List all nodes in the Wazuh cluster."""
        data = await self._request("GET", "/cluster/nodes")
        return self._items(data)

    # ─────────────────────────────────────────────
    # Alerts
    # ─────────────────────────────────────────────

    async def get_alerts(
        self,
        limit: int = 100,
        offset: int = 0,
        level_min: int | None = None,
        level_max: int | None = None,
        q: str | None = None,
    ) -> list[dict]:
        """
        Fetch alerts from Wazuh.
        Returns a list of alert dicts.
        """
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if level_min is not None:
            params["level"] = f"{level_min}-{level_max or 15}"
        if q:
            params["q"] = q

        data = await self._request("GET", "/alerts", params=params)
        return self._items(data)

    async def get_alert(self, alert_id: str) -> dict | None:
        """Fetch a single alert by ID."""
        data = await self._request("GET", "/alerts", params={"q": f"id={alert_id}", "limit": 1})
        items = self._items(data)
        return items[0] if items else None

    async def get_alerts_since(
        self,
        since: datetime,
        limit: int = 500,
        level_min: int = 0,
    ) -> list[dict]:
        """
        Fetch alerts newer than `since` (ISO 8601 timestamp).
        Useful for incremental polling — pass last_polled_at on each cycle.
        """
        ts = since.strftime("%Y-%m-%dT%H:%M:%S")
        params: dict[str, Any] = {
            "limit": limit,
            "q": f"timestamp>{ts}",
        }
        if level_min > 0:
            params["level"] = f"{level_min}-15"
        data = await self._request("GET", "/alerts", params=params)
        return self._items(data)

    async def search_alerts(
        self,
        q: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        level_min: int | None = None,
        rule_id: str | None = None,
        agent_id: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """
        Advanced alert search with multiple filter dimensions.

        Args:
            q:          Wazuh query string (e.g. "data.srcip=192.168.1.1")
            date_from:  ISO 8601 string or "now-1h", "now-24h"
            date_to:    ISO 8601 string
            level_min:  Minimum rule level (0–15)
            rule_id:    Filter by specific Wazuh rule ID
            agent_id:   Filter by agent ID
            limit:      Max results (Wazuh hard cap: 500)
        """
        clauses: list[str] = []
        if q:
            clauses.append(q)
        if date_from:
            clauses.append(f"timestamp>{date_from}")
        if date_to:
            clauses.append(f"timestamp<{date_to}")
        if rule_id:
            clauses.append(f"rule.id={rule_id}")
        if agent_id:
            clauses.append(f"agent.id={agent_id}")

        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if clauses:
            params["q"] = ";".join(clauses)
        if level_min is not None:
            params["level"] = f"{level_min}-15"

        data = await self._request("GET", "/alerts", params=params)
        return self._items(data)

    # ─────────────────────────────────────────────
    # Agents
    # ─────────────────────────────────────────────

    async def get_agents(
        self,
        limit: int = 500,
        status: str | None = None,
        os_platform: str | None = None,
        q: str | None = None,
    ) -> list[dict]:
        """
        List registered agents.

        Args:
            status:      active | disconnected | never_connected | pending
            os_platform: linux | windows | darwin
        """
        params: dict[str, Any] = {"limit": limit}
        if status:
            params["status"] = status
        if os_platform:
            params["os.platform"] = os_platform
        if q:
            params["q"] = q
        data = await self._request("GET", "/agents", params=params)
        return self._items(data)

    async def get_agent(self, agent_id: str) -> dict | None:
        """Get details for a specific agent."""
        data = await self._request("GET", "/agents", params={"agents_list": agent_id})
        items = self._items(data)
        return items[0] if items else None

    async def get_active_agents(self) -> list[dict]:
        """Return only agents with 'active' connection status."""
        return await self.get_agents(status="active")

    async def get_disconnected_agents(self) -> list[dict]:
        """Return agents that are currently disconnected."""
        return await self.get_agents(status="disconnected")

    async def get_agent_summary(self) -> dict:
        """Return aggregate counts: total, active, disconnected, never_connected, pending."""
        data = await self._request("GET", "/agents/summary/status")
        return data.get("data", {})

    # ─────────────────────────────────────────────
    # Syscollector (agent hardware/software inventory)
    # ─────────────────────────────────────────────

    async def get_agent_processes(self, agent_id: str, limit: int = 100) -> list[dict]:
        """
        Return running processes on an agent (requires syscollector module).
        Useful for triage context: detect suspicious process names.
        """
        data = await self._request(
            "GET", f"/syscollector/{agent_id}/processes", params={"limit": limit}
        )
        return self._items(data)

    async def get_agent_ports(self, agent_id: str, limit: int = 100) -> list[dict]:
        """
        Return open ports/listening services on an agent.
        Useful for attack surface context during triage.
        """
        data = await self._request(
            "GET", f"/syscollector/{agent_id}/ports", params={"limit": limit, "state": "listening"}
        )
        return self._items(data)

    async def get_agent_packages(self, agent_id: str, limit: int = 200) -> list[dict]:
        """
        Return installed software packages on an agent.
        Useful for correlating alerts with known-vulnerable versions.
        """
        data = await self._request(
            "GET", f"/syscollector/{agent_id}/packages", params={"limit": limit}
        )
        return self._items(data)

    async def get_agent_hotfixes(self, agent_id: str) -> list[dict]:
        """Return applied Windows hotfixes/patches (Windows agents only)."""
        data = await self._request(
            "GET", f"/syscollector/{agent_id}/hotfixes"
        )
        return self._items(data)

    async def get_agent_hardware(self, agent_id: str) -> dict:
        """Return hardware inventory (CPU, RAM, board) for an agent."""
        data = await self._request("GET", f"/syscollector/{agent_id}/hardware")
        items = self._items(data)
        return items[0] if items else {}

    async def get_agent_os(self, agent_id: str) -> dict:
        """Return OS details for an agent."""
        data = await self._request("GET", f"/syscollector/{agent_id}/os")
        items = self._items(data)
        return items[0] if items else {}

    async def get_agent_network_interfaces(self, agent_id: str) -> list[dict]:
        """Return network interface configuration for an agent."""
        data = await self._request("GET", f"/syscollector/{agent_id}/netiface")
        return self._items(data)

    # ─────────────────────────────────────────────
    # Vulnerability Detection (Wazuh VD)
    # ─────────────────────────────────────────────

    async def get_vulnerabilities(
        self,
        agent_id: str,
        severity: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """
        Return CVE vulnerabilities detected on an agent by Wazuh Vulnerability Detection.

        Args:
            agent_id: Target agent ID
            severity: critical | high | medium | low (filter by CVSS severity)
            limit:    Max results
        """
        params: dict[str, Any] = {"limit": limit}
        if severity:
            params["severity"] = severity
        data = await self._request(
            "GET", f"/vulnerability/{agent_id}", params=params
        )
        return self._items(data)

    async def get_vulnerability_summary(self, agent_id: str) -> dict:
        """Return vulnerability counts by severity for an agent."""
        data = await self._request(
            "GET", f"/vulnerability/{agent_id}/summary/severity"
        )
        return data.get("data", {})

    # ─────────────────────────────────────────────
    # File Integrity Monitoring (FIM / syscheck)
    # ─────────────────────────────────────────────

    async def get_fim_events(
        self,
        agent_id: str,
        event_type: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """
        Return FIM events for an agent.

        Args:
            agent_id:   Target agent ID
            event_type: added | modified | deleted
            limit:      Max results
        """
        params: dict[str, Any] = {"limit": limit}
        if event_type:
            params["type"] = event_type
        data = await self._request(
            "GET", f"/syscheck/{agent_id}", params=params
        )
        return self._items(data)

    async def run_fim_scan(self, agent_id: str) -> dict:
        """Trigger an on-demand FIM scan on a specific agent."""
        data = await self._request("PUT", f"/syscheck/{agent_id}")
        return data.get("data", {})

    # ─────────────────────────────────────────────
    # Security Configuration Assessment (SCA)
    # ─────────────────────────────────────────────

    async def get_sca_results(self, agent_id: str, limit: int = 100) -> list[dict]:
        """
        Return SCA policy scan results for an agent.
        Shows which CIS benchmark checks passed/failed.
        """
        data = await self._request("GET", f"/sca/{agent_id}", params={"limit": limit})
        return self._items(data)

    async def get_sca_checks(
        self,
        agent_id: str,
        policy_id: str,
        result: str | None = None,
        limit: int = 200,
    ) -> list[dict]:
        """
        Return individual SCA check results for a policy.

        Args:
            agent_id:  Target agent ID
            policy_id: SCA policy ID (e.g. "cis_debian10")
            result:    passed | failed | not_applicable
        """
        params: dict[str, Any] = {"limit": limit}
        if result:
            params["result"] = result
        data = await self._request(
            "GET", f"/sca/{agent_id}/checks/{policy_id}", params=params
        )
        return self._items(data)

    # ─────────────────────────────────────────────
    # Detection Rules
    # ─────────────────────────────────────────────

    async def get_rules(self, limit: int = 500) -> list[dict]:
        """List all Wazuh detection rules."""
        data = await self._request("GET", "/rules", params={"limit": limit})
        return self._items(data)

    async def get_rule(self, rule_id: str) -> dict | None:
        """Get a specific Wazuh rule by ID."""
        data = await self._request("GET", "/rules", params={"rule_ids": rule_id})
        items = self._items(data)
        return items[0] if items else None

    async def get_rule_groups(self) -> list[str]:
        """Return all unique rule group labels defined in Wazuh."""
        data = await self._request("GET", "/rules/groups")
        return self._items(data)

    async def get_rules_by_group(self, group: str, limit: int = 100) -> list[dict]:
        """Return all rules belonging to a specific group label."""
        data = await self._request(
            "GET", "/rules", params={"group": group, "limit": limit}
        )
        return self._items(data)

    async def get_rules_requiring_restart(self) -> list[dict]:
        """Return rules that require a manager restart to activate."""
        data = await self._request("GET", "/rules/requirement/restart")
        return self._items(data)

    # ─────────────────────────────────────────────
    # Decoders
    # ─────────────────────────────────────────────

    async def get_decoders(self, limit: int = 200) -> list[dict]:
        """List Wazuh log decoders."""
        data = await self._request("GET", "/decoders", params={"limit": limit})
        return self._items(data)

    # ─────────────────────────────────────────────
    # Log Queries (Manager logs)
    # ─────────────────────────────────────────────

    async def get_manager_logs(
        self,
        type_log: str | None = None,
        category: str | None = None,
        limit: int = 100,
    ) -> list[dict]:
        """
        Query Wazuh Manager's own operational logs.

        Args:
            type_log: all | error | info | warning | debug
            category: wazuh (default) or module name
        """
        params: dict[str, Any] = {"limit": limit}
        if type_log:
            params["type_log"] = type_log
        if category:
            params["category"] = category
        data = await self._request("GET", "/manager/logs", params=params)
        return self._items(data)

    async def get_manager_log_summary(self) -> dict:
        """Return log type counts for the Wazuh Manager."""
        data = await self._request("GET", "/manager/logs/summary")
        return data.get("data", {})

    # ─────────────────────────────────────────────
    # Active Response
    # ─────────────────────────────────────────────

    async def run_active_response(
        self,
        command: str,
        agent_ids: list[str],
        alert: dict | None = None,
        arguments: list[str] | None = None,
    ) -> dict:
        """
        Trigger an active response command on one or more agents.

        Args:
            command:    Active response script name (e.g. "firewall-drop")
            agent_ids:  List of agent IDs to target
            alert:      Optional alert context dict (passed to the script)
            arguments:  Additional CLI arguments for the script

        CAUTION: This executes commands on the endpoint. Ensure the command
        is enabled in ossec.conf active-response block before calling this.
        """
        payload: dict[str, Any] = {
            "command": command,
            "agents_list": agent_ids,
        }
        if alert:
            payload["alert"] = alert
        if arguments:
            payload["arguments"] = arguments
        data = await self._request("PUT", "/active-response", json=payload)
        return data.get("data", {})

    # ─────────────────────────────────────────────
    # Statistics
    # ─────────────────────────────────────────────

    async def get_manager_stats(self) -> dict:
        """Return manager-level event processing statistics."""
        data = await self._request("GET", "/manager/stats")
        return data.get("data", {})

    async def get_manager_stats_hourly(self) -> dict:
        """Return event processing statistics broken down by hour."""
        data = await self._request("GET", "/manager/stats/hourly")
        return data.get("data", {})

    async def get_manager_stats_weekly(self) -> dict:
        """Return event processing statistics broken down by day of week."""
        data = await self._request("GET", "/manager/stats/weekly")
        return data.get("data", {})

    async def get_remoted_stats(self) -> dict:
        """Return statistics from the remoted daemon (agent communication)."""
        data = await self._request("GET", "/manager/stats/remoted")
        return data.get("data", {})

    # ─────────────────────────────────────────────
    # MITRE ATT&CK (Wazuh built-in mapping)
    # ─────────────────────────────────────────────

    async def get_mitre_tactics(self, limit: int = 50) -> list[dict]:
        """Return MITRE ATT&CK tactics from Wazuh's built-in database."""
        data = await self._request("GET", "/mitre/tactics", params={"limit": limit})
        return self._items(data)

    async def get_mitre_techniques(
        self,
        tactic_id: str | None = None,
        limit: int = 200,
    ) -> list[dict]:
        """
        Return MITRE ATT&CK techniques.

        Args:
            tactic_id: Filter by parent tactic (e.g. "TA0001")
        """
        params: dict[str, Any] = {"limit": limit}
        if tactic_id:
            params["tactic_ids"] = tactic_id
        data = await self._request("GET", "/mitre/techniques", params=params)
        return self._items(data)

    async def get_mitre_groups(self, limit: int = 100) -> list[dict]:
        """Return MITRE ATT&CK adversary groups from Wazuh's database."""
        data = await self._request("GET", "/mitre/groups", params={"limit": limit})
        return self._items(data)

    # ─────────────────────────────────────────────
    # Convenience helpers used by projects_router
    # ─────────────────────────────────────────────

    async def check_reachable(self) -> bool:
        """Return True if the Wazuh manager is reachable, False otherwise (never raises)."""
        try:
            await self.authenticate()
            return True
        except Exception:
            return False

    async def get_agent_by_name(self, name: str) -> dict | None:
        """Find a registered agent by its name field. Returns None if not found or unreachable."""
        try:
            data = await self._request("GET", "/agents", params={"name": name, "limit": 1})
            items = self._items(data)
            return items[0] if items else None
        except Exception:
            return None

    # ─────────────────────────────────────────────
    # Context helper for triage pipeline
    # ─────────────────────────────────────────────

    async def build_agent_context(self, agent_id: str) -> dict:
        """
        Gather a rich agent context snapshot used to augment LLM triage prompts.

        Returns a dict with: agent details, OS, open ports, running processes,
        FIM recent modifications, and vulnerability summary.
        All sub-calls are best-effort — failures are captured as error strings.
        """
        ctx: dict[str, Any] = {"agent_id": agent_id}

        async def _safe(coro, key: str, default: Any = None):
            try:
                ctx[key] = await coro
            except Exception as e:
                ctx[key] = default if default is not None else f"error: {e}"

        await _safe(self.get_agent(agent_id), "agent")
        await _safe(self.get_agent_os(agent_id), "os")
        await _safe(self.get_agent_ports(agent_id, limit=20), "open_ports")
        await _safe(self.get_agent_processes(agent_id, limit=20), "processes")
        await _safe(
            self.get_fim_events(agent_id, event_type="modified", limit=10),
            "recent_fim_changes",
        )
        await _safe(self.get_vulnerability_summary(agent_id), "vuln_summary")

        return ctx


# Singleton — import wazuh_client everywhere
wazuh_client = WazuhClient()
