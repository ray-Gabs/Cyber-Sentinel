# Cyber Sentinel

**AI-powered web application security assessment and SOC platform.**

Built at the ITS Smart City and Cybersecurity Lab (SMU internship), Cyber Sentinel combines an automated penetration testing pipeline with a real-time Security Operations Center powered by Wazuh SIEM and multi-provider AI analysis.

---

## Architecture

```
Browser
  └── Frontend  (React 18 / Vite, :5173)
        └── Backend API  (FastAPI, :8000)
              ├── MongoDB      (via Docker)
              ├── Redis + Celery  (background scan queue)
              └── Wazuh Manager   (:55000, alerts via webhook)
```

---

## Capabilities

### Pentest Engine

Orchestrates 20 scanner modules in parallel via Celery, then enriches findings with CVE/EPSS data and generates an AI narrative report.

| Scanner | Purpose |
|---------|---------|
| Nmap | Port scan, service version, OS fingerprint |
| Nuclei | 3,000+ CVE, misconfiguration, and exposure templates |
| OWASP ZAP | Full DAST — active + passive scanning |
| SSLyze | TLS/SSL analysis — weak ciphers, HSTS, OCSP |
| WhatWeb | Technology fingerprinting |
| Custom modules | SQLi, XSS, IDOR, SSRF, CORS, auth checks, and more |

**Scan profiles:** `quick` (~5–10 min) · `standard` (~15–30 min) · `full` (~45–90 min) · `custom`

**AI output:** Risk score · Executive summary · OWASP Top 10:2025 coverage · Per-finding remediation · PDF + HTML export

### SOC (Wazuh Integration)

- Live alert stream from Wazuh manager via webhook
- AI triage per alert: TRUE_POSITIVE / FALSE_POSITIVE + reasoning
- MITRE ATT&CK technique tagging
- Correlation engine: links SOC alerts back to pentest findings on the same target
- Per-project agent tenancy, custom detection rules

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI (async), Celery 5, Redis 7 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Database | MongoDB 7 (Docker) |
| AI | Groq · Claude · OpenAI · Gemini — auto-fallback |
| Security Tools | Nmap, Nuclei, SSLyze, WhatWeb, OWASP ZAP |
| Real-time | WebSocket (scan progress + alert feed) |
| Auth | JWT (HS256), bcrypt |
| Reports | WeasyPrint / xhtml2pdf (PDF), Jinja2 (HTML) |

---

## Quick Start

```bash
git clone https://github.com/ray-Gabs/Cyber-Sentinel.git
cd Cyber-Sentinel
cp .env.example .env   # set JWT_SECRET + one AI provider key
docker compose up -d   # start MongoDB + Redis
```

**Backend:**
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

**Celery worker** (required — runs all background scans):
```bash
# New terminal, from backend/ with venv active
celery -A core.celery_app worker --loglevel=info --pool=solo
# --pool=solo is required on Windows; omit on Linux/Mac
```

**Frontend:**
```bash
cd frontend && npm install && npm run dev
# → http://localhost:5173
```

Health check: `curl http://localhost:8000/api/health`

---

## Configuration

Copy `.env.example` to `.env` and set at minimum:

```env
JWT_SECRET=any-random-string-32-chars-minimum

# Set ONE AI provider and its key:
AI_PROVIDER=groq
GROQ_API_KEY=your-key   # Free tier at console.groq.com
```

| `AI_PROVIDER` | Environment variable | Where to get a key |
|--------------|---------------------|-------------------|
| `groq` | `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) — free tier |
| `gemini` | `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — free tier |
| `claude` | `CLAUDE_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `openai` | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) |

See `.env.example` for the full variable reference (Wazuh, ZAP, threat intel, etc.).

---

## Wazuh Integration

Add to Wazuh manager `ossec.conf`:

```xml
<integration>
  <name>custom-webhook</name>
  <hook_url>http://YOUR_SERVER_IP:8000/api/alerts/webhook</hook_url>
  <level>3</level>
  <alert_format>json</alert_format>
</integration>
```

Set `WAZUH_WEBHOOK_TOKEN` in `.env` and add `<api_key>YOUR_TOKEN</api_key>` to authenticate requests.

---

## API Reference

Interactive docs at `http://localhost:8000/docs` (Swagger UI).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health (MongoDB + Redis) |
| GET | `/api/version` | Version + git commit |
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login, returns JWT |
| POST | `/api/scans` | Submit a scan |
| GET | `/api/scans` | List scans |
| GET | `/api/scans/{id}` | Scan details + findings |
| GET | `/api/scans/{id}/report` | Download PDF report |
| DELETE | `/api/scans/{id}` | Delete scan |
| GET | `/api/scans/compare` | Diff two scans |
| GET | `/api/alerts` | Wazuh alert feed |
| GET | `/api/correlations` | Pentest ↔ alert correlations |
| WS | `/ws/scans` | Real-time scan progress |
| WS | `/ws/alerts` | Live alert feed |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Scans never start | Start the Celery worker |
| `AI analysis disabled` | Set `AI_PROVIDER` + matching API key in `.env` |
| Nuclei finds nothing | Run `nuclei -update-templates`; verify binary is on PATH |
| `ECONNREFUSED` on MongoDB | Run `docker compose up -d` |
| `ModuleNotFoundError` | Activate venv: `venv\Scripts\activate` |
| Unicode errors on Windows | `$env:PYTHONIOENCODING = "utf-8"` before uvicorn |
| Celery tasks not executing | Check `docker ps` — Redis must be running |
| Frontend can't reach API | Add `CORS_EXTRA_ORIGINS=http://your-ip:5173` to `.env` |

---

## Security

- All scanning is for **authorized targets only**. Private IP scanning is disabled by default (`ALLOW_PRIVATE_TARGETS=false`).
- JWT authentication required on all API endpoints.
- Rate limiting on all public endpoints.
- Passwords hashed with bcrypt; all secrets via environment variables.
- CORS locked to explicit origins — wildcards are never permitted.

---

## Prerequisites

- Python 3.11+
- Node.js 18+
- Docker Desktop (for MongoDB + Redis)
- Nmap, Nuclei, Go 1.21+ — optional; scans run gracefully without them

---

## License

MIT — ITS Smart City and Cybersecurity Lab, SMU, 2026
