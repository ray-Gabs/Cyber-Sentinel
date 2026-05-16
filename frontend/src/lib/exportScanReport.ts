import type { Scan, Finding } from "@/types/scan";

export interface ScanReportData {
  scan: Scan;
}

/* ── Constants ───────────────────────────────────────────────────────────── */

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const SEV_COLOR: Record<string, string> = {
  critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#16a34a", info: "#475569",
};
const SEV_BG: Record<string, string> = {
  critical: "#fef2f2", high: "#fff7ed", medium: "#fefce8", low: "#f0fdf4", info: "#f1f5f9",
};
const SLA_LABEL: Record<string, string> = {
  critical: "≤ 24 h", high: "≤ 7 days", medium: "≤ 30 days", low: "Next sprint", info: "Informational",
};
const SCAN_TYPE_LABELS: Record<string, string> = {
  quick: "Quick Scan", full: "Full Scan", passive: "Passive Scan",
  network: "Network Scan", api: "API Scan",
};
const TOOL_LABELS: Record<string, string> = {
  nmap: "Nmap", nuclei: "Nuclei", sslyze: "SSLyze",
  whatweb: "WhatWeb", zap: "OWASP ZAP",
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function esc(s: string | number | undefined | null): string {
  return String(s ?? "—")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatDate(ts: string | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateTime(ts: string | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function durationMin(start: string | undefined, end: string | undefined): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const min = Math.round(ms / 60000);
  return min < 1 ? "< 1 min" : `${min} min`;
}

function riskColor(score: number): string {
  if (score >= 7) return "#dc2626";
  if (score >= 4) return "#ca8a04";
  return "#16a34a";
}

function riskLabel(score: number): string {
  if (score >= 7) return "High Risk";
  if (score >= 4) return "Medium Risk";
  return "Low Risk";
}

function sevBadge(sev: string): string {
  const c  = SEV_COLOR[sev.toLowerCase()] ?? "#475569";
  const bg = SEV_BG[sev.toLowerCase()]   ?? "#f1f5f9";
  return `<span class="sev-badge" style="background:${bg};color:${c};border-color:${c}">${esc(sev.toUpperCase())}</span>`;
}

function countBySev(findings: Finding[]): Record<string, number> {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) { const k = f.severity?.toLowerCase() ?? "info"; if (k in counts) counts[k]++; }
  return counts;
}

function parseAiSections(text: string | undefined): { title: string; body: string }[] {
  if (!text) return [];
  const parts = text.split(/^---\s+(.+?)\s+---$/m);
  if (parts.length < 3) return [{ title: "Analysis", body: text }];
  const sections: { title: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: parts[i].trim(), body: (parts[i + 1] ?? "").trim() });
  }
  return sections;
}

function nl2p(text: string): string {
  return text.split(/\n\n+/).filter(Boolean).map(p =>
    `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`
  ).join("");
}

function owaspRows(findings: Finding[]): string {
  const owaspMap: Record<string, { count: number; sevs: string[] }> = {};
  for (const f of findings) {
    const cat = f.owasp_category || "Uncategorized";
    if (!owaspMap[cat]) owaspMap[cat] = { count: 0, sevs: [] };
    owaspMap[cat].count++;
    if (!owaspMap[cat].sevs.includes(f.severity)) owaspMap[cat].sevs.push(f.severity);
  }
  const entries = Object.entries(owaspMap).sort(([, a], [, b]) => b.count - a.count);
  const maxCount = Math.max(...entries.map(([, v]) => v.count), 1);
  return entries.map(([cat, { count, sevs }]) => {
    const worstSev = sevs.sort((a, b) => (SEVERITY_ORDER[a] ?? 5) - (SEVERITY_ORDER[b] ?? 5))[0];
    const c = SEV_COLOR[worstSev] ?? "#475569";
    const pct = (count / maxCount * 100).toFixed(1);
    return `<div class="owasp-row">
      <span class="owasp-cat">${esc(cat)}</span>
      <div class="owasp-bar-wrap"><div class="owasp-bar" style="width:${pct}%;background:${c}"></div></div>
      <span class="owasp-count">${count}</span>
      <span>${sevBadge(worstSev ?? "info")}</span>
    </div>`;
  }).join("");
}

