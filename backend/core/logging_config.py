# ============================================================
# backend/core/logging_config.py — Structured JSON Logging
# ============================================================
# Configures structlog as the logging backend for the entire app.
# All stdlib logging calls (fastapi, uvicorn, celery, domain code)
# automatically flow through structlog's JSON formatter.
#
# Every log line includes: timestamp, level, logger, trace_id, service
# trace_id is injected per-request by the X-Request-ID middleware.
# ============================================================

import logging
import sys

import structlog


def configure_logging(level: str = "INFO") -> None:
    """Wire structlog JSON logging as the single logging backend."""

    shared_processors: list[structlog.types.Processor] = [
        # Merge any bound contextvars (trace_id, user_id, etc.) into the event dict
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.ExceptionRenderer(),
    ]

    structlog.configure(
        processors=shared_processors
        + [structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        wrapper_class=structlog.stdlib.BoundLogger,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.JSONRenderer(),
        ],
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Reduce noise from chatty third-party loggers
    for noisy in ("uvicorn.access", "motor", "beanie"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
