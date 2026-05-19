# Cyber Sentinel

**AI-powered web application security assessment and SOC platform.**

Built at the ITS Smart City and Cybersecurity Lab (SMU internship), Cyber Sentinel combines an automated penetration testing pipeline with a real-time Security Operations Center powered by Wazuh SIEM and multi-provider AI analysis.

> **Lab VM:** `http://10.4.89.178:8888` — Swagger docs: `http://10.4.89.178:8000/docs`

---

## Architecture

```
Browser / Lab Client
        │
        ▼
  nginx :8888  (reverse proxy)
  ┌────────────────────────────────────────────────────┐
  │  /api/*  →  FastAPI backend    (port 8000)         │
  │  /*       →  React frontend    (Vite static build) │
  └────────────────────────────────────────────────────┘
        │
        ├── MongoDB 7           scan results, alerts, users
        ├── Redis 7             Celery broker + result backend
        ├── Celery worker       pentest queue (runs scans)
        ├── Celery SOC worker   SOC queue (Wazuh poll + AI triage)
        ├── Celery Beat         scheduler (recurring scans every 60s)
        └── OWASP ZAP           DAST scanner daemon
```

---

## Capabilities

### Pentest Engine

Orchestrates 20 scanner modules in parallel via Celery, enriches findings with CVE/EPSS data, and generates an AI narrative report.

| Scanner | Purpose |
|---|---|
| Nmap | Port scan, service version, OS fingerprint |
| Nuclei | 3,000+ CVE, misconfiguration, and exposure templates |
| OWASP ZAP | Full DAST — active + passive scanning |
| SSLyze | TLS/SSL analysis — weak ciphers, HSTS, OCSP |
| WhatWeb | Technology fingerprinting |
| Custom modules | SQLi, XSS, IDOR, SSRF, CORS, auth checks, redirect, supply chain |

**Scan profiles:** `quick` (~5 min) · `standard` (~15 min) · `full` (~30–45 min)

**AI output:** Risk score · Executive summary · OWASP Top 10:2025 coverage · Per-finding remediation · PDF + HTML export

**Scheduling:** Recurring scans (hourly / daily / weekly / monthly) via Celery Beat

**Finding verification:** Passive re-probes to confirm or dismiss findings (SQLi error-based, XSS reflection, CORS, open redirect, header presence, server disclosure)

### SOC Platform

- Live alert stream from Wazuh manager via webhook
- AI triage per alert: TRUE_POSITIVE / FALSE_POSITIVE + reasoning
- MITRE ATT&CK technique tagging
- Paginated alert feed — `GET /api/alerts/` returns total count, page info, and items (correct count even with 100k+ alerts)
- Correlation engine: links SOC alerts back to pentest findings on the same target
- Per-project agent tenancy, custom detection rules

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11+, FastAPI (async), Celery 5, Redis 7 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Database | MongoDB 7 (Docker) |
| AI | Claude · Groq · Gemini · OpenAI — auto-fallback |
| Security Tools | Nmap, Nuclei, SSLyze, WhatWeb, OWASP ZAP |
| Real-time | WebSocket (scan progress + alert feed) |
| Auth | JWT (HS256), bcrypt |
| Reports | ReportLab (PDF), Jinja2 (HTML) |
| Containers | Docker Compose, nginx |

---

## VM Deployment (Lab Server — SSH)

> This is the production workflow used on the lab VM. Tested on Ubuntu 22.04 with Docker Compose v2.

### First-time setup

```bash
# SSH into the VM
ssh user@10.4.89.178

# Clone the repo
git clone -b Automated-Pentesting https://github.com/ray-Gabs/Cyber-Sentinel.git
cd Cyber-Sentinel

# Create the environment file
cp .env.example .env
nano .env
# Fill in required values — see Configuration section below

# Build and start all services
docker compose up -d --build

# Verify everything is up
docker compose ps
curl http://localhost:8000/api/health
```

Access the app at: **`http://10.4.89.178:8888`**

### First login

On a fresh database, the app creates one admin account from the values in `.env`:

```env
FIRST_ADMIN_USERNAME=admin
FIRST_ADMIN_EMAIL=admin@lab.local
FIRST_ADMIN_PASSWORD=ChangeMe123!
```

Log in, then go to **Settings → Change Password** immediately.

### Updating the VM

```bash
ssh user@10.4.89.178
cd ~/Cyber-Sentinel
git pull origin Automated-Pentesting
docker compose up -d --build
```

MongoDB and Redis data volumes are preserved across rebuilds.

---

## Configuration

Copy `.env.example` to `.env` and set at minimum:

