# ============================================================
# backend/domains/soc/wazuh_client.py — Wazuh REST API Client
# ============================================================
# Handles authentication, alert polling, and agent listing.
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
            # Treat tokens as valid for 13 minutes (Wazuh default is 15)
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
            # If token expired, retry once
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

    # --------------- Alerts ---------------

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
        return data.get("data", {}).get("affected_items", [])

    async def get_alert(self, alert_id: str) -> dict | None:
        """Fetch a single alert by ID."""
        data = await self._request("GET", f"/alerts", params={"q": f"id={alert_id}", "limit": 1})
        items = data.get("data", {}).get("affected_items", [])
        return items[0] if items else None

    # --------------- Agents ---------------

    async def get_agents(self, limit: int = 500) -> list[dict]:
        """List all registered Wazuh agents."""
        data = await self._request("GET", "/agents", params={"limit": limit})
        return data.get("data", {}).get("affected_items", [])

    async def get_agent(self, agent_id: str) -> dict | None:
        """Get details for a specific agent."""
        data = await self._request("GET", f"/agents", params={"agents_list": agent_id})
        items = data.get("data", {}).get("affected_items", [])
        return items[0] if items else None

    async def get_agent_by_name(self, name: str) -> dict | None:
        """Get agent details by agent name. Returns None if not found."""
        try:
            data = await self._request("GET", "/agents", params={"name": name})
            items = data.get("data", {}).get("affected_items", [])
            return items[0] if items else None
        except Exception:
            return None

    async def check_reachable(self) -> bool:
        """Check if the Wazuh manager is reachable. Safe — never raises."""
        try:
            await self._get_token()
            return True
        except Exception:
            return False

    # --------------- Rules ---------------

    async def get_rules(self, limit: int = 500) -> list[dict]:
        """List Wazuh detection rules."""
        data = await self._request("GET", "/rules", params={"limit": limit})
        return data.get("data", {}).get("affected_items", [])


# Singleton
wazuh_client = WazuhClient()
