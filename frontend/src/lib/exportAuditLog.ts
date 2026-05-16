import type { AuditLogEntry } from "@/types";

export interface AuditExportData {
  logs: AuditLogEntry[];
  filter?: string;
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function esc(s: string | number | undefined | null): string {
  return String(s ?? "—")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function catFromAction(action: string): string { return action.split(".")[0]; }

const CAT_COLOR: Record<string, string> = {
  user: "#475569", scan: "#2563eb", alert: "#ca8a04",
  alerts: "#ca8a04", role: "#dc2626", account: "#7c3aed", config: "#7c3aed",
};
const CAT_LABEL: Record<string, string> = {
  user: "AUTH", scan: "SCAN", alert: "ALERTS",
  alerts: "ALERTS", role: "ADMIN", account: "ACCOUNT", config: "CONFIG",
};

function catColor(action: string): string { return CAT_COLOR[catFromAction(action)] ?? "#71717a"; }
function catLabel(action: string): string { return CAT_LABEL[catFromAction(action)] ?? catFromAction(action).toUpperCase(); }

function formatTs(ts: string): { date: string; time: string } {
  if (!ts) return { date: "—", time: "" };
  const d = new Date(ts);
  return {
    date: d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

function topN(items: string[], n = 8): { label: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const x of items) counts[x] = (counts[x] ?? 0) + 1;
  return Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, n).map(([label, count]) => ({ label, count }));
}

function barRows(rows: { label: string; count: number }[], max: number, color: string): string {
  return rows.map(({ label, count }) => {
    const pct = max > 0 ? (count / max) * 100 : 0;
    return `<div class="bar-row">
      <span class="bar-label">${esc(label)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
      <span class="bar-count">${count}</span>
    </div>`;
  }).join("");
}

/* ── HTML builder ────────────────────────────────────────────────────────── */

function buildHtml(data: AuditExportData): string {
  const { logs, filter } = data;
  const now = new Date();
  const generated = now.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toISOString().slice(0, 10);

  const catCounts: Record<string, number> = { user: 0, scan: 0, role: 0, account: 0, alert: 0 };
  for (const l of logs) { const c = catFromAction(l.action); if (c in catCounts) catCounts[c]++; }

  const topActions = topN(logs.map(l => l.action));
  const topUsers   = topN(logs.map(l => l.username ?? "unknown"));
  const maxAct = Math.max(...topActions.map(x => x.count), 1);
  const maxUsr = Math.max(...topUsers.map(x => x.count), 1);

  const kpiCards = [
    { label: "Total Events",  value: logs.length,      color: "#2563eb" },
    { label: "Auth",          value: catCounts.user,   color: "#475569" },
    { label: "Scans",         value: catCounts.scan,   color: "#2563eb" },
    { label: "Admin Changes", value: catCounts.role,   color: "#dc2626" },
    { label: "Account",       value: catCounts.account, color: "#7c3aed" },
    { label: "Alerts",        value: catCounts.alert,  color: "#ca8a04" },
  ].map(({ label, value, color }) =>
    `<div class="kpi-card" style="--bar:${color}">
      <span class="kpi-label">${esc(label)}</span>
      <span class="kpi-value" style="color:${color}">${value}</span>
    </div>`
  ).join("");

  const tableRows = logs.map((l, i) => {
    const { date, time } = formatTs(l.timestamp);
    const color = catColor(l.action);
    const label = catLabel(l.action);
    const initial = (l.username ?? "?")[0].toUpperCase();
    const isAdmin = catFromAction(l.action) === "role";
    const avatarBg    = isAdmin ? "#fef2f2" : "#f1f5f9";
    const avatarColor = isAdmin ? "#dc2626" : "#475569";
    const detail = l.details ?? (l.resource_type ? `${l.resource_type}${l.resource_id ? ` #${l.resource_id}` : ""}` : "—");
    return `<tr>
      <td class="ix">${i + 1}</td>
      <td class="ts"><span class="ts-date">${esc(date)}</span><span class="ts-time">${esc(time)}</span></td>
      <td class="user"><span class="avatar" style="background:${avatarBg};color:${avatarColor}">${esc(initial)}</span><span>${esc(l.username ?? "—")}</span></td>
      <td><span class="tag" style="--tc:${color}">${esc(label)}</span>&nbsp;<span class="action-text">${esc(l.action)}</span></td>
      <td class="details">${esc(detail)}</td>
      <td class="ip">${esc(l.ip_address ?? "—")}</td>
    </tr>`;
  }).join("");

  const filterNote = filter && filter !== "all" ? ` &middot; ${filter.toUpperCase()} filter` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Audit Log — Cyber Sentinel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 0; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
}
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #fff; --paper: #fafaf7; --ink: #18181b; --ink2: #52525b; --ink3: #a1a1aa;
  --border: #e4e4e7; --border2: #f4f4f5; --accent: #2563eb;
}
body { background: var(--bg); color: var(--ink); font-family: 'Inter', system-ui, sans-serif; font-size: 10px; line-height: 1.5; }
.page { padding: 12mm 14mm 18mm; position: relative; }
.page + .page { page-break-before: always; }
/* Header */
.page-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 10px; border-bottom: 2px solid var(--accent); margin-bottom: 14px; }
.brand { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.mark { width: 20px; height: 20px; border-radius: 4px; background: linear-gradient(135deg, #2563eb, #1e3a8a); position: relative; flex-shrink: 0; }
.mark::after { content: ''; position: absolute; inset: 5px; background: white; clip-path: polygon(50% 0, 100% 25%, 100% 65%, 50% 100%, 0 65%, 0 25%); }
.brand-name { font-size: 10.5px; font-weight: 700; color: var(--ink); letter-spacing: -0.01em; }
.brand-sub  { font-size: 8px; color: var(--ink3); letter-spacing: 0.08em; text-transform: uppercase; }
.doc-eyebrow { font-size: 8px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
.doc-title { font-size: 18px; font-weight: 800; letter-spacing: -0.025em; line-height: 1.2; }
.doc-sub { font-size: 9.5px; color: var(--ink2); margin-top: 3px; }
.meta { text-align: right; font-size: 8px; color: var(--ink3); line-height: 1.9; }
.conf-pill { display: inline-block; border: 1px solid var(--border); color: var(--ink2); font-size: 7px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 2px 7px; border-radius: 3px; margin-bottom: 3px; }
/* KPI */
.kpi-strip { display: flex; gap: 10px; margin-bottom: 14px; }
.kpi-card { flex: 1; border: 1px solid var(--border); border-radius: 6px; padding: 9px 11px 9px 14px; position: relative; overflow: hidden; background: var(--paper); }
.kpi-card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--bar, var(--accent)); border-radius: 6px 0 0 6px; }
.kpi-label { display: block; font-size: 7.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); margin-bottom: 3px; }
.kpi-value { display: block; font-size: 22px; font-weight: 700; font-family: 'JetBrains Mono', monospace; letter-spacing: -0.04em; }
/* Charts */
.charts { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 14px; }
.chart-box { border: 1px solid var(--border); border-radius: 6px; padding: 11px 13px; background: var(--paper); }
.chart-title { font-size: 7.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); margin-bottom: 9px; }
.bar-row { display: grid; grid-template-columns: 160px 1fr 36px; align-items: center; gap: 8px; margin-bottom: 5px; }
.bar-label { font-size: 8.5px; color: var(--ink2); font-family: 'JetBrains Mono', monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar-track { height: 5px; background: var(--border2); border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; }
.bar-count { font-size: 8.5px; font-family: 'JetBrains Mono', monospace; color: var(--ink3); text-align: right; }
/* Table */
.section-label { font-size: 7.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); margin-bottom: 7px; }
table.audit { width: 100%; border-collapse: collapse; }
table.audit thead tr { background: var(--border2); }
table.audit th { font-size: 7.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink2); padding: 6px 10px; text-align: left; border-bottom: 2px solid var(--border); white-space: nowrap; }
table.audit td { padding: 5px 10px; border-bottom: 1px solid var(--border2); vertical-align: middle; font-size: 9.5px; color: var(--ink2); }
td.ix { width: 28px; color: var(--ink3); font-family: 'JetBrains Mono', monospace; font-size: 8.5px; text-align: center; }
td.ts { width: 115px; }
.ts-date { display: block; font-size: 9px; color: var(--ink); }
.ts-time { display: block; font-size: 8px; color: var(--ink3); font-family: 'JetBrains Mono', monospace; }
td.user { width: 130px; }
td.user span:last-child { display: inline-flex; align-items: center; gap: 6px; }
.avatar { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 4px; font-size: 9px; font-weight: 700; flex-shrink: 0; }
.tag { display: inline-block; font-size: 7.5px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--tc, #475569); border: 1px solid var(--tc, #475569); border-radius: 3px; padding: 1px 5px; }
.tag::before { content: '\\00B7'; margin-right: 3px; }
.action-text { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; color: var(--ink3); }
td.details { max-width: 180px; font-size: 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
td.ip { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; color: var(--ink3); white-space: nowrap; }
/* Footer */
.page-footer { margin-top: 14px; padding-top: 6px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 7.5px; color: var(--ink3); }
/* Print button */
.print-btn { position: fixed; bottom: 20px; right: 20px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; z-index: 9999; font-family: inherit; box-shadow: 0 4px 12px rgba(37,99,235,.3); }
.print-btn:hover { background: #1d4ed8; }
</style>
</head>
<body>
<button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>
<div class="page">
  <div class="page-header">
    <div>
      <div class="brand">
        <div class="mark"></div>
        <div>
          <div class="brand-name">Cyber Sentinel</div>
          <div class="brand-sub">Security Platform</div>
        </div>
      </div>
      <div class="doc-eyebrow">Smart City and Cybersecurity Lab &middot; ITS</div>
      <div class="doc-title">Platform Audit Log</div>
      <div class="doc-sub">Activity trail${filterNote} &middot; ${logs.length} records &middot; ${esc(generated)}</div>
    </div>
    <div class="meta">
      <div class="conf-pill">Confidential</div>
      <div>Generated ${esc(generated)}</div>
      <div>${logs.length.toLocaleString()} events</div>
      <div>Cyber Sentinel v1.0</div>
    </div>
  </div>
  <div class="kpi-strip">${kpiCards}</div>
  <div class="charts">
    <div class="chart-box">
      <div class="chart-title">Top Actions</div>
      ${barRows(topActions, maxAct, "#2563eb")}
    </div>
    <div class="chart-box">
      <div class="chart-title">Top Users by Activity</div>
      ${barRows(topUsers, maxUsr, "#475569")}
    </div>
  </div>
  <div class="section-label">Audit Trail &mdash; ${logs.length} Events</div>
  <table class="audit">
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th style="width:115px">Timestamp</th>
        <th style="width:130px">User</th>
        <th style="width:230px">Action</th>
        <th>Details</th>
        <th style="width:110px">IP Address</th>
      </tr>
    </thead>
    <tbody>${tableRows}</tbody>
  </table>
  <div class="page-footer">
    <span>Cyber Sentinel &mdash; Smart City and Cybersecurity Lab &middot; ITS</span>
    <span>${esc(dateStr)}</span>
  </div>
</div>
</body>
</html>`;
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

export function exportAuditLogPDF(data: AuditExportData): void {
  const html = buildHtml(data);
  const dateStr = new Date().toISOString().slice(0, 10);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) { URL.revokeObjectURL(url); return; }
  win.addEventListener("load", () => {
    win.document.title = `audit-log-${dateStr}`;
    setTimeout(() => {
      win.print();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 400);
  });
}
