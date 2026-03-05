# ============================================================
# backend/core/metrics.py — Prometheus Metrics
# ============================================================
# Exposes http_requests_total, http_request_duration_seconds,
# websocket_connections_active, and celery_tasks_total.
#
# Scraped by Grafana via GET /api/metrics (text/plain; Prometheus format).
#
# Path normalization prevents label cardinality explosion:
#   /api/scans/6617a3b... → /api/scans/{id}
#   /api/alerts/uuid    → /api/alerts/{id}
# ============================================================

import re

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)

# ----- Counters & Histograms -----

REQUEST_COUNT = Counter(
    "http_requests_total",
    "Total HTTP requests by method, normalized path, and status code",
    ["method", "path", "status"],
)

REQUEST_LATENCY = Histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    ["method", "path"],
    # Buckets chosen to give good resolution across <10ms fast paths and >5s scan ops
    buckets=[0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)

WS_ACTIVE = Gauge(
    "websocket_connections_active",
    "Number of currently active WebSocket connections",
)

CELERY_TASKS = Counter(
    "celery_tasks_total",
    "Celery tasks dispatched",
    ["task", "status"],
)

ERROR_COUNT = Counter(
    "http_errors_total",
    "Unhandled server errors (5xx) by path",
    ["method", "path"],
)


# ----- Path Normalizer -----

# Matches MongoDB ObjectIDs (24 hex chars), UUIDs, and bare integers in path segments.
# These are replaced with {id} so metrics don't explode per unique resource.
_DYNAMIC_SEGMENT = re.compile(
    r"(?<=/)"
    r"(?:"
    r"[0-9a-f]{24}"                                                            # MongoDB ObjectID
    r"|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"        # UUID v4
    r"|\d+"                                                                     # bare integer
    r")"
    r"(?=/|$)",
    re.IGNORECASE,
)


def normalize_path(path: str) -> str:
    """Replace dynamic segments (IDs) in a URL path with `{id}`."""
    return _DYNAMIC_SEGMENT.sub("{id}", path)


# ----- Helpers -----

def record_request(method: str, path: str, status: int, duration_s: float) -> None:
    p = normalize_path(path)
    REQUEST_COUNT.labels(method=method, path=p, status=str(status)).inc()
    REQUEST_LATENCY.labels(method=method, path=p).observe(duration_s)
    if status >= 500:
        ERROR_COUNT.labels(method=method, path=p).inc()


def metrics_output() -> tuple[bytes, str]:
    """Return (body_bytes, content_type) for the Prometheus scrape endpoint."""
    return generate_latest(), CONTENT_TYPE_LATEST