function toolCoverageRows(toolEvents: Scan["tool_events"]): string {
  if (!toolEvents?.length) return `<tr><td colspan="4" style="color:var(--ink3);font-size:9px">No tool data</td></tr>`;
  return toolEvents.map(e => {
    const status = e.status;
    const statusColor = status === "completed" ? "#16a34a" : status === "failed" ? "#dc2626" : "#ca8a04";
    const elapsed = e.elapsed_seconds != null ? `${e.elapsed_seconds.toFixed(1)} s` : "—";
    return `<tr>
      <td>${esc(TOOL_LABELS[e.tool] ?? e.tool)}</td>
      <td><span class="tool-status" style="color:${statusColor}">${esc(status.toUpperCase())}</span></td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:9px">${e.findings_count ?? 0}</td>
      <td style="font-family:'JetBrains Mono',monospace;font-size:9px;color:var(--ink3)">${elapsed}</td>
    </tr>`;
  }).join("");
}

function fixCards(findings: Finding[]): string {
  const sorted = [...findings].sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5));
  return sorted.map((f, i) => {
    const c = SEV_COLOR[f.severity?.toLowerCase()] ?? "#475569";
    const steps = (f.remediation_steps ?? []).filter(Boolean);
    const stepsHtml = steps.length
      ? `<ol class="fix-steps">${steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>`
      : "";
    return `<div class="fix-card" style="border-left-color:${c}">
      <div class="fix-head">
        <span class="fix-num">${i + 1}</span>
        <span class="fix-title">${esc(f.name)}</span>
        ${sevBadge(f.severity ?? "info")}
      </div>
      ${f.plain_english ? `<p class="fix-body">${esc(f.plain_english)}</p>` : ""}
      ${f.affected_url || f.matched_at ? `<div class="fix-loc">${esc(f.affected_url || f.matched_at)}</div>` : ""}
      ${stepsHtml}
      ${f.business_impact ? `<p class="fix-impact">${esc(f.business_impact)}</p>` : ""}
    </div>`;
  }).join("");
}

/* ── HTML builder ────────────────────────────────────────────────────────── */

