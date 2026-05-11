# ============================================================
# backend/core/celery_app.py — Celery Configuration
# ============================================================
#
# ── Development (Windows) ───────────────────────────────────
#   Pentest worker (must use --pool=solo on Windows):
#     celery -A core.celery_app worker --loglevel=info --pool=solo -Q celery
#   SOC worker (separate queue, also solo on Windows):
#     celery -A core.celery_app worker --loglevel=info --pool=solo -Q soc -n soc@%%h
#   Beat scheduler (Wazuh polling):
#     celery -A core.celery_app beat --loglevel=info
#
# ── Production (Linux / Ubuntu VM) ─────────────────────────
#   Single worker handling both queues with 4 concurrent processes:
#     celery -A core.celery_app worker --loglevel=info --concurrency=4 -Q celery,soc
#   Or two workers with separate concurrency budgets:
#     celery -A core.celery_app worker --loglevel=info --concurrency=4 -Q celery -n pentest@%%h
#     celery -A core.celery_app worker --loglevel=info --concurrency=2 -Q soc -n soc@%%h
#   Beat scheduler:
#     celery -A core.celery_app beat --loglevel=info
# ============================================================

import os, sys

# Ensure the backend directory is on sys.path so Celery can find local packages.
_backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _backend_dir not in sys.path:
    sys.path.insert(0, _backend_dir)

from celery import Celery
from celery.schedules import crontab
from core.config import settings

celery = Celery(
    "cyber_sentinel",
    broker=settings.redis_url,          # DB 0 — broker
    backend=settings.celery_result_url, # DB 1 — result backend (separated)
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
    # Raise recycle limit — 50 caused frequent Motor client re-creation
    worker_max_tasks_per_child=200,
    # Celery 6.0 compatibility — retry broker connections on startup
    broker_connection_retry_on_startup=True,
    # Expire task results in Redis after 1 hour (prevents unbounded growth)
    result_expires=3600,
    # Ack tasks only after completion so they can be redelivered on worker crash
    task_acks_late=True,
    # Visibility timeout must exceed longest possible task (80 min)
    broker_transport_options={"visibility_timeout": 4800},
)

# --------------- Task Routing ---------------
# Scan tasks stay on the default 'celery' queue (main worker).
# SOC tasks (poll + triage) go to the dedicated 'soc' queue (celery-soc worker).
# This prevents poll/triage tasks from starving run_scan in the same queue.
celery.conf.task_routes = {
    "domains.soc.tasks.poll_wazuh_alerts":     {"queue": "soc"},
    "domains.soc.tasks.triage_single_alert":   {"queue": "soc"},
    "domains.soc.tasks.drain_triage_queue":    {"queue": "soc"},
}

# --------------- Beat Schedule (Periodic Tasks) ---------------
celery.conf.beat_schedule = {
    "poll-wazuh-alerts": {
        "task": "domains.soc.tasks.poll_wazuh_alerts",
        "schedule": 30.0,
        "options": {"expires": 25},
    },
    "drain-triage-queue": {
        "task": "domains.soc.tasks.drain_triage_queue",
        "schedule": 10.0,          # every 10 seconds
        "options": {"expires": 8}, # discard if worker is busy
    },
}

# --------------- Autodiscover Tasks ---------------
# Tell Celery where to find @celery.task definitions
celery.autodiscover_tasks([
    "domains.pentesting",
    "domains.soc",
])
