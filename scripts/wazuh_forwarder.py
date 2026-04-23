#!/usr/bin/env python3
"""
wazuh_forwarder.py — Wazuh → Cyber Sentinel bridge

Runs on the Wazuh Manager host. Tails the Wazuh alerts log and POSTs each
alert batch to Cyber Sentinel's webhook endpoint.

Usage:
    python3 wazuh_forwarder.py

Required env vars:
    CYBER_SENTINEL_URL      Base URL, e.g. http://10.4.89.178
    WAZUH_WEBHOOK_TOKEN     Shared secret — must match WAZUH_WEBHOOK_TOKEN in
                            Cyber Sentinel's .env

Optional env vars:
    ALERTS_FILE             Path to Wazuh JSONL alerts log
                            (default: /var/ossec/logs/alerts/alerts.json)
    BATCH_SIZE              Alerts per POST request (default: 20)
    POLL_INTERVAL           Seconds between file checks (default: 5)
    STATE_FILE              Tracks last-read byte offset across restarts
                            (default: /var/ossec/wazuh_forwarder.state)
    MIN_LEVEL               Only forward alerts at or above this Wazuh level
                            (default: 3 — filters noise below level 3)
    LOG_LEVEL               DEBUG / INFO / WARNING (default: INFO)
    MAX_RETRIES             Retry attempts per batch before dropping (default: 5)
    RETRY_BACKOFF           Base seconds for exponential backoff (default: 2)
    REQUEST_TIMEOUT         HTTP timeout in seconds (default: 10)
"""

import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

# ── Config from environment ────────────────────────────────────────────────────

CYBER_SENTINEL_URL = os.environ.get("CYBER_SENTINEL_URL", "").rstrip("/")
WEBHOOK_TOKEN = os.environ.get("WAZUH_WEBHOOK_TOKEN", "")
ALERTS_FILE = Path(os.environ.get("ALERTS_FILE", "/var/ossec/logs/alerts/alerts.json"))
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "20"))
POLL_INTERVAL = float(os.environ.get("POLL_INTERVAL", "5"))
STATE_FILE = Path(os.environ.get("STATE_FILE", "/var/ossec/wazuh_forwarder.state"))
MIN_LEVEL = int(os.environ.get("MIN_LEVEL", "3"))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").upper()
MAX_RETRIES = int(os.environ.get("MAX_RETRIES", "5"))
RETRY_BACKOFF = float(os.environ.get("RETRY_BACKOFF", "2"))
REQUEST_TIMEOUT = float(os.environ.get("REQUEST_TIMEOUT", "10"))

WEBHOOK_URL = f"{CYBER_SENTINEL_URL}/api/soc/webhook"

# ── Logging ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("wazuh_forwarder")


# ── State: track byte offset so restarts don't re-send old alerts ──────────────

def _load_offset() -> int:
    try:
        return int(STATE_FILE.read_text().strip())
    except (FileNotFoundError, ValueError):
        return 0


def _save_offset(offset: int) -> None:
    STATE_FILE.write_text(str(offset))


# ── HTTP POST with retry + exponential backoff ─────────────────────────────────

def _post_batch(alerts: list[dict]) -> bool:
    """POST a list of alert dicts to Cyber Sentinel. Returns True on success."""
    payload = json.dumps({"alerts": alerts}).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Content-Length": str(len(payload)),
    }
    if WEBHOOK_TOKEN:
        headers["X-Wazuh-Token"] = WEBHOOK_TOKEN

    req = urllib.request.Request(WEBHOOK_URL, data=payload, headers=headers, method="POST")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                if 200 <= resp.status < 300:
                    log.debug("Forwarded %d alerts (HTTP %s)", len(alerts), resp.status)
                    return True
                log.warning("Unexpected status %s (attempt %d/%d)", resp.status, attempt, MAX_RETRIES)
        except urllib.error.HTTPError as exc:
            log.warning("HTTP %s from Cyber Sentinel (attempt %d/%d): %s",
                        exc.code, attempt, MAX_RETRIES, exc.reason)
        except urllib.error.URLError as exc:
            log.warning("Connection error (attempt %d/%d): %s", attempt, MAX_RETRIES, exc.reason)
        except Exception as exc:  # noqa: BLE001
            log.warning("Unexpected error (attempt %d/%d): %s", attempt, MAX_RETRIES, exc)

        if attempt < MAX_RETRIES:
            sleep_s = RETRY_BACKOFF ** attempt
            log.info("Retrying in %.1fs …", sleep_s)
            time.sleep(sleep_s)

    log.error("Dropping batch of %d alerts after %d failed attempts.", len(alerts), MAX_RETRIES)
    return False


# ── JSONL file tail ────────────────────────────────────────────────────────────

def _tail_alerts(offset: int):
    """
    Yield (alert_dict, new_offset) for every new valid alert line in ALERTS_FILE.
    Skips lines below MIN_LEVEL and malformed JSON.
    """
    if not ALERTS_FILE.exists():
        log.debug("Alerts file not found yet: %s", ALERTS_FILE)
        return

    file_size = ALERTS_FILE.stat().st_size

    # File was rotated (size shrank) — reset to beginning
    if offset > file_size:
        log.info("Alerts file appears rotated. Resetting offset to 0.")
        offset = 0

    if offset >= file_size:
        return  # Nothing new

    with ALERTS_FILE.open("rb") as fh:
        fh.seek(offset)
        for raw_line in fh:
            offset += len(raw_line)
            line = raw_line.strip()
            if not line:
                continue
            try:
                alert = json.loads(line)
            except json.JSONDecodeError:
                log.debug("Skipping malformed JSON line at offset %d", offset)
                continue

            level = alert.get("rule", {}).get("level", 0)
            if level < MIN_LEVEL:
                log.debug("Skipping low-level alert (level=%d < %d)", level, MIN_LEVEL)
                continue

            yield alert, offset


# ── Main loop ──────────────────────────────────────────────────────────────────

def main() -> None:
    if not CYBER_SENTINEL_URL:
        log.error("CYBER_SENTINEL_URL is not set. Export it before running.")
        sys.exit(1)

    log.info("Wazuh Forwarder starting.")
    log.info("  Source : %s", ALERTS_FILE)
    log.info("  Target : %s", WEBHOOK_URL)
    log.info("  Token  : %s", "set" if WEBHOOK_TOKEN else "NOT SET (insecure!)")
    log.info("  MinLvl : %d", MIN_LEVEL)
    log.info("  Batch  : %d alerts per request", BATCH_SIZE)

    offset = _load_offset()
    log.info("Resuming from byte offset %d", offset)

    while True:
        batch: list[dict] = []
        last_offset = offset

        for alert, new_offset in _tail_alerts(offset):
            batch.append(alert)
            last_offset = new_offset

            if len(batch) >= BATCH_SIZE:
                if _post_batch(batch):
                    _save_offset(last_offset)
                    offset = last_offset
                batch = []

        # Flush any remaining alerts below BATCH_SIZE
        if batch:
            if _post_batch(batch):
                _save_offset(last_offset)
                offset = last_offset

        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log.info("Forwarder stopped.")