function buildHtml(data: ScanReportData): string {
  const { scan } = data;
  const now = new Date();
  const generated = now.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const dateStr = now.toISOString().slice(0, 10);

  const findings = (scan.findings ?? []).sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 5) - (SEVERITY_ORDER[b.severity] ?? 5));
  const sevCounts = countBySev(findings);
  const riskScore = scan.risk_score ?? 0;
  const riskPct   = Math.min(100, (riskScore / 10) * 100);
  const rc = riskColor(riskScore);
  const rl = riskLabel(riskScore);
  const duration = durationMin(scan.created_at, scan.completed_at);
  const scanTypeLabel = SCAN_TYPE_LABELS[scan.scan_type] ?? scan.scan_type ?? "Scan";

  const sevTotal = Object.values(sevCounts).reduce((a, b) => a + b, 0) || 1;
  const sevStrip = (["critical", "high", "medium", "low", "info"] as const).map(sev => {
    const pct = (sevCounts[sev] / sevTotal * 100).toFixed(1);
    return `<div style="width:${pct}%;background:${SEV_COLOR[sev]};height:100%;min-width:${sevCounts[sev] > 0 ? 2 : 0}px"></div>`;
  }).join("");

  const aiSections = parseAiSections(scan.ai_summary);
  const aiHtml = aiSections.map(({ title, body }, ix) =>
    `<div class="ai-section">
      <div class="ai-head">
        <span class="ai-ix">${String(ix + 1).padStart(2, "0")}</span>
        <h3 class="ai-title">${esc(title)}</h3>
      </div>
      <div class="ai-body">${nl2p(body)}</div>
    </div>`
  ).join("");

  const remediationSections = parseAiSections(scan.ai_remediation);
  const remHtml = remediationSections.length
    ? remediationSections.map(({ title, body }, ix) =>
        `<div class="ai-section">
          <div class="ai-head">
            <span class="ai-ix">${String(ix + 1).padStart(2, "0")}</span>
            <h3 class="ai-title">${esc(title)}</h3>
          </div>
          <div class="ai-body">${nl2p(body)}</div>
        </div>`
      ).join("")
    : (scan.ai_remediation ? `<div class="ai-body">${nl2p(scan.ai_remediation)}</div>` : "");

  const findingsTableRows = findings.map((f, i) => `<tr>
    <td style="width:28px;text-align:center;color:var(--ink3);font-family:'JetBrains Mono',monospace;font-size:8.5px">${i + 1}</td>
    <td style="width:75px">${sevBadge(f.severity ?? "info")}</td>
    <td>${esc(f.name)}</td>
    <td style="width:90px;font-family:'JetBrains Mono',monospace;font-size:8.5px">${esc(TOOL_LABELS[f.tool] ?? f.tool)}</td>
    <td style="width:130px;font-size:9px;color:var(--ink3)">${esc(f.owasp_category ?? "—")}</td>
    <td style="width:80px;font-size:9px">${esc(f.confidence ?? "—")}</td>
  </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Security Assessment Report — ${esc(scan.target)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
@page { size: A4 portrait; margin: 0; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .no-print { display: none !important; }
  .page-break { page-break-before: always; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
}
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #fff; --paper: #fafaf7; --ink: #18181b; --ink2: #52525b; --ink3: #a1a1aa;
  --border: #e4e4e7; --border2: #f4f4f5; --accent: #2563eb;
  --font-serif: 'Instrument Serif', Georgia, serif;
}
body { background: var(--bg); color: var(--ink); font-family: 'Inter', system-ui, sans-serif; font-size: 10px; line-height: 1.6; }

/* ── Cover page ── */
.cover-page {
  width: 210mm; min-height: 297mm; padding: 0;
  background: #0a0a14;
  background-image:
    linear-gradient(rgba(37,99,235,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(37,99,235,.05) 1px, transparent 1px);
  background-size: 32px 32px;
  display: flex; flex-direction: column; justify-content: flex-end;
  position: relative; overflow: hidden;
  color: #fff;
}
.cover-glow {
  position: absolute; top: -120px; right: -120px;
  width: 480px; height: 480px; border-radius: 50%;
  background: radial-gradient(circle, rgba(37,99,235,.25) 0%, transparent 70%);
  pointer-events: none;
}
.cover-glow2 {
  position: absolute; bottom: 80px; left: -80px;
  width: 300px; height: 300px; border-radius: 50%;
  background: radial-gradient(circle, rgba(99,102,241,.15) 0%, transparent 70%);
  pointer-events: none;
}
.cover-inner { padding: 0 18mm 14mm; position: relative; z-index: 1; }
.cover-eyebrow { font-size: 9px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: rgba(255,255,255,.45); margin-bottom: 18px; }
.cover-h1 { font-family: var(--font-serif); font-size: 58pt; font-weight: 400; line-height: 1.0; margin-bottom: 6px; }
.cover-h1 .accent { font-style: italic; color: #3b82f6; }
.cover-target { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: rgba(255,255,255,.55); margin-bottom: 28px; }
.cover-meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; border-top: 1px solid rgba(255,255,255,.1); padding-top: 20px; }
.cover-meta-item { padding: 0 16px 0 0; }
.cover-meta-item:first-child { padding-left: 0; }
.cmi-label { font-size: 7.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: rgba(255,255,255,.35); margin-bottom: 5px; }
.cmi-val { font-size: 13px; font-weight: 700; color: #fff; font-family: 'JetBrains Mono', monospace; }
.cover-brand { position: absolute; top: 14mm; left: 18mm; display: flex; align-items: center; gap: 8px; z-index: 1; }
.cover-mark { width: 22px; height: 22px; border-radius: 5px; background: linear-gradient(135deg, #2563eb, #1e3a8a); position: relative; flex-shrink: 0; }
.cover-mark::after { content: ''; position: absolute; inset: 6px; background: white; clip-path: polygon(50% 0, 100% 25%, 100% 65%, 50% 100%, 0 65%, 0 25%); }
.cover-brand-name { font-size: 11px; font-weight: 700; color: rgba(255,255,255,.9); }
.cover-brand-sub  { font-size: 8px; color: rgba(255,255,255,.4); letter-spacing: 0.08em; text-transform: uppercase; }

/* ── Content pages ── */
.content-page { padding: 13mm 16mm 16mm; position: relative; }
/* Header */
.page-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 9px; border-bottom: 2px solid var(--accent); margin-bottom: 16px; }
.mark { width: 18px; height: 18px; border-radius: 4px; background: linear-gradient(135deg, #2563eb, #1e3a8a); position: relative; flex-shrink: 0; }
.mark::after { content: ''; position: absolute; inset: 4px; background: white; clip-path: polygon(50% 0, 100% 25%, 100% 65%, 50% 100%, 0 65%, 0 25%); }
.page-title { font-size: 14px; font-weight: 800; letter-spacing: -0.02em; }
.page-sub { font-size: 9px; color: var(--ink3); margin-top: 2px; }
.page-meta { text-align: right; font-size: 7.5px; color: var(--ink3); line-height: 1.8; }
/* Sections */
.section { margin-bottom: 20px; }
.sec-title { font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); border-bottom: 1px solid var(--border); padding-bottom: 5px; margin-bottom: 12px; }
/* Risk gauge */
.risk-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; }
.risk-box { border: 1px solid var(--border); border-radius: 6px; padding: 14px 16px; background: var(--paper); }
.risk-score-display { display: flex; align-items: baseline; gap: 6px; margin-bottom: 8px; }
.risk-score-num { font-size: 38px; font-weight: 800; font-family: 'JetBrains Mono', monospace; letter-spacing: -0.04em; }
.risk-score-denom { font-size: 14px; color: var(--ink3); }
.risk-label { font-size: 8.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 10px; }
.risk-bar-wrap { position: relative; height: 8px; background: var(--border2); border-radius: 4px; overflow: hidden; }
.risk-bar-fill { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; }
/* KPI grid */
.kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
.kpi-cell { border: 1px solid var(--border); border-radius: 6px; padding: 9px 10px 9px 13px; position: relative; overflow: hidden; background: var(--paper); }
.kpi-cell::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--bar, var(--accent)); border-radius: 6px 0 0 6px; }
.kpi-cell-label { display: block; font-size: 7.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); margin-bottom: 3px; }
.kpi-cell-count { display: block; font-size: 22px; font-weight: 700; font-family: 'JetBrains Mono', monospace; letter-spacing: -0.04em; }
.kpi-cell-sla { display: block; font-size: 7px; color: var(--ink3); margin-top: 2px; }
/* Sev strip */
.sev-strip { display: flex; height: 7px; border-radius: 4px; overflow: hidden; margin-bottom: 16px; }
/* OWASP */
.owasp-row { display: grid; grid-template-columns: 1fr 1fr 50px 80px; align-items: center; gap: 10px; margin-bottom: 6px; }
.owasp-cat { font-size: 9px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.owasp-bar-wrap { height: 5px; background: var(--border2); border-radius: 3px; overflow: hidden; }
.owasp-bar { height: 100%; border-radius: 3px; }
.owasp-count { font-family: 'JetBrains Mono', monospace; font-size: 9px; color: var(--ink3); text-align: right; }
/* Table */
table.findings { width: 100%; border-collapse: collapse; }
table.findings thead tr { background: var(--border2); }
table.findings th { font-size: 7.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink2); padding: 6px 10px; text-align: left; border-bottom: 2px solid var(--border); white-space: nowrap; }
table.findings td { padding: 5px 10px; border-bottom: 1px solid var(--border2); vertical-align: middle; font-size: 9.5px; color: var(--ink2); }
.sev-badge { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 7.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; border: 1px solid; }
/* Tool coverage */
table.tools { width: 100%; border-collapse: collapse; }
table.tools th { font-size: 7.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink2); padding: 6px 10px; text-align: left; border-bottom: 2px solid var(--border); background: var(--border2); }
table.tools td { padding: 5px 10px; border-bottom: 1px solid var(--border2); font-size: 9.5px; color: var(--ink2); }
.tool-status { font-size: 8px; font-weight: 700; letter-spacing: 0.06em; }
/* AI sections */
.ai-section { border: 1px solid var(--border); border-radius: 6px; padding: 12px 14px; margin-bottom: 10px; background: var(--paper); }
.ai-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.ai-ix { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 4px; background: #eff6ff; color: #2563eb; font-size: 9px; font-weight: 700; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; }
.ai-title { font-size: 11px; font-weight: 700; color: var(--ink); }
.ai-body p { font-size: 10px; color: var(--ink2); margin-bottom: 7px; line-height: 1.65; }
.ai-body p:last-child { margin-bottom: 0; }
/* Fix cards */
.fix-card { border-left: 3px solid var(--border); padding: 10px 12px; margin-bottom: 10px; background: var(--paper); border-radius: 0 6px 6px 0; }
.fix-head { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.fix-num { display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 3px; background: var(--border2); color: var(--ink3); font-size: 8px; font-weight: 700; font-family: 'JetBrains Mono', monospace; flex-shrink: 0; }
.fix-title { flex: 1; font-size: 10.5px; font-weight: 600; color: var(--ink); }
.fix-body { font-size: 9.5px; color: var(--ink2); margin-bottom: 6px; line-height: 1.6; }
.fix-loc { font-family: 'JetBrains Mono', monospace; font-size: 8.5px; color: var(--ink3); margin-bottom: 6px; word-break: break-all; }
.fix-steps { padding-left: 16px; margin-bottom: 6px; }
.fix-steps li { font-size: 9.5px; color: var(--ink2); margin-bottom: 4px; }
.fix-impact { font-size: 9px; color: var(--ink3); font-style: italic; }
/* TOC */
.toc-row { display: grid; grid-template-columns: 28px 1fr auto; align-items: baseline; gap: 8px; padding: 5px 0; border-bottom: 1px dotted var(--border2); }
.toc-num { font-size: 9px; font-family: 'JetBrains Mono', monospace; color: var(--ink3); }
.toc-title { font-size: 10px; color: var(--ink); }
.toc-pg { font-size: 9px; color: var(--ink3); font-family: 'JetBrains Mono', monospace; }
/* Footer */
.page-footer { margin-top: 14px; padding-top: 6px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; font-size: 7.5px; color: var(--ink3); }
/* Print button */
.print-btn { position: fixed; bottom: 20px; right: 20px; background: #2563eb; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; z-index: 9999; font-family: inherit; box-shadow: 0 4px 12px rgba(37,99,235,.3); }
.print-btn:hover { background: #1d4ed8; }
</style>
</head>
<body>

<button class="print-btn no-print" onclick="window.print()">Print / Save PDF</button>

<!-- Cover page -->
<div class="cover-page">
  <div class="cover-glow"></div>
  <div class="cover-glow2"></div>
  <div class="cover-brand">
    <div class="cover-mark"></div>
    <div>
      <div class="cover-brand-name">Cyber Sentinel</div>
      <div class="cover-brand-sub">Security Platform</div>
    </div>
  </div>
  <div class="cover-inner">
    <div class="cover-eyebrow">Smart City and Cybersecurity Lab &middot; ITS &middot; ${esc(formatDate(scan.created_at))}</div>
    <div class="cover-h1">Security<br><span class="accent">assessment.</span></div>
    <div class="cover-target">${esc(scan.target)}</div>
    <div class="cover-meta">
      <div class="cover-meta-item">
        <div class="cmi-label">Scan Type</div>
        <div class="cmi-val">${esc(scanTypeLabel)}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cmi-label">Duration</div>
        <div class="cmi-val">${esc(duration)}</div>
      </div>
      <div class="cover-meta-item">
        <div class="cmi-label">Risk Score</div>
        <div class="cmi-val" style="color:${rc}">${riskScore.toFixed(1)}<span style="font-size:9px;color:rgba(255,255,255,.4)">/10</span></div>
      </div>
      <div class="cover-meta-item">
        <div class="cmi-label">Findings</div>
        <div class="cmi-val">${findings.length}</div>
      </div>
    </div>
  </div>
</div>

<!-- Executive Summary -->
<div class="content-page page-break">
  <div class="page-header">
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div class="mark"></div>
        <div style="font-size:9px;font-weight:700;color:var(--ink3)">Cyber Sentinel</div>
      </div>
      <div class="page-title">Executive Summary</div>
      <div class="page-sub">${esc(scan.target)} &middot; ${esc(scanTypeLabel)}</div>
    </div>
    <div class="page-meta">
      <div>Generated ${esc(generated)}</div>
      <div>${findings.length} findings</div>
    </div>
  </div>

  <!-- Risk + scan info -->
  <div class="risk-row">
    <div class="risk-box">
      <div style="font-size:7.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink3);margin-bottom:10px">Risk Score</div>
      <div class="risk-score-display">
        <span class="risk-score-num" style="color:${rc}">${riskScore.toFixed(1)}</span>
        <span class="risk-score-denom">/10</span>
      </div>
      <div class="risk-label" style="color:${rc}">${esc(rl)}</div>
      <div class="risk-bar-wrap">
        <div class="risk-bar-fill" style="width:${riskPct.toFixed(1)}%;background:${rc}"></div>
      </div>
    </div>
    <div class="risk-box">
      <div style="font-size:7.5px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--ink3);margin-bottom:10px">Scan Details</div>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:4px 0;font-size:9px;color:var(--ink3);width:90px">Target</td><td style="font-size:9px;font-family:'JetBrains Mono',monospace;word-break:break-all">${esc(scan.target)}</td></tr>
        <tr><td style="padding:4px 0;font-size:9px;color:var(--ink3)">Scan type</td><td style="font-size:9px">${esc(scanTypeLabel)}</td></tr>
        <tr><td style="padding:4px 0;font-size:9px;color:var(--ink3)">Started</td><td style="font-size:9px">${esc(formatDateTime(scan.created_at))}</td></tr>
        <tr><td style="padding:4px 0;font-size:9px;color:var(--ink3)">Completed</td><td style="font-size:9px">${esc(formatDateTime(scan.completed_at))}</td></tr>
        <tr><td style="padding:4px 0;font-size:9px;color:var(--ink3)">Duration</td><td style="font-size:9px">${esc(duration)}</td></tr>
      </table>
    </div>
  </div>

  <!-- Severity KPI grid -->
  <div class="sec-title">Findings by Severity</div>
  <div class="kpi-grid">
    ${(["critical","high","medium","low","info"] as const).map(sev =>
      `<div class="kpi-cell" style="--bar:${SEV_COLOR[sev]}">
        <span class="kpi-cell-label">${sev}</span>
        <span class="kpi-cell-count" style="color:${SEV_COLOR[sev]}">${sevCounts[sev]}</span>
        <span class="kpi-cell-sla">${SLA_LABEL[sev]}</span>
      </div>`
    ).join("")}
  </div>

  <!-- Distribution strip -->
  <div class="sev-strip">${sevStrip}</div>

  <!-- OWASP distribution -->
  ${findings.some(f => f.owasp_category) ? `
  <div class="sec-title">OWASP Category Distribution</div>
  <div style="margin-bottom:16px">${owaspRows(findings)}</div>` : ""}

  <!-- Tool coverage -->
  <div class="sec-title">Tool Coverage</div>
  <table class="tools">
    <thead><tr><th>Tool</th><th>Status</th><th>Findings</th><th>Elapsed</th></tr></thead>
    <tbody>${toolCoverageRows(scan.tool_events)}</tbody>
  </table>

  <div class="page-footer">
    <span>Cyber Sentinel &mdash; Security Assessment Report &mdash; ${esc(scan.target)}</span>
    <span>${esc(dateStr)}</span>
  </div>
</div>

<!-- Findings table -->
<div class="content-page page-break">
  <div class="page-header">
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div class="mark"></div>
        <div style="font-size:9px;font-weight:700;color:var(--ink3)">Cyber Sentinel</div>
      </div>
      <div class="page-title">Findings Register</div>
      <div class="page-sub">${findings.length} findings &middot; sorted by severity</div>
    </div>
    <div class="page-meta"><div>Generated ${esc(generated)}</div></div>
  </div>
  <table class="findings">
    <thead>
      <tr>
        <th style="width:28px">#</th>
        <th style="width:75px">Severity</th>
        <th>Finding</th>
        <th style="width:90px">Tool</th>
        <th style="width:130px">OWASP</th>
        <th style="width:80px">Confidence</th>
      </tr>
    </thead>
    <tbody>${findingsTableRows}</tbody>
  </table>
  <div class="page-footer">
    <span>Cyber Sentinel &mdash; Security Assessment Report &mdash; ${esc(scan.target)}</span>
    <span>${esc(dateStr)}</span>
  </div>
</div>

${aiHtml || remHtml ? `
<!-- AI Analysis -->
<div class="content-page page-break">
  <div class="page-header">
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div class="mark"></div>
        <div style="font-size:9px;font-weight:700;color:var(--ink3)">Cyber Sentinel</div>
      </div>
      <div class="page-title">AI Analysis</div>
      <div class="page-sub">AI-generated assessment and remediation guidance</div>
    </div>
    <div class="page-meta"><div>Generated ${esc(generated)}</div></div>
  </div>
  ${aiHtml ? `<div class="sec-title">Summary</div>${aiHtml}` : ""}
  ${remHtml ? `<div class="sec-title" style="margin-top:16px">Remediation Guidance</div>${remHtml}` : ""}
  <div class="page-footer">
    <span>Cyber Sentinel &mdash; Security Assessment Report &mdash; ${esc(scan.target)}</span>
    <span>${esc(dateStr)}</span>
  </div>
</div>` : ""}

${findings.filter(f => f.remediation_steps?.length || f.plain_english).length ? `
<!-- Fix cards -->
<div class="content-page page-break">
  <div class="page-header">
    <div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <div class="mark"></div>
        <div style="font-size:9px;font-weight:700;color:var(--ink3)">Cyber Sentinel</div>
      </div>
      <div class="page-title">Remediation Cards</div>
      <div class="page-sub">Actionable fixes sorted by severity</div>
    </div>
    <div class="page-meta"><div>Generated ${esc(generated)}</div></div>
  </div>
  ${fixCards(findings.filter(f => f.remediation_steps?.length || f.plain_english))}
  <div class="page-footer">
    <span>Cyber Sentinel &mdash; Security Assessment Report &mdash; ${esc(scan.target)}</span>
    <span>${esc(dateStr)}</span>
  </div>
</div>` : ""}

</body>
</html>`;
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

export function exportScanReportPDF(data: ScanReportData): void {
  const html = buildHtml(data);
  const dateStr = new Date().toISOString().slice(0, 10);
  const slug = data.scan.id?.slice(0, 8) ?? dateStr;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) { URL.revokeObjectURL(url); return; }
  win.addEventListener("load", () => {
    win.document.title = `cyber-sentinel-report-${slug}`;
    setTimeout(() => {
      win.print();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 400);
  });
}
