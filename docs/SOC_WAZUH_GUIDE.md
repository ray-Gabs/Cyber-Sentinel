# Wazuh SOC Integration Guide — Cyber Sentinel

> For instructors and students using Cyber Sentinel in a classroom / lab environment.
> Last updated: 2026-04-07

---

## Overview

```
Student PC / VM
  └── Wazuh Agent  ──────────────────────────┐
                                             ▼
                                    Wazuh Manager (VM1 · 10.4.89.178:1514)
                                             │
                          ┌──────────────────┴──────────────────┐
                          │ Webhook (real-time)  OR  Polling (30s) │
                          └──────────────────┬──────────────────┘
                                             ▼
                                 Cyber Sentinel Backend
                                   · Ingest alert
                                   · AI triage (MITRE + verdict)
                                   · Notify agent owner ← personalized
                                             │
                                             ▼
                                  Student SOC Dashboard
                                  (scoped to their agent only)
```

Each student:
1. Installs / starts a Wazuh agent that connects to the central Wazuh Manager
2. Links their agent name to their Cyber Sentinel account (`PATCH /api/auth/me`)
3. Their SOC dashboard shows **only their own alerts**
4. They get **real-time WebSocket notifications** when attacks hit their targets

---

## Part 1 — Instructor Setup (One-time)

### 1.1 Verify Cyber Sentinel is running

```bash
# On VM1 (10.4.89.178)
docker compose ps

# Expected: all containers Up (healthy)
# backend, celery, celery-beat, frontend, nginx, redis, mongo, zap
```

### 1.2 Verify Wazuh Manager API is reachable from Cyber Sentinel

```bash
# From any browser, log into Cyber Sentinel → SOC tab → click "Wazuh Status"
# OR via Swagger UI:
curl -s http://10.4.89.178/api/alerts/health \
  -H "Authorization: Bearer <your-jwt-token>"

# Expected:
# {"status": "connected", "wazuh_url": "https://host.docker.internal:55000", "agent_count": 1}
```

If status is `disconnected`, check:
- `WAZUH_API_PASSWORD` is set in `.env`
- Wazuh Manager service is running: `sudo systemctl status wazuh-manager`
- Port 55000 is not blocked: `curl -sk https://localhost:55000/ | head -c 200`

### 1.3 Configure Wazuh Manager to push alerts to Cyber Sentinel (webhook)

Edit Wazuh Manager config:
```bash
sudo nano /var/ossec/etc/ossec.conf
```

Add inside `<ossec_config>` (before the closing tag):
```xml
<!-- Cyber Sentinel real-time alert webhook -->
<integration>
  <name>custom-webhook</name>
  <hook_url>http://10.4.89.178/api/alerts/webhook</hook_url>
  <level>3</level>
  <alert_format>json</alert_format>
</integration>
```

Restart Wazuh Manager:
```bash
sudo systemctl restart wazuh-manager
sudo systemctl status wazuh-manager  # confirm it's Active
```

> **Why level 3?** Captures most web attack events. Raise to `7` for medium+ only.
> Cyber Sentinel stores all ingested alerts; AI triage only runs on level >= 7.

### 1.4 Create student user accounts

Students register at `http://10.4.89.178/register` or via API.
Their default role is `analyst` — they see only their own agent's alerts once linked.

---

## Part 2 — Student Setup

Students pick **one** of the options below based on their environment.

---

### Option A — Docker Compose (Recommended)

> Best for: students running DVWA / Juice Shop in Docker on their PC.
> Works on: Windows (Docker Desktop), Linux, macOS.

Add this service to the student's existing `docker-compose.yml`:

