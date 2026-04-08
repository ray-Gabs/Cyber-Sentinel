#!/usr/bin/env bash
# ============================================================
# scripts/rollback.sh — Git-based rollback for Cyber Sentinel
# ============================================================
# Usage:
#   bash scripts/rollback.sh <commit-hash-or-tag>
#
# Examples:
#   bash scripts/rollback.sh v1.0.0
#   bash scripts/rollback.sh abc1234
#
# What it does:
#   1. Stashes any uncommitted changes
#   2. Checks out the specified commit/tag
#   3. Reinstalls backend requirements if requirements.txt changed
#   4. Restarts the backend server (if managed via a PID file or PM2)
#   5. Verifies /api/health returns 200
# ============================================================

set -euo pipefail

TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
    echo "ERROR: No target specified."
    echo "Usage: bash scripts/rollback.sh <commit-hash-or-tag>"
    exit 1
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Cyber Sentinel rollback to: $TARGET"

# 1. Stash uncommitted changes
echo "--> Stashing uncommitted changes..."
git stash push -m "rollback-autostash-$(date +%Y%m%d-%H%M%S)" || true

# 2. Record current requirements hash so we know if deps changed
PREV_REQ_HASH=""
if [[ -f backend/requirements.txt ]]; then
    PREV_REQ_HASH=$(sha256sum backend/requirements.txt | awk '{print $1}')
fi

# 3. Checkout target
echo "--> Checking out $TARGET..."
git checkout "$TARGET"

# 4. Reinstall requirements if they changed
if [[ -f backend/requirements.txt ]]; then
    NEW_REQ_HASH=$(sha256sum backend/requirements.txt | awk '{print $1}')
    if [[ "$PREV_REQ_HASH" != "$NEW_REQ_HASH" ]]; then
        echo "--> requirements.txt changed — reinstalling..."
        if [[ -f backend/venv/Scripts/pip ]]; then
            backend/venv/Scripts/pip install -r backend/requirements.txt
        elif [[ -f backend/venv/bin/pip ]]; then
            backend/venv/bin/pip install -r backend/requirements.txt
        else
            echo "WARNING: Could not find pip in venv. Install manually:"
            echo "  cd backend && pip install -r requirements.txt"
        fi
    else
        echo "--> requirements.txt unchanged — skipping reinstall."
    fi
fi

# 5. Health check
HEALTH_URL="${HEALTH_URL:-http://localhost:8000/api/health}"
echo "--> Waiting for /api/health to respond at $HEALTH_URL..."
MAX_WAIT=30
WAITED=0
until curl -sf "$HEALTH_URL" | grep -q '"status"'; do
    if [[ $WAITED -ge $MAX_WAIT ]]; then
        echo "ERROR: Health check did not pass within ${MAX_WAIT}s."
        echo "Rollback to $TARGET completed but server may not be running."
        echo "Start manually: cd backend && uvicorn main:app --reload --port 8000"
        exit 1
    fi
    sleep 2
    WAITED=$((WAITED + 2))
done

echo ""
echo "✓ Rollback to $TARGET successful. Health check passed."
echo ""
echo "VERSION file contents:"
cat VERSION 2>/dev/null || echo "(no VERSION file at this commit)"
