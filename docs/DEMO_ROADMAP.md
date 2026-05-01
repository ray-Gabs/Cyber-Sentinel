# Cyber Sentinel — Demo Roadmap

> How to present the full platform end-to-end in ~20–30 minutes.

---

## Pre-Demo Checklist (do this before guests arrive)

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Backend + Celery (two separate terminals)
cd backend && .venv\Scripts\activate
uvicorn main:app --reload --port 8000

celery -A core.celery_app worker --loglevel=info --pool=solo

# 3. Frontend
cd frontend && npm run dev
```

Verify: `http://localhost:8000/api/health` → `{"status":"ok"}`

---

## Accounts to Use

| Account | Role | Purpose |
|---|---|---|
| `admin` | Admin | Shows full platform view, all users' data |
| `demo` (seeded) | Analyst | Shows single-user SOC workflow |

---

## Demo Flow

### 1. Login & Landing (2 min)
- Open `http://localhost:5173`
- Show the landing page
- Log in as **demo account**
- Walk through the main Dashboard — SOC section at top, Pentest below

---

### 2. SOC — Projects (3 min)
- Navigate to **Projects** (`/projects`)
- Show the 2 seeded projects: **Juice Shop** and **DVWA**
- Explain: each project = a monitored target + Wazuh agent deployment
- Show the **"Deploy Agent"** button — downloads a pre-configured `docker-compose.yml`
- If an agent is connected (green badge), click **"View Alerts"** → filtered alert feed for that project

> **Note**: Without a live Wazuh agent, the project cards show "unknown" agent status.
> This is expected in demo mode — the platform is fully functional, just waiting for data.

---

### 3. SOC Dashboard (3 min)
- Navigate to **SOC Dashboard** (`/soc/dashboard`)
- Show: summary stats (total agents, active agents, alerts today, critical unread)
- Show: per-project cards with agent health
- Show: recent alerts table (if any alerts have been ingested)
- Explain the real-time refresh via WebSocket

> If Wazuh is not running: project cards will show connectivity warnings — this is correct
> behavior. In a live lab environment with Wazuh running, these cards turn green.

---

### 4. Alert Feed (3 min)
- Navigate to **Alerts** (`/alerts`)
- Show the alert list with severity badges and AI verdicts
- Click an alert → Alert Detail page
  - Rule level + MITRE tactics/techniques
  - AI triage verdict (critical / high / medium / low / FALSE_POSITIVE)
  - AI reasoning and recommended action
  - Manual analyst override button
- Filter by agent name using the dropdown

---

### 5. MITRE ATT&CK Navigator (2 min)
- Navigate to **MITRE** (`/mitre`)
- Show the tactic/technique heatmap
- Explain: populated automatically from alert MITRE tags
- Higher hit count → darker red cell
- Empty heatmap is correct when no alerts have been ingested yet

---

### 6. Detection Rules (2 min)
- Navigate to **Detection Rules** (`/detection-rules`)
- Show existing rules (system defaults seeded on startup)
- Walk through creating a custom rule: name, pattern, severity
- Admin can deploy rules to Wazuh from this page

---

### 7. Automated Pentesting (5 min)
- Navigate to **New Scan** (`/scans/new`)
- Enter target: `http://testphp.vulnweb.com` (public safe target) or your lab's Juice Shop URL
- Select scan type: **Quick** (fastest for demo)
- Click **Start Scan**
- Watch the GlowStepper pipeline animate: Recon → Scan → Analysis → Report
- Navigate to the scan result page once complete:
  - Risk score gauge
  - Findings by severity (critical / high / medium / low)
  - OWASP category breakdown
  - AI-generated executive summary and remediation narrative
  - CVE enrichment with EPSS scores

> AI analysis (final step) uses Groq/Claude. If rate-limited, findings are still complete —
> the AI summary is the only part that may be skipped.

---

### 8. Scan History & Correlation (2 min)
- Navigate to **Scans** (`/scans`) — show scan history list
- Navigate to **Correlations** (`/correlations`) — show how pentest findings map to SOC alerts
- Example correlation: a pentest finds SQLi on `/login` → SOC alerts show injection attempts on the same agent

---

### 9. Admin View (2 min — switch to admin account)
- Log out → log in as admin
- Navigate to **Admin** (`/admin`) — user management, role promotion
- Navigate to **SOC Dashboard** — now shows all users' projects
- Navigate to **Audit Log** (`/audit`) — every action logged with user, timestamp, resource

---

### 10. Analytics (2 min)
- Navigate to **Analytics** (`/analytics`)
- Show: alerts over time, severity distribution, top attacking agents
- Show: pentest findings trend across scans

---

## Key Talking Points

**Architecture**:
- FastAPI async backend + Celery for long-running scans
- MongoDB for all data; Redis for task queue and real-time WebSocket relay
- Multi-provider AI (Claude / Groq / Gemini / OpenAI) with automatic fallback
- Wazuh integration via webhook — each user gets a personal token for tenant isolation

**Security design**:
- Role-based access (admin / analyst / viewer)
- Every user's alerts and projects are tenant-isolated
- JWT auth with refresh rotation
- Audit log on all sensitive actions

**What's live today**:
- Full pentest pipeline: recon → DAST → AI report
- SOC alert ingestion, triage, and dashboard
- MITRE ATT&CK tagging
- Custom detection rules
- Pentest ↔ SOC alert correlation

**What requires a live lab**:
- Wazuh agent → real alerts flowing in
- Active agent status (green) in project cards
- MITRE heatmap populated with real data

---

## Troubleshooting During Demo

| Symptom | Fix |
|---|---|
| SOC Dashboard shows "Failed to load" | Backend not running — restart uvicorn |
| Wazuh health warnings in project cards | Expected — Wazuh manager not running in demo mode |
| Scan AI summary says "rate limit" | Groq free tier hit — findings are still complete, retry in ~1 min |
| Alert feed empty | No alerts ingested yet — use Wazuh forwarder or POST test webhook |
| MITRE heatmap empty | No alerts with MITRE tags yet — normal in demo mode |
