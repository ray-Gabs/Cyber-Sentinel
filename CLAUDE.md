# CLAUDE.md — Cyber Sentinel (Local)
> Project-specific context for Claude Code.
> Read alongside ~/.claude/CLAUDE.md (global config).
> Last updated: March 2026

---

## 🧭 Project Overview

**Cyber Sentinel** — AI-Powered Web App Security Assessment & SOC Platform
Built as solo intern covering both Intern A (Pentest Engine) and Intern B (Wazuh SOC).
Internship: Smart City and Cybersecurity Lab, ITS.

**Repo**: `github.com/ray-Gabs/Cyber-Sentinel`
**Active Branch**: `Automated-Pentesting--Branch`
**Local Path**: `D:/Dev/personal/Cyber Sentinel/Cyber-Sentinel/`

---

## 🛠️ Tech Stack (Actual — Not Planned)

| Layer | Tech | Notes |
|---|---|---|
| Backend | Python 3.11+, FastAPI | Entry: `backend/main.py` |
| Task Queue | Celery + Redis 7 | `--pool=solo` on Windows |
| Database | MongoDB 7 | Via Docker |
| Frontend | React 18 + TypeScript + Vite + Tailwind | Entry: `frontend/src/main.tsx` |
| AI | Google Gemini 2.0 Flash | `backend/ai/` — migrate to Claude API later |
| Containers | Docker Compose | MongoDB + Redis only (not full app yet) |
| Security Tools | Nmap, Nuclei, SSLyze, WhatWeb, OWASP ZAP | Optional install for actual scanning |

---

## 📁 Exact Project Structure

```
Cyber-Sentinel/
├── .env                        # Active env vars — NEVER commit
├── .env.example                # Template — safe to commit
├── docker-compose.yml          # MongoDB + Redis containers
├── setup-vm.sh                 # VM setup script
├── backend/
│   ├── main.py                 # FastAPI app entry point
│   ├── requirements.txt        # Python deps
│   ├── Dockerfile              # Backend container (not in compose yet)
│   ├── core/                   # Config, DB, auth utils, WebSocket, Celery app
│   ├── domains/
│   │   ├── auth/               # Login, register, JWT
│   │   ├── pentesting/         # Scan CRUD, tool runners, background tasks
│   │   └── soc/                # Wazuh alerts, AI triage
│   ├── ai/                     # Gemini service, prompts, response cache
│   └── templates/              # Jinja2 templates (likely report rendering)
└── frontend/
    ├── index.html
    ├── vite.config.ts
    ├── tailwind.config.js
    ├── tsconfig.json
    └── src/
        ├── main.tsx            # React entry
        ├── App.tsx             # Routing
        ├── pages/              # Page-level components
        ├── components/         # Reusable UI components
        ├── services/           # API call functions (axios/fetch wrappers)
        ├── hooks/              # Custom React hooks (auth, websocket)
        ├── types/              # TypeScript interfaces and types
        └── lib/                # Utilities, constants, helpers
```

---

## 🔌 Environment Variables (Structure Only)

```env
# Auth
JWT_SECRET=

# AI
GEMINI_API_KEY=          # aistudio.google.com/apikey — migrate to CLAUDE_API_KEY later

# Database (Docker defaults)
MONGO_URI=mongodb://localhost:27017
REDIS_URL=redis://localhost:6379

# Security Tools
# (API keys for NVD, VirusTotal, AbuseIPDB go here when integrated)
```

**Rule**: Never hardcode any of these. Always reference via `os.getenv()` in Python or `import.meta.env` in Vite.

---

## 🚀 Dev Startup Sequence

Always start in this order — order matters:

```bash
# 1. Start infrastructure (Docker)
docker compose up -d

# 2. Backend (Git Bash or PowerShell)
cd backend
.\venv\Scripts\activate          # Windows PowerShell
uvicorn main:app --reload --port 8000

# 3. Celery worker (new terminal)
cd backend && .\venv\Scripts\activate
celery -A core.celery_app worker --loglevel=info --pool=solo

# 4. Frontend (new terminal)
cd frontend && npm run dev
```

**Health check**: `http://localhost:8000/api/health` → `{"status":"ok"}`
**Swagger docs**: `http://localhost:8000/docs`
**Frontend**: `http://localhost:5173`

---

## ✅ What's Already Built

- [x] Project scaffolding and architecture
- [x] Docker Compose for MongoDB + Redis
- [x] FastAPI backend with domain structure
- [x] Auth domain (login, register, JWT)
- [x] Pentesting domain (scan CRUD, tool runners, background tasks via Celery)
- [x] SOC domain (Wazuh alerts, AI triage structure)
- [x] AI service layer (Gemini 2.0 Flash integration)
- [x] WebSocket support (real-time scan updates)
- [x] React + TypeScript + Vite + Tailwind frontend scaffolding
- [x] Frontend routing (App.tsx), pages, components, services, hooks, types structure
- [x] Jinja2 templates (report rendering)
- [x] `.env` and `.gitignore` properly configured

---

## 🔨 What's In Progress / Not Done Yet