```yaml
services:
  # ... existing DVWA / Juice Shop services ...

  wazuh-agent:
    image: wazuh/wazuh-agent:4.9.2
    container_name: wazuh-agent
    hostname: ${STUDENT_NAME:-student}-pc     # becomes agent_name in Wazuh
    network_mode: host                        # needs host network to reach 10.4.89.178
    environment:
      WAZUH_MANAGER: "10.4.89.178"           # VM1 IP — Wazuh Manager
      WAZUH_AGENT_NAME: "${STUDENT_NAME:-student}-pc"
      WAZUH_REGISTRATION_PASSWORD: ""        # leave empty unless instructor set one
    volumes:
      - /var/log:/var/log:ro                  # monitor host OS logs
      - /proc:/proc:ro                        # process visibility (Linux)
    restart: unless-stopped
    # Note: container won't start on Windows if /proc doesn't exist — remove that line
```

Create a `.env` file in the same directory:
```env
STUDENT_NAME=alice   # change to your name — must be unique across the class
```

Start everything:
```bash
docker compose up -d
docker compose logs -f wazuh-agent   # confirm it says "Connected to the server"
```

---

### Option B — Native agent on a Linux VM

> Best for: students who have their own Linux VM (e.g. Ubuntu).

```bash
# On the STUDENT's VM
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | sudo gpg --dearmor -o /usr/share/keyrings/wazuh.gpg
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | \
  sudo tee /etc/apt/sources.list.d/wazuh.list
sudo apt-get update
sudo apt-get install -y wazuh-agent

# Configure manager address
sudo sed -i 's|MANAGER_IP|10.4.89.178|' /var/ossec/etc/ossec.conf

# Register + start
sudo /var/ossec/bin/agent-auth -m 10.4.89.178 -A "$(hostname)"
sudo systemctl enable --now wazuh-agent
sudo systemctl status wazuh-agent
```

---

### Option C — Native agent on Windows

> Best for: students on a Windows PC without Docker.

1. Download: `https://packages.wazuh.com/4.x/windows/wazuh-agent-4.9.2-1.msi`
2. Install with:
   ```powershell
   # Run as Administrator
   msiexec.exe /i wazuh-agent-4.9.2-1.msi WAZUH_MANAGER="10.4.89.178" WAZUH_AGENT_NAME="alice-laptop" /quiet
   NET START WazuhSvc
   ```
3. Verify in Services → `Wazuh` → Running

---

## Part 3 — Linking Your Agent to Your Cyber Sentinel Account

After your agent is connected and showing in the Wazuh Manager, link it to your account:

### 3.1 Find your agent name

Ask your instructor, or check via the Cyber Sentinel API (admin endpoint):
```
GET http://10.4.89.178/api/alerts/agents
```

Your agent name is what you set as `WAZUH_AGENT_NAME` (Docker) or `hostname` (native).
Example: `alice-pc`, `alice-laptop`

### 3.2 Link agent to your account

In Cyber Sentinel → Profile settings, OR via API:

```bash
# Replace <token> with your JWT from login, and alice-pc with your agent name
curl -X PATCH http://10.4.89.178/api/auth/me \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"wazuh_agent_name": "alice-pc"}'

# Response:
# {"id": "...", "username": "alice", ..., "wazuh_agent_name": "alice-pc"}
```

To unlink (see all alerts again):
```bash
curl -X PATCH http://10.4.89.178/api/auth/me \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"wazuh_agent_name": ""}'
```

### 3.3 What you get after linking

| Before linking | After linking |
|---|---|
| SOC tab shows all students' alerts | SOC tab shows only YOUR alerts |
| No targeted notifications | Real-time notification when YOUR target is attacked |
| Noisy, hard to follow | Scoped, actionable |

---

## Part 4 — Testing the Pipeline End-to-End

### 4.1 Trigger a test alert from DVWA

With your Wazuh agent running and DVWA accessible:

```bash
# Simple SQL injection attempt — Wazuh will detect the Apache log entry
curl "http://localhost/dvwa/vulnerabilities/sqli/?id=1'+OR+'1'%3D'1&Submit=Submit" \
  --cookie "PHPSESSID=<your-session>; security=low"
```

