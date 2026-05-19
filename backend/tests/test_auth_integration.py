"""Integration tests for the auth domain HTTP layer.

Tests cover:
  - Registration endpoint contract
  - Login — cookie delivery and security flags
  - Wrong credentials → 401
  - Protected route without token → 401
  - Protected route with valid cookie → 200
  - Logout → cookie cleared
"""
from unittest.mock import AsyncMock, MagicMock, patch

from tests.conftest import make_mock_user, make_token

# ── Helpers ───────────────────────────────────────────────────────────────────

class _FakeUser:
    """Minimal User stand-in — enough for service return values."""
    def __init__(self, **kw):
        self.id = kw.get("id", "507f1f77bcf86cd799439011")
        self.role = kw.get("role", "analyst")
        self.username = kw.get("username", "tester")
        self.email = kw.get("email", "tester@lab.local")
        self.is_active = True
        self.wazuh_token = None

    async def save(self):
        pass


def _admin_list_mock(users=None):
    """Mock for User.find(...).limit(...).to_list() used in register notification."""
    chain = MagicMock()
    chain.limit = MagicMock(
        return_value=MagicMock(to_list=AsyncMock(return_value=users or []))
    )
    return chain


# ── Register ──────────────────────────────────────────────────────────────────

class TestRegister:
    def test_returns_201_with_pending_status(self, client):
        fake_user = _FakeUser()
        with patch("domains.auth.service.register_user", AsyncMock(return_value=fake_user)), \
             patch("domains.audit.service.log_event", AsyncMock()), \
             patch("domains.auth.models.User.find", return_value=_admin_list_mock()):
            resp = client.post("/api/auth/register", json={
                "username": "tester",
                "email": "tester@lab.local",
                "password": "Secure123!",
            })
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "pending"

    def test_short_password_rejected_with_422(self, client):
        resp = client.post("/api/auth/register", json={
            "username": "tester",
            "email": "tester@lab.local",
            "password": "short",
        })
        assert resp.status_code == 422

    def test_invalid_email_rejected_with_422(self, client):
        resp = client.post("/api/auth/register", json={
            "username": "tester",
            "email": "not-an-email",
            "password": "Secure123!",
        })
        assert resp.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_successful_login_sets_httponly_cookie(self, client):
        from domains.auth.schemas import TokenResponse
        fake_token = make_token()
        mock_result = TokenResponse(access_token=fake_token, token_type="bearer")
        fake_user = _FakeUser()

        with patch("domains.auth.service.authenticate_user", AsyncMock(return_value=mock_result)), \
             patch("domains.auth.models.User.find_one", AsyncMock(return_value=fake_user)), \
             patch("domains.audit.service.log_event", AsyncMock()):
            resp = client.post("/api/auth/login", json={
                "identifier": "tester",
                "password": "Secure123!",
            })

        assert resp.status_code == 200
        assert "access_token" in resp.cookies
        set_cookie = resp.headers.get("set-cookie", "")
        assert "httponly" in set_cookie.lower()

    def test_login_cookie_has_samesite_strict(self, client):
        from domains.auth.schemas import TokenResponse
        fake_token = make_token()
        mock_result = TokenResponse(access_token=fake_token, token_type="bearer")
        fake_user = _FakeUser()

        with patch("domains.auth.service.authenticate_user", AsyncMock(return_value=mock_result)), \
             patch("domains.auth.models.User.find_one", AsyncMock(return_value=fake_user)), \
             patch("domains.audit.service.log_event", AsyncMock()):
            resp = client.post("/api/auth/login", json={
                "identifier": "tester",
                "password": "Secure123!",
            })

        assert resp.status_code == 200
        set_cookie = resp.headers.get("set-cookie", "").lower()
        assert "samesite=strict" in set_cookie

    def test_wrong_password_returns_401(self, client):
        from fastapi import HTTPException

        with patch("domains.auth.service.authenticate_user",
                   AsyncMock(side_effect=HTTPException(status_code=401, detail="Invalid credentials"))), \
             patch("domains.audit.service.log_event", AsyncMock()):
            resp = client.post("/api/auth/login", json={
                "identifier": "nobody",
                "password": "wrongpassword",
            })

        assert resp.status_code == 401


# ── Protected routes ──────────────────────────────────────────────────────────

class TestProtectedRoutes:
    def test_me_without_token_returns_401(self, client):
        resp = client.get("/api/auth/me")
        assert resp.status_code == 401

    def test_me_with_valid_cookie_returns_user_data(self, client):
        fake_user = make_mock_user()
        token = make_token(user_id=fake_user.id)

        with patch("core.dependencies.User.get", AsyncMock(return_value=fake_user)):
            resp = client.get("/api/auth/me", cookies={"access_token": token})

        assert resp.status_code == 200
        assert resp.json()["username"] == fake_user.username

    def test_bearer_token_also_accepted(self, client):
        fake_user = make_mock_user()
        token = make_token(user_id=fake_user.id)

        with patch("core.dependencies.User.get", AsyncMock(return_value=fake_user)):
            resp = client.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )

        assert resp.status_code == 200


# ── Logout ────────────────────────────────────────────────────────────────────

class TestLogout:
    def test_logout_returns_200_and_clears_cookie(self, client):
        resp = client.post("/api/auth/logout")
        assert resp.status_code == 200
        set_cookie = resp.headers.get("set-cookie", "")
        assert "access_token" in set_cookie
        # Starlette delete_cookie sets Max-Age=0 or expires in the past
        assert "max-age=0" in set_cookie.lower() or "expires=" in set_cookie.lower()
