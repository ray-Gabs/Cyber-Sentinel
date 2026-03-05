# ============================================================
# backend/core/websocket.py — WebSocket Connection Manager
# ============================================================
# Keeps track of all connected WebSocket clients so we can
# broadcast real-time updates (scan progress, new alerts, etc.)
# ============================================================

from fastapi import WebSocket
import json
from typing import Any


class ConnectionManager:
    """
    Manages active WebSocket connections grouped by channel.

    Usage:
        manager = ConnectionManager()

        # In a WebSocket route
        @app.websocket("/ws/{channel}")
        async def ws(websocket: WebSocket, channel: str):
            await manager.connect(websocket, channel)
            try:
                while True:
                    await websocket.receive_text()   # keep-alive
            except WebSocketDisconnect:
                manager.disconnect(websocket, channel)

        # From anywhere (e.g. Celery callback, service layer)
        await manager.broadcast("scans", {"scan_id": "...", "progress": 75})
    """

    def __init__(self):
        # channel -> list of active WebSocket connections
        self._channels: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str = "default") -> None:
        await websocket.accept()
        self._channels.setdefault(channel, []).append(websocket)

    def disconnect(self, websocket: WebSocket, channel: str = "default") -> None:
        if channel in self._channels:
            self._channels[channel] = [
                ws for ws in self._channels[channel] if ws is not websocket
            ]

    async def broadcast(self, channel: str, data: dict[str, Any]) -> None:
        """Send a JSON message to every client subscribed to `channel`."""
        dead: list[WebSocket] = []
        for ws in self._channels.get(channel, []):
            try:
                await ws.send_text(json.dumps(data))
            except Exception:
                dead.append(ws)
        # Clean up disconnected clients
        for ws in dead:
            self.disconnect(ws, channel)

    async def send_personal(self, websocket: WebSocket, data: dict[str, Any]) -> None:
        """Send a JSON message to a single client."""
        await websocket.send_text(json.dumps(data))


# Singleton — import this wherever you need WS broadcasts
ws_manager = ConnectionManager()
