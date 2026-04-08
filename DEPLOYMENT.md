# Deployment Guide — Cyber Sentinel

## Pre-Deploy Checklist

- [ ] All tests pass locally
- [ ] `.env` has `JWT_SECRET` set (not auto-generated)
- [ ] `.env` has `FRONTEND_URL` set to production URL
- [ ] `.env` has `DEBUG=false`
- [ ] Docker: MongoDB and Redis containers running
- [ ] Git tag created (see Version Tagging below)

## Version Tagging

**Before every major deploy:**

```bash
# Update VERSION file
echo "1.x.x" > VERSION
git add VERSION
git commit -m "chore: bump version to 1.x.x"

# Create and push tag
git tag v1.x.x
git push origin main --tags
```

## Dev Startup Sequence

```bash
# 1. Infrastructure
docker compose up -d

# 2. Backend
cd backend
.\venv\Scripts\activate          # Windows
source venv/bin/activate          # Linux/Mac
uvicorn main:app --reload --port 8000

# 3. Celery worker (new terminal)
cd backend && .\venv\Scripts\activate
celery -A core.celery_app worker --loglevel=info --pool=solo

# 4. Frontend (new terminal)
cd frontend && npm run dev
```

## Health Check

```bash
curl http://localhost:8000/api/health
# Returns 200 if MongoDB + Redis are up
# Returns 503 if any dependency is down
```

## Rollback Procedure

### Git-Based Rollback

```bash
# Roll back to a specific tag or commit
bash scripts/rollback.sh v1.2.0
bash scripts/rollback.sh abc1234
```

The script will:
1. Stash uncommitted changes
2. Check out the target commit
3. Reinstall requirements if `requirements.txt` changed
4. Verify `/api/health` returns 200

### Manual Rollback

```bash
git stash
git checkout v1.x.x
cd backend && pip install -r requirements.txt
# Restart uvicorn + celery
```

## Database Rollback

**MongoDB has no automatic rollback.** Before any schema-breaking migration:

```bash
# Export a collection before migrating
mongoexport \
  --uri="mongodb://localhost:27017/cyber_sentinel" \
  --collection=users \
  --out=backup/users-$(date +%Y%m%d).json

mongoexport \
  --uri="mongodb://localhost:27017/cyber_sentinel" \
  --collection=scans \
  --out=backup/scans-$(date +%Y%m%d).json
```

If a migration goes wrong, restore with:

```bash
mongoimport \
  --uri="mongodb://localhost:27017/cyber_sentinel" \
  --collection=users \
  --file=backup/users-YYYYMMDD.json \
  --drop
```

## Environment Variables (Required in Production)

| Variable | Required | Notes |
|---|---|---|
| `JWT_SECRET` | YES | Generate: `python -c "import secrets; print(secrets.token_urlsafe(64))"` |
| `FRONTEND_URL` | YES | Exact production URL — used for CORS and email links |
| `MONGODB_URI` | YES | MongoDB connection string |
| `REDIS_URL` | YES | Redis connection string |
| `DEBUG` | YES | Set to `false` in production |
| `SMTP_HOST` + related | For emails | Required for password reset |

## UptimeRobot Setup

Monitor `/api/health` — it returns:
- `200` + `{"status": "ok"}` → all dependencies healthy
- `503` + `{"status": "degraded"}` → MongoDB or Redis down

Set alert threshold: 1 failure = alert immediately.
