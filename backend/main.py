# ============================================================
# backend/main.py — FastAPI Application Entry Point
# ============================================================
# Run with:
#   uvicorn main:app --reload --host 0.0.0.0 --port 8000
# ============================================================

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from core.config import settings
from core.database import init_db, close_db
from core.websocket import ws_manager


# --------------- Lifespan ---------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle events."""
    # Startup
    await init_db()
    print(f"[OK] Connected to MongoDB ({settings.mongodb_db_name})")

    # Ensure AI cache TTL index
    from ai.cache import AiCache
    await AiCache().ensure_indexes()

    yield

    # Shutdown
    await close_db()
    print("[OK] Disconnected from MongoDB")


# --------------- App ---------------

app = FastAPI(
    title="Cyber Sentinel API",
    description="Unified Pentesting & SOC Platform — Powered by Gemini Flash",
    version="1.0.0",
    lifespan=lifespan,
)

# --------------- CORS ---------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------- Routers ---------------

from domains.auth.router import router as auth_router
from domains.pentesting.router import router as pentest_router
from domains.soc.router import router as soc_router

app.include_router(auth_router, prefix="/api/auth", tags=["Auth"])
app.include_router(pentest_router, prefix="/api/scans", tags=["Pentesting"])
app.include_router(soc_router, prefix="/api/alerts", tags=["SOC"])

# --------------- Health Check ---------------

@app.get("/api/health", tags=["System"])
async def health():
    return {"status": "ok", "service": "Cyber Sentinel", "version": "1.0.0"}


# --------------- Global Error Handler ---------------

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch any unhandled error and return a clean JSON response."""
    # HTTPExceptions are already handled by FastAPI — this catches everything else
    if isinstance(exc, HTTPException):
        raise exc
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "error": str(exc) if settings.debug else None},
    )


# --------------- WebSocket Endpoint ---------------

@app.websocket("/ws/{channel}")
async def websocket_endpoint(websocket: WebSocket, channel: str):
    """
    Generic WebSocket endpoint.
    Channels:
        - "scans"  → real-time scan progress updates
        - "alerts" → live Wazuh alert feed
    """
    await ws_manager.connect(websocket, channel)
    try:
        while True:
            # Keep connection alive — client can send pings
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, channel)