```env
# First-boot admin account (used only on a fresh database)
FIRST_ADMIN_USERNAME=admin
FIRST_ADMIN_EMAIL=admin@lab.local
FIRST_ADMIN_PASSWORD=ChangeMe123!

# JWT secret — generate one:
# python3 -c "import secrets; print(secrets.token_urlsafe(64))"
JWT_SECRET=your-long-random-string

# MongoDB auth
MONGO_PASSWORD=a-strong-password

# Redis auth
REDIS_PASSWORD=another-strong-password

# ZAP API key (any random token)
ZAP_API_KEY=zaptoken123

# AI provider — set ONE of these
AI_PROVIDER=claude
CLAUDE_API_KEY=sk-ant-...     # console.anthropic.com
# GROQ_API_KEY=...            # console.groq.com — free tier
# GEMINI_API_KEY=...          # aistudio.google.com/apikey — free tier
```

| `AI_PROVIDER` | Key variable | Where to get it |
|---|---|---|
| `claude` | `CLAUDE_API_KEY` | console.anthropic.com |
| `groq` | `GROQ_API_KEY` | console.groq.com — free tier |
| `gemini` | `GEMINI_API_KEY` | aistudio.google.com/apikey — free tier |
| `openai` | `OPENAI_API_KEY` | platform.openai.com |

Full variable reference: [`.env.example`](.env.example)

---

## Day-to-Day Commands

```bash
# Check service health
docker compose ps
curl http://localhost:8000/api/health

# Tail logs
docker compose logs -f backend
docker compose logs -f celery
docker compose logs -f celery-soc
docker compose logs -f nginx

# Restart a single service
docker compose restart backend

# Stop all (keeps database volumes)
docker compose down

# Full reset — wipes all data
docker compose down -v && docker compose up -d --build
```

---

## Full Stack (Docker)

All services run inside Docker. No local Python or Node.js needed on the server.

```bash
docker compose up -d --build
```

| Service | Container | Exposed Port |
|---|---|---|
| nginx (reverse proxy) | `cyber-sentinel-nginx` | `8888` ← browse here |
| FastAPI backend | `cyber-sentinel-backend` | `8000` ← API + Swagger |
| Celery pentest worker | `cyber-sentinel-celery` | — |
| Celery SOC worker | `cyber-sentinel-celery-soc` | — |
| Celery Beat scheduler | `cyber-sentinel-celery-beat` | — |
| React frontend | `cyber-sentinel-frontend` | internal |
| MongoDB 7 | `cyber-sentinel-mongo` | `27017` |
| Redis 7 | `cyber-sentinel-redis` | `6379` |
| OWASP ZAP | `cyber-sentinel-zap` | internal |

> Wazuh is optional: `docker compose --profile wazuh up -d`

---

## Local Development (Windows)

```bash
# Terminal 1 — infrastructure
docker compose up -d

# Terminal 2 — backend (hot-reload)
cd backend
.\venv\Scripts\activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 3 — Celery worker
cd backend && .\venv\Scripts\activate
celery -A core.celery_app worker --loglevel=info --pool=solo -Q celery,soc

# Terminal 4 — frontend (hot-reload)
cd frontend && npm run dev
```

- Health check: `http://localhost:8000/api/health`
- Frontend: `http://localhost:5173`
- Swagger: `http://localhost:8000/docs`

> `--pool=solo` is required on Windows for Celery. Use `--pool=prefork` on Linux.

---

## Wazuh Integration

Add to Wazuh manager `ossec.conf`:

```xml
<integration>
  <name>custom-webhook</name>
  <hook_url>http://10.4.89.178:8000/api/alerts/webhook</hook_url>
  <level>3</level>
  <alert_format>json</alert_format>
</integration>
```

Set `WAZUH_WEBHOOK_TOKEN` in `.env` to authenticate webhook requests. Set `WAZUH_API_USER` and `WAZUH_API_PASSWORD` for the Celery SOC worker to poll Wazuh directly.

---

## API Reference