- [ ] OWASP ZAP API full integration
- [ ] Nuclei automated scan pipeline
- [ ] SSLyze certificate analysis integration
- [ ] NIST NVD API → CVE mapping
- [ ] FIRST EPSS API → severity scoring
- [ ] LLM-generated narrative pentest report (Gemini → migrate to Claude API)
- [ ] PDF report export (WeasyPrint)
- [ ] HTML report export (Jinja2 — templates exist, wiring TBD)
- [ ] Authenticated scan support (session/cookie injection)
- [ ] Metasploit RPC integration (advanced)
- [ ] Wazuh server install + agent deployment (Intern B)
- [ ] Custom SIEM rules for web attack patterns
- [ ] React SOC dashboard (real-time alert feed, severity heatmaps)
- [ ] Correlation engine (Intern A findings ↔ Intern B alerts)
- [ ] VirusTotal + AbuseIPDB threat intel enrichment
- [ ] MITRE ATT&CK tagging
- [ ] Automated playbook / Active Response

---

## 🏗️ Architecture Principles for This Project

- **Domain-driven**: each feature lives in `domains/<domain>/` — don't mix concerns
- **Async everything**: FastAPI async endpoints, Celery for long-running scans
- **API-first**: frontend is a pure consumer of the REST API — no server-side rendering
- **Real-time**: WebSocket for live scan progress updates to frontend
- **Modular scanners**: each security tool (nmap, nuclei, zap) is its own module in `domains/pentesting/`
- **AI layer isolated**: all LLM calls go through `backend/ai/` — never call AI APIs directly from domains
- **Ethical scope**: all scanning capabilities are for authorized targets only — enforce this in API validation

---

## 🤖 AI Migration Plan

Currently using **Gemini 2.0 Flash**. Plan to migrate or add **Claude API** for:
- Pentest report narrative generation (better structured output)
- Wazuh alert triage (better reasoning)
- CVE explanation and remediation recommendations

When migrating: update `backend/ai/` service layer only — domains should not need changes.

---

## 📋 Scan Pipeline Flow (Intern A)

```
User submits target URL
        ↓
FastAPI endpoint validates + creates scan record in MongoDB
        ↓
Celery task dispatched (background)
        ↓
┌─────────────────────────────────┐
│  Parallel scanner modules:      │
│  - Nmap (network recon)         │
│  - WhatWeb (fingerprinting)     │
│  - SSLyze (SSL/TLS analysis)    │
│  - Nuclei (vuln templates)      │
│  - OWASP ZAP (DAST scanning)    │
└─────────────────────────────────┘
        ↓
Results aggregated → MongoDB
        ↓
CVE mapping (NIST NVD API)
        ↓
EPSS scoring (FIRST API)
        ↓
AI narrative generation (Gemini → Claude)
        ↓
Report rendered (PDF / HTML)
        ↓
WebSocket push → Frontend updates in real-time
```

---

## 📋 Alert Pipeline Flow (Intern B)

```
Wazuh agent detects event
        ↓
Wazuh webhook → FastAPI endpoint
        ↓
Alert stored in MongoDB
        ↓
Celery task: AI triage (severity + recommendation)
        ↓
Threat intel enrichment (VirusTotal / AbuseIPDB)
        ↓
MITRE ATT&CK classification
        ↓
WebSocket push → SOC dashboard updates
        ↓
Correlation check: does this match any Intern A pentest finding?
```

---

## ⚠️ Known Issues & Notes

- Celery on Windows requires `--pool=solo` — always use it
- Unicode errors on Windows: set `$env:PYTHONIOENCODING = "utf-8"` before uvicorn
- `token.txt` and `scan_id.txt` are in the parent folder (`/Cyber Sentinel/`) — not git tracked, keep it that way. Consider moving them to `.env` or deleting if stale
- Backend Dockerfile exists but app is not fully containerized yet — MongoDB/Redis only in Docker Compose for now
- `frontend/node_modules/` is large — never commit (already in `.gitignore`)

---

## 🧪 Testing Approach

- API endpoints: test via Swagger UI at `/docs` or `curl`
- Scanner modules: use safe targets only — `scanme.nmap.org` for Nmap, personal VMs for ZAP
- Auth: test register → login → JWT flow first before testing protected endpoints
- Celery tasks: check worker terminal for task logs + MongoDB for result storage

---

## 📌 Git Branch Strategy

```
main                          → stable, demo-ready
Automated-Pentesting--Branch  → active (Intern A features)
wazuh-soc-branch              → Intern B (create when starting)
```

Always branch from main for new features, merge back when stable.

---

## 🎯 Current Session Priorities

When starting a Claude Code session on this project, confirm which of these we're working on:

1. **Scanner integration** — wiring a new tool (ZAP, Nuclei, etc.) into the pipeline
2. **Frontend** — building/improving the React SOC dashboard or pentest UI
3. **AI layer** — improving report generation or alert triage prompts
4. **Report export** — PDF/HTML rendering with WeasyPrint/Jinja2
5. **Wazuh setup** — Intern B infrastructure and integration
6. **Bug fixing** — specific issue to resolve
7. **Refactor** — code quality improvement

## Commands
- `/cs-build <task>`  → build new features with smart agent routing
- `/cs-audit`        → full codebase review, fix by severity with my approval