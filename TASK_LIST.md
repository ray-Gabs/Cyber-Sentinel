# Cyber Sentinel — Master Task List
> Generated: 2026-04-16
> Source of truth: Internship Brief v3 + full codebase audit
> Two tracks: Intern A (Pentest Engine) · Intern B (Wazuh SOC)
> Admin role sees all users' data. Analyst role is scoped to owner_id.

---

## BUGS FIXED THIS SESSION

| # | Bug | Fix Applied |
|---|-----|-------------|
| 1 | 3 notification icons on admin (2 sidebar + 1 header) | Removed "Notifications" from `adminNavItems` in `Sidebar.tsx`. Header bell is now the sole notification entry point for all roles. |
| 2 | Duplicate user name card in sidebar | Removed username from sidebar role pill (`Sidebar.tsx` lines 240-260). Role label only. User card stays in Header top-right. |
| 3 | Correlation broken on analyst side | `correlationService.ts` was returning raw paginated object `{ items, total, skip, limit }` as if it were an array. Fixed to extract `.items ?? []`. |

---

## PHASE 1 — P0 BLOCKERS (Required to pass internship)

---

### TASK 1 — PDF/HTML Report Download
**Priority:** P0 — Week 8 mid-point demo requirement
**Files to create/edit:**
- `backend/domains/pentesting/report_renderer.py` (new)
- `backend/domains/pentesting/router.py` (add route)
- `frontend/src/pages/ScanDetail.tsx` (add download button)

**Backend implementation:**
```
1. Install WeasyPrint in requirements.txt: weasyprint>=60.0
2. Create report_renderer.py:
   - render_html(scan: Scan) -> str  — uses existing Jinja2 templates in backend/templates/
   - render_pdf(scan: Scan) -> bytes — calls WeasyPrint on the HTML output
3. Add to pentesting/router.py:
   GET /api/scans/{scan_id}/report
   Query params: ?format=pdf (default) | html
   - Verify ownership: scan.user_id == current_user.id or admin
   - Call render_pdf or render_html
   - For PDF: return StreamingResponse(BytesIO(pdf_bytes), media_type="application/pdf",
     headers={"Content-Disposition": f'attachment; filename="report-{scan_id}.pdf"'})
   - For HTML: return HTMLResponse(content=html_str)
```

**Frontend implementation:**
```
In ScanDetail.tsx, add a download button group near the top action bar:
- "Download PDF" button → GET /api/scans/{scan_id}/report?format=pdf
- "Download HTML" button → GET /api/scans/{scan_id}/report?format=html
- Use fetch with blob() to trigger browser download for PDF
- Open HTML in new tab for HTML format
- Show loading spinner on the button during request
- Show error toast if request fails (scan must be completed status)
- Disable buttons if scan.status !== "completed"
```

**Docker note:** WeasyPrint requires system fonts. Add to backend Dockerfile:
```dockerfile
RUN apt-get update && apt-get install -y \
  libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf2.0-0 \
  libffi-dev libjpeg-dev libopenjp2-7 && rm -rf /var/lib/apt/lists/*
```

---

### TASK 2 — Wazuh Webhook Endpoint
**Priority:** P0 — Brief explicitly states "Wazuh webhook → FastAPI → LLM → dashboard"
**Files to create/edit:**
- `backend/domains/soc/router.py` (add route)
- `backend/domains/soc/tasks.py` (already has triage task, just call it)

**Implementation:**
```
1. Add to soc/router.py:
   POST /api/alerts/webhook
   - No auth required (Wazuh webhook has no Bearer token)
   - Validate payload with a WebhookAlertPayload Pydantic schema:
     { rule_id, rule_level, rule_description, agent_name, agent_id,
       agent_ip, timestamp, full_log, location }
   - Create Alert document in MongoDB (same schema as polled alerts)
   - Dispatch Celery task: triage_single_alert.delay(str(alert.id))
   - Broadcast via WebSocket to "alerts" channel
   - Return 200 { received: true }
   
2. Add WebhookAlertPayload schema to soc/schemas.py:
   class WebhookAlertPayload(BaseModel):
     rule: dict  # { id, level, description, groups }
     agent: dict  # { id, name, ip }
     timestamp: str
     full_log: str | None = None
     location: str | None = None

3. Security note: Add an optional WEBHOOK_SECRET env var.
   If set, validate X-Wazuh-Signature header against HMAC-SHA256.
   If not set, allow all (lab environment).
```

**Wazuh config (document in README):**
```xml
<!-- In Wazuh manager ossec.conf, add integration: -->
<integration>
  <name>custom-webhook</name>
  <hook_url>http://YOUR_SERVER_IP:8000/api/alerts/webhook</hook_url>
  <level>3</level>
  <alert_format>json</alert_format>
</integration>
```

---

