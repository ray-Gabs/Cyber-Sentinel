# Cyber Sentinel v1.0.1

**AI-Powered Web Application Security Assessment & SOC Platform**

Built for the Smart City and Cybersecurity Lab internship (ITS), Cyber Sentinel combines an automated penetration testing engine with a real-time Security Operations Center (SOC) powered by Wazuh SIEM and AI-driven analysis.

> **Live instance:** `http://10.4.89.178:5173/`
> API backend: `http://10.4.89.178:8000/`
> Interactive API docs: `http://10.4.89.178:8000/docs`

---

## Capabilities

### Module A — Automated Penetration Testing

Cyber Sentinel orchestrates a full-stack web vulnerability assessment pipeline through a single scan submission.

| Tool | What it does |
|------|-------------|
| **Fingerprinting** | Detects web server, framework, CMS, and technology stack |
| **Subdomain Enumeration** | Discovers subdomains via brute-force and DNS analysis |
| **Web Crawler** | Maps all reachable endpoints, forms, and parameters |
| **Directory Brute-Force** | Discovers hidden paths, admin panels, and exposed files |
| **Nmap** | Network port scanning, service version detection, OS fingerprinting |
| **Nuclei** | Template-based vulnerability scanning (3,000+ CVE, misconfiguration, and exposure checks) |
| **SSLyze** | TLS/SSL certificate analysis — weak ciphers, expired certs, HSTS, OCSP |
| **WhatWeb** | Web technology stack identification and version detection |
| **OWASP ZAP** | Full DAST (Dynamic Application Security Testing) — active + passive scanning |
| **SQL Injection** | Automated SQLi detection across discovered endpoints |
| **XSS** | Cross-site scripting detection (reflected, stored, DOM) |
| **IDOR** | Insecure Direct Object Reference detection |
| **SSRF** | Server-Side Request Forgery testing |
| **Open Redirect** | Redirect chain and open redirect validation |
| **Auth Checks** | Weak authentication, default credentials, session issues |
| **Misconfiguration** | Security header gaps, CORS issues, exposed debug endpoints |
| **Supply Chain** | Third-party dependency risk and CDN integrity checks |
| **Insecure Design** | Logical flaw and business logic vulnerability patterns |
| **Integrity Checks** | File integrity and code injection surface analysis |
| **Error Handling** | Verbose error pages, stack traces, and information leakage |

**Scan profiles:**
- `quick` — 9 core tools, critical/high severity only (~5–10 min)
- `standard` — 19 tools, critical/high/medium severity (~15–30 min)
- `full` — all 20 tools including ZAP active scan (~45–90 min)
- `custom` — user-selected tool subset

**AI analysis (post-scan):**
- Executive summary with overall risk score (0–10)
- Full narrative penetration test report in professional format
- Per-finding remediation guidance
- OWASP Top 10:2025 coverage matrix
- Attack chain analysis
- Strategic recommendations

**Report export:** PDF and HTML (download from the scan detail page)

**CVE enrichment:** Each finding is automatically matched against the NIST NVD database for CVE IDs and EPSS severity scores.

---

### Module B — SOC (Security Operations Center)

Real-time security monitoring powered by Wazuh SIEM with AI triage.

- Live Wazuh alert feed via webhook integration
- AI-powered alert triage — TRUE_POSITIVE vs FALSE_POSITIVE classification
- Threat intelligence enrichment (VirusTotal + AbuseIPDB — when keys are set)
- MITRE ATT&CK technique tagging
- Correlation engine — links SOC alerts back to pentest findings on the same target
- Severity heatmaps and timeline visualization

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11+, FastAPI (async), Celery 5, Redis 7 |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Framer Motion |
| Database | MongoDB 7 (via Docker) |
| AI | Multi-provider: Groq (Llama 3.3 70B), Claude, OpenAI, Google Gemini |
| Security Tools | Nmap, Nuclei, SSLyze, WhatWeb, OWASP ZAP |
| Real-time | WebSocket (scan progress + live alert feed) |
| Reports | WeasyPrint / xhtml2pdf (PDF), Jinja2 (HTML) |
| Auth | JWT (HS256), bcrypt password hashing |
| Infra | Docker Compose (MongoDB + Redis) |

