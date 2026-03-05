# Cyber Sentinel

AI-Powered Web App Security Assessment & SOC Platform.

Two modules in one repo:
- **Automated Pentesting** — scan websites for vulnerabilities using Nmap, Nuclei, SSLyze, WhatWeb, ZAP
- **SOC (Wazuh)** — monitor security alerts from Wazuh SIEM with AI triage

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11+, FastAPI, Celery |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Database | MongoDB 7 (via Docker) |
| Task Queue | Redis 7 + Celery |
| AI | Google Gemini 2.0 Flash |
| Security Tools | Nmap, Nuclei, SSLyze, WhatWeb, OWASP ZAP |

---

## Prerequisites

You need these installed on your machine:

1. **Python 3.11+** — [python.org/downloads](https://www.python.org/downloads/)
2. **Node.js 18+** — [nodejs.org](https://nodejs.org/) (comes with npm)
3. **Docker Desktop** — [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) (for MongoDB & Redis)
4. **Git** — [git-scm.com](https://git-scm.com/downloads)

Optional (only for actual scanning):
- **Nmap** — [nmap.org/download](https://nmap.org/download)
- **Nuclei** — [github.com/projectdiscovery/nuclei](https://github.com/projectdiscovery/nuclei/releases)

---

## Quick Start (step by step)

### 1. Clone the repo

```bash
git clone https://github.com/ray-Gabs/Cyber-Sentinel.git
cd Cyber-Sentinel
```

### 2. Create the `.env` file

```bash
# Copy the example and edit it
cp .env.example .env
```

Open `.env` in a text editor and fill in at minimum:
- `JWT_SECRET` — any random string (e.g. `mysecretkey123456`)
- `GEMINI_API_KEY` — get one free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

The rest of the defaults work as-is for local development.

### 3. Start MongoDB & Redis (Docker)

Make sure Docker Desktop is open, then:

```bash
docker compose up -d
```

This starts:
- MongoDB on `localhost:27017`
- Redis on `localhost:6379`

Verify they're running:
```bash
docker ps
```
You should see `cyber-sentinel-mongo` and `cyber-sentinel-redis`.

### 4. Set up the Backend

```bash
cd backend

# Create a virtual environment
python -m venv venv

# Activate it
# Windows (PowerShell):
.\venv\Scripts\activate
# Windows (CMD):
venv\Scripts\activate.bat
# Linux/Mac:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 5. Run the Backend

```bash
# Make sure you're in backend/ with venv activated
uvicorn main:app --reload --port 8000
```

Test it works:
- Open browser: [http://localhost:8000/api/health](http://localhost:8000/api/health)
- Should show: `{"status":"ok","service":"Cyber Sentinel","version":"1.0.0"}`
- API docs: [http://localhost:8000/docs](http://localhost:8000/docs) (Swagger UI)

### 6. Set up the Frontend

Open a **new terminal** (keep the backend running):

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

Open browser: [http://localhost:5173](http://localhost:5173)

### 7. (Optional) Start Celery Worker

Celery runs the background scan tasks. Open another terminal:

```bash
cd backend

# Activate venv
# Windows:
.\venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Start the worker
celery -A core.celery_app worker --loglevel=info --pool=solo
```

> On Windows, use `--pool=solo` because Celery's default prefork pool doesn't work on Windows.

To also run Wazuh alert polling on a schedule:
```bash
celery -A core.celery_app beat --loglevel=info
```

---

## What You'll Have Running

| Service | URL | Purpose |
|---------|-----|---------|
| Frontend | http://localhost:5173 | React web app |
| Backend API | http://localhost:8000 | FastAPI REST API |
| Swagger Docs | http://localhost:8000/docs | Interactive API docs |
| MongoDB | localhost:27017 | Database |
| Redis | localhost:6379 | Task queue |

---

## Project Structure

```
Cyber-Sentinel/
├── .env                    # Your environment variables (don't commit!)
├── .env.example            # Template for .env
├── docker-compose.yml      # MongoDB + Redis containers
├── backend/
│   ├── main.py             # FastAPI entry point
│   ├── requirements.txt    # Python dependencies
│   ├── core/               # Config, DB, auth, WebSocket, Celery
│   ├── domains/
│   │   ├── auth/           # Login, register, JWT
│   │   ├── pentesting/     # Scan CRUD, tools, background tasks
│   │   └── soc/            # Wazuh alerts, AI triage
│   └── ai/                 # Gemini service, prompts, cache
├── frontend/
│   ├── package.json        # Node dependencies
│   ├── src/
│   │   ├── main.tsx        # React entry point
│   │   ├── App.tsx         # Routing
│   │   ├── pages/          # Page components
│   │   ├── components/     # Reusable UI components
│   │   ├── services/       # API call functions
│   │   ├── hooks/          # React hooks (auth, websocket)
│   │   ├── types/          # TypeScript interfaces
│   │   └── lib/            # Utilities, constants
│   └── index.html
```

---

## Common Commands Cheat Sheet

```bash
# === Docker ===
docker compose up -d          # Start MongoDB + Redis
docker compose down           # Stop MongoDB + Redis
docker ps                     # Check running containers

# === Backend ===
cd backend
.\venv\Scripts\activate       # Activate venv (Windows PowerShell)
source venv/bin/activate      # Activate venv (Linux/Mac)
pip install -r requirements.txt  # Install/update deps
uvicorn main:app --reload --port 8000  # Run backend

# === Frontend ===
cd frontend
npm install                   # Install deps
npm run dev                   # Run dev server (hot reload)
npm run build                 # Build for production

# === Celery (background tasks) ===
cd backend && .\venv\Scripts\activate
celery -A core.celery_app worker --loglevel=info --pool=solo
celery -A core.celery_app beat --loglevel=info

# === Test API manually ===
# PowerShell:
Invoke-RestMethod -Uri "http://localhost:8000/api/health"
# curl (Linux/Mac/Git Bash):
curl http://localhost:8000/api/health
```

---

## Stopping Everything

```bash
# 1. Press Ctrl+C in each terminal (frontend, backend, celery)
# 2. Stop Docker containers:
docker compose down
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `port already in use` | Kill the process: `Get-NetTCPConnection -LocalPort 8000` then `Stop-Process -Id <PID>` |
| `ModuleNotFoundError` | Make sure venv is activated: `.\venv\Scripts\activate` |
| `docker: command not found` | Install Docker Desktop and make sure it's running |
| `ECONNREFUSED` on MongoDB | Run `docker compose up -d` first |
| Frontend can't reach backend | Backend must be on port 8000, frontend on 5173 |
| Unicode errors on Windows | Set `$env:PYTHONIOENCODING = "utf-8"` before running uvicorn |