Or use a directory scan (triggers Wazuh's web attack rules):
```bash
# Nikto web scanner — generates multiple alerts
docker run --rm frapsoft/nikto -h http://localhost
```

### 4.2 Verify alert appears in Cyber Sentinel

1. Log in to `http://10.4.89.178`
2. Navigate to **SOC** tab
3. You should see alerts from your agent within ~5 seconds (webhook) or 30 seconds (polling)
4. Check the notification bell — you should get a real-time notification

### 4.3 Verify agent linked correctly

```bash
# Check your profile
curl http://10.4.89.178/api/auth/me \
  -H "Authorization: Bearer <token>"
# Should show: "wazuh_agent_name": "alice-pc"

# Check alert list is scoped
curl http://10.4.89.178/api/alerts/ \
  -H "Authorization: Bearer <token>"
# Should only show alerts from agent_name = "alice-pc"
```

---

## Part 5 — Troubleshooting

### Agent shows "Disconnected" in Wazuh Manager

```bash
# On student machine — check agent logs
# Docker:
docker compose logs wazuh-agent | tail -30

# Linux native:
sudo cat /var/ossec/logs/ossec.log | grep -i "error\|connected"

# Common causes:
# 1. Manager IP wrong — verify 10.4.89.178 is reachable: ping 10.4.89.178
# 2. Port 1514 blocked — try: nc -vz 10.4.89.178 1514
# 3. Registration failed — agent may need manual registration on Manager:
sudo /var/ossec/bin/manage_agents    # on VM1 Wazuh Manager
```

### Alerts not appearing in Cyber Sentinel

```bash
# 1. Check webhook is configured
grep -A 5 "custom-webhook" /var/ossec/etc/ossec.conf

# 2. Test webhook manually
curl -X POST http://10.4.89.178/api/alerts/webhook \
  -H "Content-Type: application/json" \
  -d '{"id":"test-001","rule":{"id":"550","description":"Test alert","level":7,"groups":["test"]},"agent":{"id":"001","name":"alice-pc","ip":"10.4.89.110"},"full_log":"test log entry","timestamp":"2026-04-07T00:00:00Z"}'
# Should return: {"status": "ok", "ingested": 1, ...}

# 3. Check polling (fallback — runs every 30s)
docker compose logs celery | grep -i "SOC Polling"

# 4. Check Wazuh API connection
curl http://10.4.89.178/api/alerts/health \
  -H "Authorization: Bearer <admin-token>"
```

### No real-time notifications

- Confirm your browser has the Cyber Sentinel tab open (WebSocket needs active connection)
- Confirm your agent name in your profile matches EXACTLY what Wazuh shows (case-sensitive)
- Notifications only fire for rule_level >= 7 — low-level alerts are stored but not notified

### Docker agent fails on Windows (`/proc` not found)

Remove the `/proc` volume mount from `docker-compose.yml`:
```yaml
volumes:
  - /var/log:/var/log:ro
  # - /proc:/proc:ro   ← remove this line on Windows
```

---

## Part 6 — Summary Checklist

### Instructor (one-time)
- [ ] Wazuh Manager installed and running on VM1
- [ ] `WAZUH_API_PASSWORD` set in `.env`
- [ ] Webhook block added to `ossec.conf`, Wazuh Manager restarted
- [ ] `GET /api/alerts/health` returns `"status": "connected"`
- [ ] Student user accounts created

### Student (per-student)
- [ ] DVWA / Juice Shop running (Docker Compose or native)
- [ ] Wazuh agent running and showing in Wazuh Manager agent list
- [ ] Cyber Sentinel account created at `http://10.4.89.178`
- [ ] Agent name linked: `PATCH /api/auth/me` with `wazuh_agent_name`
- [ ] Test alert triggered and visible in SOC tab
- [ ] Real-time notification received

---

## Reference: Key Network Ports

| Port | Service | Direction |
|------|---------|-----------|
| 1514/udp | Wazuh agent → Manager | Student → VM1 |
| 1515/tcp | Wazuh agent registration | Student → VM1 |
| 55000/tcp | Wazuh REST API | Cyber Sentinel (Docker) → VM1 host |
| 80/tcp | Cyber Sentinel (nginx) | Students → VM1 |
| 8000/tcp | Cyber Sentinel API (direct) | Dev/testing only |
