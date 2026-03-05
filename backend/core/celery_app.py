# ============================================================
# backend/core/celery_app.py — Celery Configuration
# ============================================================
# Start the worker:
#   celery -A core.celery_app worker --loglevel=info
# Start the beat scheduler (for periodic Wazuh polling):
#   celery -A core.celery_app beat --loglevel=info
# ============================================================

from celery import Celery
from celery.schedules import crontab
from core.config import settings

celery = Celery(
    "cyber_sentinel",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    # Prevent Celery from prefetching many tasks at once
    worker_prefetch_multiplier=1,
    # Each task gets a fresh connection (avoids stale Motor connections)
    worker_max_tasks_per_child=50,
)

# --------------- Beat Schedule (Periodic Tasks) ---------------
celery.conf.beat_schedule = {
    # Poll Wazuh for new alerts every 30 seconds
    "poll-wazuh-alerts": {
        "task": "domains.soc.tasks.poll_wazuh_alerts",
        "schedule": 30.0,  # seconds
    },
}

# --------------- Autodiscover Tasks ---------------
# Tell Celery where to find @celery.task definitions
celery.autodiscover_tasks([
    "domains.pentesting",
    "domains.soc",
])
