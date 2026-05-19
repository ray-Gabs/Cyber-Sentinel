"""Integration tests for the pentesting scan HTTP layer.

Tests cover:
  - List scans without auth → 401
  - List scans with auth → 200 + paginated envelope
  - Create scan without auth → 401
  - Create scan with viewer role → 403
  - Create scan with valid URL → 201
  - Get single scan not found → 404
"""
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from tests.conftest import make_mock_user, make_token

# ── Helpers ───────────────────────────────────────────────────────────────────

def _motor_aggregate_mock(items=None, total=0):
    """Mock Motor collection.aggregate($facet pipeline).to_list(1).

    list_scans now uses a single $facet aggregation that returns:
        [{"total": [{"n": N}], "items": [...scan dicts...]}]
    """
    facet_result = [{"total": [{"n": total}] if total else [], "items": items or []}]
    cursor = MagicMock()
    cursor.to_list = AsyncMock(return_value=facet_result)
    col = MagicMock()
    col.aggregate = MagicMock(return_value=cursor)
    return col


def _fake_scan(scan_id: str = "60c72b2f9b1e8b001f8e4d10"):
    scan = MagicMock()
    scan.id = scan_id
    scan.target = "https://scanme.nmap.org"
    scan.scan_type = "quick"
    scan.status = "pending"
    scan.progress = 0
    scan.findings = []
    scan.risk_score = None
    scan.current_stage = None
    scan.completed_tools = []
    scan.created_at = datetime.now(timezone.utc)
    scan.completed_at = None
    return scan


def _patch_redis_checks():
    """Patches all Redis-based scan limit checks and ensures in-memory rate limiter."""
    return patch.multiple(
        "domains.pentesting.router",
        _check_rate_limit=AsyncMock(),
        _check_total_active_scans=AsyncMock(),
        _check_concurrent_scans=AsyncMock(),
        _increment_active_scans=AsyncMock(),
    )


# ── List scans ────────────────────────────────────────────────────────────────

class TestListScans:
    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/api/scans/")
        assert resp.status_code == 401

    def test_authenticated_returns_paginated_envelope(self, client):
        fake_user = make_mock_user()
        token = make_token(user_id=fake_user.id)

        with patch("core.dependencies.User.get", AsyncMock(return_value=fake_user)), \
             patch("core.cache.cache_get", AsyncMock(return_value=None)), \
             patch("core.cache.cache_set", AsyncMock()), \
             patch("domains.pentesting.models.Scan.get_motor_collection",
                   return_value=_motor_aggregate_mock(total=0)):
            resp = client.get("/api/scans/", cookies={"access_token": token})

        assert resp.status_code == 200
        body = resp.json()
        assert "items" in body
        assert "total" in body
        assert "page" in body
        assert body["total"] == 0

    def test_pagination_defaults_to_page_1_size_10(self, client):
        fake_user = make_mock_user()
        token = make_token(user_id=fake_user.id)

        with patch("core.dependencies.User.get", AsyncMock(return_value=fake_user)), \
             patch("core.cache.cache_get", AsyncMock(return_value=None)), \
             patch("core.cache.cache_set", AsyncMock()), \
             patch("domains.pentesting.models.Scan.get_motor_collection",
                   return_value=_motor_aggregate_mock()):
            resp = client.get("/api/scans/", cookies={"access_token": token})

        assert resp.status_code == 200
        body = resp.json()
        assert body["page"] == 1
        assert body["size"] == 10


# ── Create scan ───────────────────────────────────────────────────────────────

class TestCreateScan:
    def test_unauthenticated_returns_401(self, client):
        resp = client.post("/api/scans/", json={"target": "https://example.com", "scan_type": "quick"})
        assert resp.status_code == 401

    def test_viewer_role_returns_403(self, client, app):
        fake_user = make_mock_user(role="viewer")
        token = make_token(user_id=fake_user.id, role="viewer")

        from slowapi import Limiter
        from slowapi.util import get_remote_address
        mem_limiter = Limiter(key_func=get_remote_address)

        with patch.object(app.state, "limiter", mem_limiter), \
             patch("core.dependencies.User.get", AsyncMock(return_value=fake_user)), \
             _patch_redis_checks():
            resp = client.post(
                "/api/scans/",
                json={"target": "https://example.com", "scan_type": "quick"},
                cookies={"access_token": token},
            )

        assert resp.status_code == 403

    def test_valid_target_returns_201(self, client, app):
        fake_user = make_mock_user(role="analyst")
        token = make_token(user_id=fake_user.id, role="analyst")
        fake_scan = _fake_scan()

        from slowapi import Limiter
        from slowapi.util import get_remote_address
        mem_limiter = Limiter(key_func=get_remote_address)

        with patch.object(app.state, "limiter", mem_limiter), \
             patch("core.dependencies.User.get", AsyncMock(return_value=fake_user)), \
             _patch_redis_checks(), \
             patch("domains.pentesting.service.create_scan", AsyncMock(return_value=fake_scan)), \
             patch("domains.audit.service.log_event", AsyncMock()):
            resp = client.post(
                "/api/scans/",
                json={"target": "https://scanme.nmap.org", "scan_type": "quick"},
                cookies={"access_token": token},
            )

        assert resp.status_code == 201
        body = resp.json()
        assert body["target"] == "https://scanme.nmap.org"
        assert body["status"] == "pending"


# ── Get single scan ───────────────────────────────────────────────────────────

class TestGetScan:
    def test_unauthenticated_returns_401(self, client):
        resp = client.get("/api/scans/507f1f77bcf86cd799439011")
        assert resp.status_code == 401

    def test_nonexistent_scan_returns_404(self, client):
        fake_user = make_mock_user()
        token = make_token(user_id=fake_user.id)

        with patch("core.dependencies.User.get", AsyncMock(return_value=fake_user)), \
             patch("domains.pentesting.models.Scan.get", AsyncMock(return_value=None)):
            resp = client.get(
                "/api/scans/507f1f77bcf86cd799439099",
                cookies={"access_token": token},
            )

        assert resp.status_code == 404
