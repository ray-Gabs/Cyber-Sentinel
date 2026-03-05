# ============================================================
# backend/core/storage.py — Report Storage Abstraction
# ============================================================
# Decouples report generation from storage so the same code
# works in dev (local memory/filesystem) and production (S3).
#
# S3 mode:  set S3_BUCKET in .env → reports go to S3, endpoint
#           returns a pre-signed URL valid for S3_URL_EXPIRES seconds.
# Local mode: S3_BUCKET empty → reports are streamed directly from
#             memory; no files written to disk.
#
# Usage:
#   storage = get_storage()
#   key = await storage.upload("scans/scan_id/report.pdf", pdf_bytes, "application/pdf")
#   url  = await storage.presign(key)   # or None in local mode
# ============================================================

from __future__ import annotations

import logging
from typing import Protocol, runtime_checkable

from core.config import settings

log = logging.getLogger(__name__)


@runtime_checkable
class StorageBackend(Protocol):
    """Minimal interface every backend must satisfy."""

    async def upload(self, key: str, content: bytes, content_type: str) -> str:
        """Upload content; returns the storage key."""
        ...

    async def presign(self, key: str) -> str | None:
        """Return a pre-signed download URL, or None if not applicable."""
        ...

    @property
    def is_remote(self) -> bool:
        """True for S3/GCS — tells callers whether to redirect to a URL."""
        ...


# ── Local (no-op) backend ────────────────────────────────────────────────────

class LocalStorage:
    """
    In-memory storage for dev/test — does not write to disk.
    Reports are streamed directly from the router response.
    presign() returns None so callers know to return bytes inline.
    """

    is_remote = False

    async def upload(self, key: str, content: bytes, content_type: str) -> str:
        return key  # key is a logical identifier only — nothing is persisted

    async def presign(self, key: str) -> str | None:
        return None  # Caller streams bytes directly


# ── S3 backend ───────────────────────────────────────────────────────────────

class S3Storage:
    """
    AWS S3 storage backend. Requires boto3 and S3_BUCKET in settings.
    Credentials can be set via:
      - S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY in .env
      - IAM instance profile (EC2/ECS) — no env vars needed, auto-discovered
      - AWS_PROFILE env var for named profiles in ~/.aws/credentials
    """

    is_remote = True

    def __init__(self) -> None:
        import boto3

        session = boto3.Session(
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
            region_name=settings.s3_region,
        )
        # Use asyncio executor for boto3 calls (not natively async)
        self._s3 = session.client("s3")
        self._bucket = settings.s3_bucket
        self._prefix = settings.s3_reports_prefix.rstrip("/") + "/"
        self._expires = settings.s3_url_expires

    def _full_key(self, key: str) -> str:
        return f"{self._prefix}{key}"

    async def upload(self, key: str, content: bytes, content_type: str) -> str:
        import asyncio

        full_key = self._full_key(key)
        await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: self._s3.put_object(
                Bucket=self._bucket,
                Key=full_key,
                Body=content,
                ContentType=content_type,
                # Server-side encryption at rest
                ServerSideEncryption="AES256",
            ),
        )
        log.info("storage.upload s3://%s/%s (%d bytes)", self._bucket, full_key, len(content))
        return full_key

    async def presign(self, key: str) -> str | None:
        import asyncio

        url: str = await asyncio.get_running_loop().run_in_executor(
            None,
            lambda: self._s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=self._expires,
            ),
        )
        return url


# ── Singleton factory ────────────────────────────────────────────────────────

_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    """
    Return the configured storage backend (singleton).
    Selects S3Storage when S3_BUCKET is set, LocalStorage otherwise.
    """
    global _storage
    if _storage is None:
        if settings.s3_bucket:
            try:
                _storage = S3Storage()
                log.info("storage.backend=s3 bucket=%s", settings.s3_bucket)
            except Exception as exc:
                log.warning("S3 init failed — falling back to local storage: %s", exc)
                _storage = LocalStorage()
        else:
            _storage = LocalStorage()
            log.info("storage.backend=local (set S3_BUCKET to enable S3 uploads)")
    return _storage