### TASK 3 — Full Docker Compose Containerization
**Priority:** P0 — Week 12 GitHub deliverable requires Docker Compose file
**Files to create/edit:**
- `docker-compose.yml` (extend existing)
- `backend/Dockerfile` (already exists, verify it works)
- `frontend/Dockerfile` (new)
- `.env.example` (update with all vars)

**Backend Dockerfile (verify/update):**
```dockerfile
FROM python:3.11-slim
WORKDIR /app

# WeasyPrint system deps
RUN apt-get update && apt-get install -y \
  libpango-1.0-0 libpangoft2-1.0-0 libgdk-pixbuf2.0-0 \
  libffi-dev libjpeg-dev && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Frontend Dockerfile (create new):**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**nginx.conf (create in frontend/):**
```nginx
server {
  listen 80;
  root /usr/share/nginx/html;
  index index.html;
  location / { try_files $uri $uri/ /index.html; }
  location /api/ { proxy_pass http://backend:8000; }
  location /ws/ { 
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

**docker-compose.yml (full rewrite):**
```yaml
version: "3.9"

services:
  mongodb:
    image: mongo:7
    volumes: [mongo_data:/data/db]
    networks: [sentinel]
    environment:
      MONGO_INITDB_DATABASE: cyber_sentinel

  redis:
    image: redis:7-alpine
    networks: [sentinel]

  backend:
    build: ./backend
    depends_on: [mongodb, redis]
    networks: [sentinel]
    env_file: .env
    environment:
      MONGO_URI: mongodb://mongodb:27017/cyber_sentinel
      REDIS_URL: redis://redis:6379
    ports: ["8000:8000"]
    volumes: [./backend:/app]

  celery:
    build: ./backend
    command: celery -A core.celery_app worker --loglevel=info --pool=solo
    depends_on: [mongodb, redis, backend]
    networks: [sentinel]
    env_file: .env
    environment:
      MONGO_URI: mongodb://mongodb:27017/cyber_sentinel
      REDIS_URL: redis://redis:6379

  celery-beat:
    build: ./backend
    command: celery -A core.celery_app beat --loglevel=info
    depends_on: [mongodb, redis, backend]
    networks: [sentinel]
    env_file: .env
    environment:
      MONGO_URI: mongodb://mongodb:27017/cyber_sentinel
      REDIS_URL: redis://redis:6379

  frontend:
    build: ./frontend
    depends_on: [backend]
    networks: [sentinel]
    ports: ["80:80"]

networks:
  sentinel:

volumes:
  mongo_data:
```

**Verify these env vars are in .env.example:**
```
JWT_SECRET=
GEMINI_API_KEY=
MONGO_URI=mongodb://mongodb:27017/cyber_sentinel
REDIS_URL=redis://redis:6379
FRONTEND_ORIGIN=http://localhost:80
WEBHOOK_SECRET=   # optional — leave blank in lab
```

---

## PHASE 2 — DESIGN SYSTEM REFACTOR

> Design criteria: No AI slop. No gradient backgrounds. No glassmorphism.
> No floating orbs. No "revolutionize/unleash/empower" language.
> Real copy with real numbers. Semantic color scheme. Build once, use everywhere.
> Custom CSS only — no Tailwind dark: prefix for theming.

---

### TASK 4 — Design Token Audit & Purge
**Priority:** P1
**Files to edit:** `frontend/src/index.css`, all page/component files with violations

**CSS token system — verify and enforce:**
```css
/* All tokens must exist in :root and [data-theme="dark"] in index.css */
/* Required tokens: */
--bg-base, --bg-surface, --bg-card, --bg-muted
--text-base, --text-muted, --text-subtle
--border, --border-muted, --border-focus
--accent, --accent-dim
--severity-critical, --severity-high, --severity-medium, --severity-low, --severity-info
```

**Violations to remove from all files:**
- `bg-gradient-*` Tailwind classes except on explicit brand elements (logo icon only)
- `backdrop-filter: blur()` used as decorative blur (keep functional blurs like modal overlays)
- Any `text-gradient` or clip-path gradient text
- Inline `background: linear-gradient(...)` on card/container elements
- Any component using `animate-pulse` as decoration (only for skeleton loading)
- `FloatingParticles` component — audit usage and remove where decorative only
- `AnimatedGridPattern`, `Beams`, `BorderGlow` — remove from interior pages; keep only on auth pages if they remain

**Animation rules to enforce:**
- Motion-only on: `opacity`, `transform` (translate, scale, rotate)
- Easing: `cubic-bezier(0.16, 1, 0.3, 1)` 
- Duration: 150ms (instant feedback) — 250ms (page transitions) — 400ms (complex reveals)
- Hover lift: `translateY(-2px)` only, no scale
- Stagger: delay 40ms per item, max 5 items (200ms total stagger cap)
- No looping animations on page content — only on loading states

---

### TASK 5 — Landing Page Refactor
**Priority:** P1
**File:** `frontend/src/pages/Landing.tsx`

**Copy rules:**
- Remove ALL "revolutionize", "unleash", "empower", "next-generation", "cutting-edge" language
- Replace with direct, functional descriptions of what the tool does
- Example: "Automated security assessments" not "Revolutionize your security posture"

**Layout rules:**
- Hero: product name + one-line description + two CTAs (Get Started, View Demo)
- No floating orbs, no animated background grid on hero (or keep it minimal — dots only, no glow)
- Feature section: replace feature cards with a split layout — left description, right screenshot/terminal output
- Stats section: use real numbers from the actual system (e.g., "17 OWASP checks automated", "8 custom Wazuh rules", "5 security tools integrated")
- Remove any fake dashboard screenshots — either use real screenshots or remove entirely
- Tech stack section: plain logos, no animated cards
- CTA section: plain text + button, no gradient background

**Structure:**
```
[Nav] Logo + Links + Login/Register CTAs
[Hero] Headline + Subheadline + CTAs + terminal screenshot (real output)
[Stats] 4 real numbers from the system
[Features Pentest] Split: description left + scan result screenshot right
[Features SOC] Split: description left + alert feed screenshot right
[Correlation] Brief section — what it does + one diagram (simple, CSS-based)
[Tech Stack] Plain logo row
[CTA] Start using the platform
[Footer] Simple: links + lab name
```

---

### TASK 6 — Component State Completeness Audit
**Priority:** P1 — Every UI component must handle loading, error, and empty states.

**Required states for every data-displaying component:**
```
Loading:  skeleton placeholder (animated shimmer, matching component shape)
Error:    red border + icon + message + retry button
Empty:    icon + descriptive message + relevant CTA
Data:     the actual content
```

**Files to audit and complete:**
- `frontend/src/pages/Dashboard.tsx` — check all 4 stats cards for loading/error
- `frontend/src/pages/ScanList.tsx` — check empty state (no scans)
- `frontend/src/pages/soc/AlertFeed.tsx` — check loading skeleton vs spinner
- `frontend/src/pages/Analytics.tsx` — check all chart loading states
- `frontend/src/pages/soc/AgentsMonitor.tsx` — (once built) must have all 4 states

**Skeleton pattern (use everywhere, not spinners):**
```tsx
function SkeletonRow() {
  return (
    <div className="animate-pulse flex gap-3 items-center p-3" 
         style={{ backgroundColor: "var(--bg-surface)", borderRadius: 8 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: "var(--bg-muted)" }} />
      <div className="flex-1 space-y-1.5">
        <div style={{ height: 12, width: "60%", backgroundColor: "var(--bg-muted)", borderRadius: 4 }} />
        <div style={{ height: 10, width: "40%", backgroundColor: "var(--bg-muted)", borderRadius: 4 }} />
      </div>
    </div>
  );
}
```

---

## PHASE 3 — BRIEF ADVANCED FEATURES (Elevate grade)

---

### TASK 7 — Wazuh Agents Monitor Page
**Priority:** P1 — Backend API (`get_agents()`) already exists
**Files to create/edit:**
- `frontend/src/pages/soc/AgentsMonitor.tsx` (new — page already exists per codebase map)
- `frontend/src/services/socService.ts` (verify `getAgentStatus` returns agent list)
- `backend/domains/soc/router.py` (verify `GET /api/soc/agents` route exists)

**Page implementation:**
```
Route: /soc/agents (already in Sidebar as "Agents" if present, or add it)

Layout:
- Page header: "Connected Agents" + refresh button + last-updated timestamp
- Summary row: total agents | active count | disconnected count
- Agent table:
  Columns: Name | ID | IP | OS | Status | Last Heartbeat | Alert Count
  Status badge: active (green) | disconnected (red) | pending (yellow)
  Click row → navigate to /alerts?agent={agent_name} (filtered view)
- Empty state: "No agents registered. Deploy Wazuh agents and ensure the manager is configured."
- Loading: skeleton table rows (5 rows)
- Error: "Could not reach Wazuh manager. Check your SIEM configuration."

Backend data source: WazuhClient.get_agents() in wazuh_client.py
API route: GET /api/soc/agents (verify in soc/router.py)
```

---

### TASK 8 — Alert Feed Agent Filter
**Priority:** P2
**File:** `frontend/src/pages/soc/AlertFeed.tsx`

```
Add "Agent" filter dropdown next to Severity filter:
- Populate from unique agent_name values in loaded alerts
- On select: filter the alerts array client-side (or pass as query param)
- URL sync: /alerts?agent=web-server-01 so AgentsMonitor can link here
- If ?agent param present on mount: pre-select the filter
```

---

### TASK 9 — Scan Scheduling (Advanced Objective A)
**Priority:** P3
**Files:**
- `backend/domains/pentesting/scheduler.py` (new)
- `backend/domains/pentesting/router.py` (add schedule routes)
- `frontend/src/pages/ScanConfig.tsx` (add schedule option)

```
Backend:
- ScanSchedule model: { scan_id, target, options, cron_expression, last_run, next_run, enabled }
- POST /api/scans/schedule — create scheduled scan
- GET /api/scans/schedule — list scheduled scans for user
- DELETE /api/scans/schedule/{id} — remove
- Celery beat dynamic schedule: add/remove tasks using celery.conf.beat_schedule

Frontend in ScanConfig.tsx:
- "Schedule" toggle below the standard scan form
- If enabled: show frequency selector (Daily / Weekly / Custom cron)
- Show next run time preview
```

---

## PHASE 4 — GITHUB DELIVERABLES

---

### TASK 10 — README & Setup Guide
**Priority:** P0 — Required for GitHub release (Week 12)
**File:** `README.md`

**Structure:**
```markdown
# Cyber Sentinel — AI-Powered Web Security & SOC Platform
ITS Smart City and Cybersecurity Lab — 2026

## What it does
[2-3 sentences, plain English, no marketing copy]

## Architecture
[Simple ASCII diagram: browser → nginx → backend → MongoDB/Redis → Wazuh]

## Quick Start (Docker)
git clone ...
cp .env.example .env   # fill in required vars
docker compose up -d

## Manual Setup (Development)
[Step by step from CLAUDE.md startup sequence]

## Pentest Engine
[What it scans, how to use it, safe targets]

## SOC Integration
[Wazuh setup, webhook config, custom rules]

## Configuration
[Table of all env vars with descriptions]

## Custom Wazuh Rules
[Link to backend/domains/soc/wazuh_rules.py, how to deploy]

## API Docs
Swagger UI: http://localhost:8000/docs

## License
[MIT or appropriate]
```

---

### TASK 11 — Technical Report (Written deliverable)
**Priority:** P0 — 8-12 pages each (Intern A + Intern B)
**Not a code task — written document. Template outline:**

```
1. Introduction (0.5 page) — problem statement from brief
2. System Architecture (1-2 pages) — diagrams, component map
3. Implementation — Intern A (2-3 pages)
   - Crawler + endpoint discovery
   - OWASP checks implemented (list all 17)
   - CVE/EPSS integration
   - AI report generation
   - Report export
4. Implementation — Intern B (2-3 pages)
   - Wazuh deployment
   - Custom SIEM rules (list all 8)
   - AI triage pipeline
   - Correlation engine
5. Results (1 page) — scans run, alerts triaged, correlations found
6. Limitations (0.5 page) — honest assessment
7. Future Work (0.5 page)
8. References
```

---

## EXECUTION ORDER (recommended)

```
Session 1:  Task 1 (PDF/HTML export)
Session 2:  Task 2 (Wazuh webhook) + Task 3 (Docker Compose)
Session 3:  Task 4 (design token audit) + Task 5 (landing page)
Session 4:  Task 6 (component state audit)
Session 5:  Task 7 (agents monitor page) + Task 8 (alert filter)
Session 6:  Task 9 (scan scheduling) if time allows
Session 7:  Task 10 (README)
Session 8+: Task 11 (technical report — written, not code)
```

---

## CURRENT STATUS SNAPSHOT

| Feature | Status |
|---------|--------|
| Web crawler + endpoint discovery | DONE |
| 17 OWASP checks automated | DONE |
| Tech fingerprinting (WhatWeb, fingerprinter.py) | DONE |
| CVE mapping (NIST NVD API) | DONE |
| EPSS scoring (FIRST EPSS API) | DONE |
| LLM report generation (Gemini) | DONE |
| **PDF/HTML report download** | **MISSING — Task 1** |
| Authenticated scan support | DONE |
| Custom SIEM rules (8 rules) | DONE |
| Wazuh REST API wrapper | DONE |
| LLM alert auto-triage | DONE |
| Custom React SOC dashboard | DONE |
| Correlation engine (code) | DONE (bug fixed) |
| **Wazuh webhook endpoint** | **MISSING — Task 2** |
| Threat intel (VT + AbuseIPDB) | DONE |
| MITRE ATT&CK tagging | DONE |
| Active Response playbook | STUB — Task 8 |
| Agents Monitor page | PARTIAL — Task 7 |
| **Full Docker Compose** | **MISSING — Task 3** |
| **Technical report** | **NOT STARTED — Task 11** |
| Notification icon dedup (admin) | **FIXED** |
| Duplicate user name card | **FIXED** |
| Correlation broken on analyst | **FIXED** |
