import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from core.config import settings


def test_app_redis_url_is_db2():
    assert settings.app_redis_url.endswith("/2"), (
        f"app_redis_url must target DB 2, got: {settings.app_redis_url}"
    )


def test_celery_result_url_is_db1():
    assert settings.celery_result_url.endswith("/1"), (
        f"celery_result_url must target DB 1, got: {settings.celery_result_url}"
    )


def test_poll_skips_when_lock_held():
    """Second poll call returns immediately when lock is already acquired."""
    import domains.soc.tasks as soc_tasks

    mock_redis = AsyncMock()
    mock_redis.set = AsyncMock(return_value=None)  # lock already held
    mock_redis.aclose = AsyncMock()

    with patch("domains.soc.tasks.settings") as mock_settings:
        mock_settings.app_redis_url = "redis://localhost:6379/2"
        mock_settings.wazuh_api_password = ""
        with patch("redis.asyncio.from_url", return_value=mock_redis):
            asyncio.run(soc_tasks._poll_async())

    mock_redis.set.assert_called_once()
    call_kwargs = mock_redis.set.call_args
    assert call_kwargs.kwargs.get("nx") is True


def test_triage_skips_duplicate_alert():
    """triage_single_alert returns immediately when alert lock is already held."""
    mock_r = MagicMock()
    mock_r.set.return_value = None  # SETNX returns None — lock already held

    with patch("redis.from_url", return_value=mock_r):
        with patch("asyncio.run") as mock_run:
            from domains.soc.tasks import triage_single_alert
            triage_single_alert.__wrapped__("fake-alert-id-123")
            mock_run.assert_not_called()


def test_drain_pops_from_sorted_set():
    """drain_triage_queue pops alert IDs from soc:triage_pending and dispatches per-alert tasks."""
    mock_redis = AsyncMock()
    mock_redis.zpopmin = AsyncMock(return_value=[
        (b"alert-id-1", 1000.0),
        (b"alert-id-2", 1001.0),
        (b"alert-id-3", 1002.0),
    ])
    mock_redis.aclose = AsyncMock()

    with patch("redis.asyncio.from_url", return_value=mock_redis):
        with patch("core.database.init_db", new_callable=AsyncMock):
            from domains.soc import tasks as soc_tasks
            with patch.object(soc_tasks.triage_single_alert, "delay") as mock_delay:
                asyncio.run(soc_tasks._drain_async())

    assert mock_delay.call_count == 3
    mock_delay.assert_any_call("alert-id-1")
    mock_delay.assert_any_call("alert-id-2")
    mock_delay.assert_any_call("alert-id-3")
    mock_redis.zpopmin.assert_called_once_with("soc:triage_pending", count=50)