---

## Prerequisites

**Required:**
1. **Python 3.11+** — [python.org/downloads](https://www.python.org/downloads/)
2. **Node.js 18+** — [nodejs.org](https://nodejs.org/)
3. **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/)
4. **Git** — [git-scm.com](https://git-scm.com/downloads)

**Optional (for actual scanning — scans still run without these, tools are skipped gracefully):**
- **Nmap** — [nmap.org/download](https://nmap.org/download)
- **Nuclei** — `go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest` then `nuclei -update-templates`
- **Go 1.21+** — required to install Nuclei via the above command

---

## Quick Start

### 1. Clone

```bash
git clone https://github.com/ray-Gabs/Cyber-Sentinel.git
cd Cyber-Sentinel
```

### 2. Configure `.env`

```bash
cp .env.example .env
```

Open `.env` and set at minimum:

```env
JWT_SECRET=any-random-string-here

# Pick ONE AI provider and set its key:
AI_PROVIDER=groq
GROQ_API_KEY=your-groq-api-key       # Free at console.groq.com

# Uncomment the right package in backend/requirements.txt to match your AI_PROVIDER
```

Available AI providers and their keys:

| `AI_PROVIDER` | Environment variable | Where to get a key |
|--------------|---------------------|-------------------|
| `groq` | `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) — free tier |
| `gemini` | `GEMINI_API_KEY` | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — free tier |
| `claude` | `CLAUDE_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `openai` | `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) |

> **Important:** After picking a provider, uncomment the matching line in `backend/requirements.txt` before running `pip install`. For example, to use Gemini, uncomment `google-generativeai>=0.8.*`.

### 3. Start infrastructure

```bash
docker compose up -d
```

Starts MongoDB on `localhost:27017` and Redis on `localhost:6379`.

### 4. Backend setup

```bash
cd backend

# Create and activate virtual environment
python -m venv venv

# Windows (PowerShell):
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 5. Run the backend

```bash
# From backend/ with venv active
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check: `http://localhost:8000/api/health` → `{"status":"ok","version":"1.0.1"}`

> Use `--host 0.0.0.0` to make the API reachable from other machines on the network.

### 6. Run the Celery worker

Celery executes all background scan tasks. Without it, scans won't run.

```bash
# New terminal, from backend/ with venv active
celery -A core.celery_app worker --loglevel=info --pool=solo
```

> `--pool=solo` is required on Windows. On Linux/Mac you can omit it.

### 7. Run the frontend

```bash
# New terminal, from the repo root
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## VM Deployment (How the hosted instance is set up)

This documents exactly how the platform runs at `http://10.4.89.178:5173/`.

### What you need on the VM

- Ubuntu 22.04 (or any Debian-based Linux)
- Python 3.11+, Node.js 18+, Docker, Git
- Go 1.21+ (only if you want Nuclei)

### Step 1 — Clone and configure

```bash
git clone https://github.com/ray-Gabs/Cyber-Sentinel.git
cd Cyber-Sentinel
cp .env.example .env
nano .env   # Fill in JWT_SECRET and your AI provider key
```

### Step 2 — Start infrastructure

```bash
docker compose up -d
```

### Step 3 — Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run (bind to 0.0.0.0 so it's reachable from the network, not just localhost)
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Step 4 — Celery worker (required for scans)

```bash
# New terminal
cd Cyber-Sentinel/backend
source venv/bin/activate
celery -A core.celery_app worker --loglevel=info
# On Linux you can omit --pool=solo (that flag is only needed on Windows)
```

### Step 5 — Frontend

```bash
# New terminal
cd Cyber-Sentinel/frontend
npm install
npm run dev
# Vite binds to 0.0.0.0 (all interfaces) by default in this config,
# so it's immediately reachable at http://<VM-IP>:5173
```

### Step 6 — Allow ports through the firewall (if needed)

```bash
sudo ufw allow 5173/tcp   # Vite frontend
sudo ufw allow 8000/tcp   # FastAPI backend
```

### `.env` additions for network access

```env
# Replace with your VM's actual IP
FRONTEND_URL=http://10.4.89.178:5173
CORS_EXTRA_ORIGINS=http://10.4.89.178:5173
```

### Running as a persistent background service (optional)

To keep the services alive after you close the terminal, use `tmux` or `screen`:

```bash
# Start a named session
tmux new -s cyber-sentinel

# Then run your services inside the tmux session.
# Detach with Ctrl+B, D  — they keep running.
# Reattach later with:
tmux attach -t cyber-sentinel
```

Or create systemd unit files for production-style management (see systemd section below).

---

## Network / Live Instance

| Service | URL |
|---------|-----|
| **Frontend** | `http://10.4.89.178:5173/` |
| **Backend API** | `http://10.4.89.178:8000/` |
| **Swagger Docs** | `http://10.4.89.178:8000/docs` |
| **Health Check** | `http://10.4.89.178:8000/api/health` |

---

## HTTPS

> `npm run dev -- --https` was broken in Vite 6 because Vite no longer ships a built-in certificate generator. The project now uses the official `@vitejs/plugin-basic-ssl` plugin instead.

### Option A — Quick HTTPS with self-signed cert (already configured)

The SSL plugin is already installed and wired in `vite.config.ts`. Enable it with an env flag:

```bash
# Linux / Mac / Git Bash
VITE_HTTPS=true npm run dev
```

```powershell
# Windows PowerShell
$env:VITE_HTTPS="true"; npm run dev
```

The browser will show a certificate warning — click **Advanced → Proceed** to accept the self-signed cert. This is normal for self-signed certs and safe on a private network.

> The app will be available at `https://10.4.89.178:5173/` (note: `https`).

### Option B — NGINX reverse proxy (recommended for shared / permanent lab use)

NGINX handles HTTPS termination so your browser trusts the cert, and you get clean URLs on port 443.

**Install NGINX:**
```bash
sudo apt install -y nginx openssl
```

**Generate a self-signed certificate:**
```bash
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/cyber-sentinel.key \
  -out /etc/nginx/ssl/cyber-sentinel.crt \
  -subj "/CN=10.4.89.178"
```

**Create the NGINX config** at `/etc/nginx/sites-available/cyber-sentinel`:

```nginx
server {
    listen 80;
    server_name 10.4.89.178;
    # Redirect plain HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name 10.4.89.178;

    ssl_certificate     /etc/nginx/ssl/cyber-sentinel.crt;
    ssl_certificate_key /etc/nginx/ssl/cyber-sentinel.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Frontend (Vite dev server)
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket (real-time scan updates + alert feed)
    location /ws/ {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }
}
```

**Enable and start:**
```bash
sudo ln -s /etc/nginx/sites-available/cyber-sentinel /etc/nginx/sites-enabled/
sudo nginx -t          # Test config — must say "ok"
sudo systemctl reload nginx
sudo ufw allow 'Nginx Full'
```

The platform is now accessible at `https://10.4.89.178/` (port 443, no port number needed).

Update `.env` to match:
```env
FRONTEND_URL=https://10.4.89.178
CORS_EXTRA_ORIGINS=https://10.4.89.178
```

> Self-signed certificates will still show a browser warning. To eliminate it, you need a domain name + Let's Encrypt (`certbot`). For a private IP-only lab, self-signed is the correct approach.

---

## Systemd Services (keep running after reboot)

If you want the services to start automatically when the VM reboots, create systemd unit files.

**Backend** — `/etc/systemd/system/cyber-sentinel-backend.service`:
```ini
[Unit]
Description=Cyber Sentinel Backend (FastAPI)
After=network.target docker.service
Requires=docker.service

[Service]
User=YOUR_USERNAME
WorkingDirectory=/path/to/Cyber-Sentinel/backend
Environment="PATH=/path/to/Cyber-Sentinel/backend/venv/bin"
ExecStart=/path/to/Cyber-Sentinel/backend/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

**Celery worker** — `/etc/systemd/system/cyber-sentinel-celery.service`:
```ini
[Unit]
Description=Cyber Sentinel Celery Worker
After=cyber-sentinel-backend.service

[Service]
User=YOUR_USERNAME
WorkingDirectory=/path/to/Cyber-Sentinel/backend
Environment="PATH=/path/to/Cyber-Sentinel/backend/venv/bin"
ExecStart=/path/to/Cyber-Sentinel/backend/venv/bin/celery -A core.celery_app worker --loglevel=info
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable both:
```bash
sudo systemctl daemon-reload
sudo systemctl enable cyber-sentinel-backend cyber-sentinel-celery
sudo systemctl start cyber-sentinel-backend cyber-sentinel-celery
sudo systemctl status cyber-sentinel-backend  # check they're running
```

---

## Project Structure

```
Cyber-Sentinel/
├── VERSION                         # Current version string (1.0.1)
├── .env                            # Environment variables — never commit
├── .env.example                    # Template for .env
├── docker-compose.yml              # MongoDB + Redis containers
├── backend/
│   ├── main.py                     # FastAPI entry point, health + version endpoints
│   ├── requirements.txt            # Python dependencies
│   ├── core/
│   │   ├── config.py               # All settings (loaded from .env via pydantic-settings)
│   │   ├── database.py             # MongoDB connection (Motor + Beanie)
│   │   ├── celery_app.py           # Celery configuration
│   │   ├── websocket.py            # WebSocket connection manager
│   │   ├── email_service.py        # Async SMTP email
│   │   └── rate_limit.py           # slowapi rate limiting
│   ├── domains/
│   │   ├── auth/                   # Registration, login, JWT, password reset
│   │   ├── pentesting/
│   │   │   ├── models.py           # Scan, Finding, AuthConfig MongoDB models
│   │   │   ├── schemas.py          # Pydantic request/response schemas
│   │   │   ├── service.py          # Scan CRUD operations
│   │   │   ├── router.py           # REST API endpoints
│   │   │   ├── tasks.py            # Celery scan orchestration (full pipeline)
│   │   │   ├── report_service.py   # PDF + HTML report generation
│   │   │   ├── cve_service.py      # NIST NVD CVE + FIRST EPSS enrichment
│   │   │   ├── owasp.py            # OWASP Top 10:2025 classification
│   │   │   └── tools/              # Individual scanner modules (20 tools)
│   │   ├── soc/                    # Wazuh alerts, AI triage, MITRE ATT&CK
│   │   ├── correlation/            # Pentest ↔ SOC alert correlation engine
│   │   └── notifications/          # In-app and email notifications
│   ├── ai/
│   │   ├── providers.py            # Multi-provider LLM abstraction
│   │   ├── llm_service.py          # Scan summary, narrative report, alert triage
│   │   ├── gemini_service.py       # Legacy Gemini service (kept for reference)
│   │   ├── cache.py                # Redis-backed AI response cache
│   │   └── prompts/                # Prompt templates (.txt files)
│   └── templates/                  # Jinja2 HTML report templates
└── frontend/
    ├── src/
    │   ├── main.tsx                # React entry point
    │   ├── App.tsx                 # Route definitions
    │   ├── pages/                  # Dashboard, Scans, Alerts, Analytics, Settings
    │   ├── components/             # Reusable UI components
    │   ├── services/               # API client functions
    │   ├── hooks/                  # useAuth, useWebSocket, custom hooks
    │   ├── types/                  # TypeScript interfaces
    │   └── lib/                    # Utilities and constants
    └── index.html
```

---

## API Reference

All endpoints are documented interactively at `/docs` (Swagger UI).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Service health check (MongoDB + Redis status) |
| `GET` | `/api/version` | Current version + git commit hash |
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login, returns JWT |
| `POST` | `/api/scans` | Submit a new scan |
| `GET` | `/api/scans` | List all scans for the authenticated user |
| `GET` | `/api/scans/{id}` | Scan details + findings |
| `GET` | `/api/scans/{id}/report` | Download PDF report |
| `DELETE` | `/api/scans/{id}` | Delete a scan |
| `GET` | `/api/scans/compare` | Diff two scans (remediation tracking) |
| `GET` | `/api/alerts` | List Wazuh alerts |
| `GET` | `/api/correlations` | Pentest ↔ alert correlations |
| `GET` | `/api/notifications` | In-app notifications |
| `WS` | `/ws/scans` | Real-time scan progress |
| `WS` | `/ws/alerts` | Live Wazuh alert feed |

---

## Commands Cheat Sheet

```bash
# === Infrastructure ===
docker compose up -d              # Start MongoDB + Redis
docker compose down               # Stop
docker ps                         # Verify containers are running

# === Backend ===
cd backend && .\venv\Scripts\activate   # Windows
cd backend && source venv/bin/activate  # Linux/Mac
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# === Celery worker (required for scans) ===
celery -A core.celery_app worker --loglevel=info --pool=solo

# === Celery beat (required for Wazuh alert polling) ===
celery -A core.celery_app beat --loglevel=info

# === Frontend ===
cd frontend && npm install && npm run dev
npm run build                     # Production build

# === Nuclei templates (update when scans find nothing) ===
nuclei -update-templates

# === API health check ===
curl http://localhost:8000/api/health
```

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Scans never start | Celery worker not running | Start the Celery worker (step 6) |
| `AI analysis disabled` | No AI provider configured | Set `AI_PROVIDER` + matching `*_API_KEY` in `.env`. Uncomment the matching SDK in `requirements.txt` and `pip install -r requirements.txt` |
| `AI analysis unavailable (...)` | API key invalid, quota exceeded, or package not installed | Check the error detail in the message. Verify your key at the provider's console. Check Celery worker logs for full error |
| Nuclei finds nothing / shows as failed | Templates out of date or binary not found | Run `nuclei -update-templates`. Verify `nuclei` is on PATH or in `~/go/bin/` |
| `port already in use` | Previous process still running | Windows: `Get-NetTCPConnection -LocalPort 8000 \| Stop-Process` |
| `ModuleNotFoundError` | venv not activated | `.\venv\Scripts\activate` (Windows) |
| `ECONNREFUSED` on MongoDB | Docker not running | `docker compose up -d` |
| Frontend can't reach API | CORS not configured | Add `CORS_EXTRA_ORIGINS=http://your-ip:5173` to `.env` |
| Unicode errors (Windows) | Python encoding | `$env:PYTHONIOENCODING = "utf-8"` before starting uvicorn |
| Celery tasks not executing | Redis unreachable | Check `docker ps` — Redis container must be running |

---

## Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | (auto-generated) | **Set this** — sessions don't persist across restarts without it |
| `AI_PROVIDER` | `groq` | Active AI provider: `groq` / `gemini` / `claude` / `openai` |
| `GROQ_API_KEY` | — | Groq API key (free at console.groq.com) |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `CLAUDE_API_KEY` | — | Anthropic Claude API key |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection string |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `FRONTEND_URL` | `http://localhost:5173` | Used in CORS + email links |
| `CORS_EXTRA_ORIGINS` | — | Comma-separated additional CORS origins |
| `ALLOW_PRIVATE_TARGETS` | `false` | Set `true` in lab environments to scan private IPs |
| `NVD_API_KEY` | — | NIST NVD key (optional — increases CVE lookup rate limit) |
| `VIRUSTOTAL_API_KEY` | — | Threat intel enrichment |
| `ABUSEIPDB_API_KEY` | — | Threat intel enrichment |
| `ZAP_API_URL` | `http://localhost:8080` | OWASP ZAP API endpoint |
| `ZAP_API_KEY` | — | ZAP API key |
| `WAZUH_API_URL` | `https://localhost:55000` | Wazuh REST API |
| `WAZUH_API_USER` | `wazuh-wui` | Wazuh API username |
| `WAZUH_API_PASSWORD` | — | Wazuh API password |

---

## Security

- All scanning is for **authorized targets only**. Private IP scanning is disabled by default (`ALLOW_PRIVATE_TARGETS=false`).
- JWT authentication required on all API endpoints.
- Rate limiting on all public endpoints (configurable via `.env`).
- No credentials are ever stored in plaintext — bcrypt for passwords, env vars for API keys.
- CORS is locked to explicit origins — wildcards are never permitted.

---

## License

Internal project — Smart City and Cybersecurity Lab, ITS internship.