Interactive docs: `http://10.4.89.178:8000/docs`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Service health (MongoDB + Redis) |
| GET | `/api/version` | Version info |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login — returns JWT |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/scans/` | Submit a new scan |
| GET | `/api/scans/` | List scans (paginated) |
| GET | `/api/scans/{id}` | Scan details + findings |
| DELETE | `/api/scans/{id}` | Delete scan |
| POST | `/api/scans/{id}/cancel` | Cancel running scan |
| POST | `/api/scans/{id}/rerun` | Re-run a completed scan |
| POST | `/api/scans/{id}/verify` | Queue finding verification probes |
| GET | `/api/scans/{id}/report/html` | Download HTML report |
| GET | `/api/scans/{id}/report/pdf` | Download PDF report |
| GET | `/api/scans/{id}/diff/{baseline_id}` | Compare two scan results |
| POST | `/api/scans/scheduled` | Create a recurring scan schedule |
| GET | `/api/scans/scheduled` | List scheduled scans |
| PATCH | `/api/scans/scheduled/{id}/toggle` | Enable / disable a schedule |
| DELETE | `/api/scans/scheduled/{id}` | Delete a schedule |
| GET | `/api/alerts/` | Wazuh alert feed — returns `PaginatedAlertResponse` (items, total, page, size, pages) |
| POST | `/api/alerts/webhook` | Wazuh webhook ingest |
| GET | `/api/alerts/{id}` | Alert detail + AI triage |
| DELETE | `/api/alerts/{id}` | Delete alert (admin only) |
| GET | `/api/alerts/{id}/history` | Alert audit history |
| PATCH | `/api/alerts/batch/override` | Bulk verdict override |
| PATCH | `/api/auth/me/password` | Change current user's password |
| DELETE | `/api/auth/users/{id}` | Delete user + cascade (admin only) |
| GET | `/api/audit/stats` | Audit statistics breakdown (admin only) |
| GET | `/api/correlations/` | Pentest ↔ SOC correlations |
| GET | `/api/analytics/summary` | Platform analytics |
| GET | `/api/audit/` | Audit log (admin only) |
| WS | `/ws/scans` | Real-time scan progress |
| WS | `/ws/alerts` | Live SOC alert feed |

---

## Project Structure

```
Cyber-Sentinel/
├── docker-compose.yml          full stack definition
├── .env.example                environment variable template
├── setup-vm.sh                 alternative systemd-based VM provisioner
├── backend/
│   ├── main.py                 FastAPI entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── core/                   config, database, auth, WebSocket, Celery app
│   ├── domains/
│   │   ├── auth/               login, register, JWT, password reset
│   │   ├── pentesting/         scan engine, tool runners, tasks, reports, scheduler
│   │   │   └── tools/
│   │   │       └── verifier.py finding verification probes
│   │   └── soc/                Wazuh alerts, AI triage, MITRE, correlation
│   └── ai/                     multi-provider LLM (Claude/Groq/Gemini/OpenAI)
├── frontend/
│   └── src/
│       ├── pages/              scan list, scan detail, SOC dashboard, analytics
│       ├── components/         reusable UI
│       ├── services/           API call layer
│       └── types/              TypeScript interfaces
└── nginx/
    └── nginx.conf              reverse proxy config
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Scans never start | Check `docker compose logs celery` — worker must be running |
| `AI analysis disabled` | Set `AI_PROVIDER` + matching API key in `.env`, restart backend |
| Nuclei finds nothing | Run `nuclei -update-templates` inside the celery container |
| MongoDB connection failed | Run `docker compose up -d mongo` first |
| `ModuleNotFoundError` | Activate venv: `.\venv\Scripts\activate` |
| Unicode errors on Windows | `$env:PYTHONIOENCODING = "utf-8"` before uvicorn |
| Frontend can't reach API | Add your IP to `CORS_EXTRA_ORIGINS` in `.env` |
| Sessions lost on restart | Set a permanent `JWT_SECRET` (auto-generated key changes on restart) |
| Services won't start | Check `.env` exists — `cp .env.example .env` then fill in values |

---

## Security

- All scanning is for **authorized targets only**. Private IP scanning is disabled by default (`ALLOW_PRIVATE_TARGETS=false`).
- JWT authentication required on all API endpoints.
- Rate limiting on all public endpoints.
- Passwords hashed with bcrypt (cost 12). All secrets via environment variables — never hardcoded.
- CORS locked to explicit origins in `CORS_EXTRA_ORIGINS`.

---

## Version History

| Version | Changes |
|---|---|
| **v1.2.0** | Alert count pagination fix — `GET /alerts/` now returns `PaginatedAlertResponse` envelope with real database total; TRIAGE_FAILED visibility fix; UNANALYSED spelling fix; codebase-wide ruff (UP045/B904/B905/B007/S*/N806) + ESLint clean |
| v1.1.0 | Security hardening & missing API endpoints — password change, bulk alert override, alert delete/history, cascade user delete, audit stats breakdown, nginx security headers, SOC dedup lock fix, scheduled scan race condition fix, frontend API path bugs fixed |
| v1.0.6 | Scan scheduling (hourly/daily/weekly/monthly), finding verification probes, setup-vm.sh |
| v1.0.5 | Scan accuracy fixes, PDF correlation section, AI coverage matrix, risk score formula |
| v1.0.4 | PDF export rewrite — white design, paginated running header |
| v1.0.3 | Analytics PDF export module |
| v1.0.2 | SOC v1.0.2 compatibility |

---

## Prerequisites

**VM / Production:**
- Docker Engine 24+
- Docker Compose v2
- 4 GB RAM minimum (ZAP uses up to 1.5 GB alone)

**Local development (Windows):**
- Python 3.11+
- Node.js 20+
- Docker Desktop (MongoDB + Redis)

---

## License

MIT — ITS Smart City and Cybersecurity Lab, SMU, 2026
