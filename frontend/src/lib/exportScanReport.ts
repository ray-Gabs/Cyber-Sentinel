import type { Scan, Finding } from "@/types/scan";
import { downloadPDF } from "@/lib/pdfDownload";

export interface ScanReportData {
  scan: Scan;
}

/* ── Constants ───────────────────────────────────────────────────────────── */

const SEV_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const SEV_COLOR: Record<string, string> = {
  critical: "#dc2626", high: "#ea580c", medium: "#ca8a04", low: "#16a34a", info: "#475569",
};
const SEV_SOFT: Record<string, string> = {
  critical: "rgba(220,38,38,0.10)", high: "rgba(234,88,12,0.10)",
  medium: "rgba(202,138,4,0.12)", low: "rgba(22,163,74,0.10)", info: "rgba(71,85,105,0.10)",
};
const SLA_LABEL: Record<string, string> = {
  critical: "≤ 24h", high: "≤ 7 days", medium: "≤ 30 days", low: "Next sprint", info: "Informational",
};
const SCAN_TYPE_LABELS: Record<string, string> = {
  quick: "Quick", full: "Full", passive: "Passive", network: "Network", api: "API",
};
const TOOL_LABELS: Record<string, string> = {
  nmap: "Nmap Port Scan", nuclei: "Nuclei Scanner", sslyze: "SSL/TLS Analyzer",
  whatweb: "WhatWeb", zap: "ZAP DAST", fingerprinter: "Fingerprinter",
  subdomain_enum: "Subdomain Enum", crawler: "Web Crawler", dir_brute: "Dir Bruter",
  sqli: "SQLi Check", xss: "XSS Check", idor: "IDOR Check",
  redirect: "Redirect Check", auth: "Auth Check", ssrf: "SSRF Check",
  misconfig: "Misconfig Check", supply_chain: "Supply Chain",
  insecure_design: "Design Check", integrity: "Integrity Check", error_handling: "Error Handling",
};

/* Pagination constants */
const FINDINGS_PER_PAGE = 22;
const AI_PER_PAGE = 2;
const FIX_PER_PAGE = 3;

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


function durationLabel(start: string | undefined, end: string | undefined): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const s  = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m  = Math.floor(s / 60);
  const rs = s % 60;
  return rs > 0 ? `${m}m ${rs}s` : `${m}m`;
}

function riskColor(score: number): string {
  return score >= 7 ? "#dc2626" : score >= 4 ? "#ca8a04" : "#16a34a";
}
function riskLabel(score: number): string {
  return score >= 7 ? "HIGH RISK" : score >= 4 ? "MEDIUM RISK" : "LOW RISK";
}
function riskSoftBg(score: number): string {
  return score >= 7 ? "rgba(220,38,38,0.10)" : score >= 4 ? "rgba(202,138,4,0.12)" : "rgba(22,163,74,0.10)";
}

function badge(sev: string): string {
  const k  = sev.toLowerCase();
  const c  = SEV_COLOR[k] ?? "#475569";
  const bg = SEV_SOFT[k]  ?? "rgba(71,85,105,0.10)";
  return `<span class="badge dot" style="background:${bg};color:${c}">${esc(sev.toUpperCase())}</span>`;
}

function toolBadge(status: string): string {
  const map: Record<string, [string, string]> = {
    completed: ["rgba(22,163,74,0.10)", "#16a34a"],
    success:   ["rgba(22,163,74,0.10)", "#16a34a"],
    timeout:   ["rgba(202,138,4,0.12)", "#ca8a04"],
    failed:    ["rgba(220,38,38,0.10)", "#dc2626"],
    error:     ["rgba(220,38,38,0.10)", "#dc2626"],
    skipped:   ["#f4f4f5", "#71717a"],
  };
  const [bg, c] = map[status?.toLowerCase()] ?? ["#f4f4f5", "#71717a"];
  return `<span class="badge dot" style="background:${bg};color:${c}">${esc(status?.toUpperCase() ?? "—")}</span>`;
}

function countBySev(findings: Finding[]): Record<string, number> {
  const out: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    const k = f.severity?.toLowerCase() ?? "info";
    if (k in out) out[k]++;
  }
  return out;
}

function parseAiSections(text: string | undefined): { title: string; body: string }[] {
  if (!text?.trim()) return [];
  const parts = text.split(/^---\s+(.+?)\s+---$/m);
  if (parts.length < 3) return [{ title: "Analysis", body: text.trim() }];
  const out: { title: string; body: string }[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    out.push({ title: parts[i].trim(), body: (parts[i + 1] ?? "").trim() });
  }
  return out;
}

function nl2p(text: string): string {
  return text.split(/\n\n+/).filter(Boolean)
    .map(p => `<p>${esc(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ── Page component helpers ──────────────────────────────────────────────── */

function pgHeader(dateStr: string): string {
  return `<div class="pg-header">
    <div class="brand"><div class="mark"></div><b>Cyber Sentinel</b></div>
    <div class="pg-meta">
      <span>${esc(dateStr)}</span>
      <span class="dot"></span>
      <span>CONFIDENTIAL</span>
    </div>
  </div>`;
}

function pgFooter(left: string, pageLabel: string): string {
  return `<div class="pg-footer">
    <span>${esc(left)}</span>
    <span class="conf">CONFIDENTIAL</span>
    <span>${esc(pageLabel)}</span>
  </div>`;
}

function eyebrow(text: string): string {
  return `<div class="eyebrow">${esc(text)}</div>`;
}

/* ── Finders register rows (shared between pages) ───────────────────────── */

function findingRows(findings: Finding[], offset: number): string {
  return findings.map((f, i) => `<tr>
    <td class="num-cell">${offset + i + 1}</td>
    <td>${badge(f.severity ?? "info")}</td>
    <td>${esc(f.name)}</td>
    <td class="mono-cell">${esc(TOOL_LABELS[f.tool ?? ""] ?? f.tool ?? "—")}</td>
    <td class="dim-cell">${esc(f.owasp_category ?? "—")}</td>
    <td class="dim-cell">${esc(f.confidence ?? "—")}</td>
  </tr>`).join("");
}

/* ── Tool coverage ───────────────────────────────────────────────────────── */

function toolRows(toolEvents: Scan["tool_events"]): string {
  if (!toolEvents?.length) {
    return `<tr><td colspan="4" style="color:var(--ink-3);font-style:italic">No tool data recorded</td></tr>`;
  }
  return toolEvents.map(e => {
    const elapsed = e.elapsed_seconds != null ? `${e.elapsed_seconds.toFixed(1)}s` : "—";
    return `<tr>
      <td>${esc(TOOL_LABELS[e.tool] ?? e.tool)}</td>
      <td>${toolBadge(e.status)}</td>
      <td class="num-cell">${e.findings_count ?? 0}</td>
      <td class="mono-cell">${elapsed}</td>
    </tr>`;
  }).join("");
}

/* ── OWASP distribution ──────────────────────────────────────────────────── */

function owaspList(findings: Finding[]): string {
  const map: Record<string, { count: number; sevs: string[] }> = {};
  for (const f of findings) {
    const cat = f.owasp_category || "Uncategorized";
    if (!map[cat]) map[cat] = { count: 0, sevs: [] };
    map[cat].count++;
    if (f.severity && !map[cat].sevs.includes(f.severity)) map[cat].sevs.push(f.severity);
  }
  const entries = Object.entries(map).sort(([, a], [, b]) => b.count - a.count);
  return entries.map(([cat, { count, sevs }]) => {
    const worst = sevs.sort((a, b) => (SEV_ORDER[a] ?? 5) - (SEV_ORDER[b] ?? 5))[0] ?? "info";
    return `<div class="owasp-row">
      <span class="code">${esc(cat)}</span>
      <span class="owasp-name">${esc(cat)}</span>
      <span class="owasp-count">${count}<span class="small"> / ${findings.length}</span></span>
      <span class="sev-col">${badge(worst)}</span>
    </div>`;
  }).join("");
}

/* ── CSS ─────────────────────────────────────────────────────────────────── */

const CSS = `
:root {
  --bg: #ffffff; --paper: #fafaf7; --paper-2: #f4f4ef;
  --ink: #18181b; --ink-2: #3f3f46; --ink-3: #71717a; --ink-4: #a1a1aa;
  --rule: #e4e4e7; --rule-2: #d4d4d8;
  --accent: #2563eb; --accent-2: #1e3a8a; --accent-soft: rgba(37,99,235,0.08);
  --sev-critical: #dc2626; --sev-high: #ea580c; --sev-medium: #ca8a04;
  --sev-low: #16a34a; --sev-info: #475569;
  --font-sans: 'Inter', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --font-serif: 'Instrument Serif', serif;
}
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; padding: 0; background: #d4d4d8; font-family: var(--font-sans); font-size: 10pt; line-height: 1.55; color: var(--ink); }

/* ── Page shell ── */
.page {
  width: 210mm; min-height: 297mm;
  margin: 24px auto;
  background: var(--bg);
  padding: 16mm 16mm 22mm;
  position: relative;
  box-shadow: 0 1px 2px rgba(0,0,0,0.06), 0 10px 30px -10px rgba(0,0,0,0.18);
  page-break-after: always;
}
.page:last-child { page-break-after: auto; }

/* ── Cover ── */
.page.cover-page { padding: 0; }
.cover {
  min-height: calc(297mm - 48px);
  display: flex; flex-direction: column;
  padding: 18mm;
  background: var(--bg);
  color: var(--ink);
  position: relative;
  overflow: hidden;
}
.cover::before {
  content: ''; position: absolute; inset: 0;
  background-image:
    linear-gradient(to right, rgba(24,24,27,0.045) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(24,24,27,0.045) 1px, transparent 1px);
  background-size: 28px 28px;
  mask-image: radial-gradient(ellipse 80% 60% at top right, black 20%, transparent 75%);
  pointer-events: none;
}
.cover::after {
  content: ''; position: absolute; right: -120px; top: -120px;
  width: 460px; height: 460px;
  background: radial-gradient(circle, rgba(37,99,235,0.10), transparent 60%);
  pointer-events: none;
}
.cover > * { position: relative; z-index: 1; }
.cover-top { display: flex; align-items: center; justify-content: space-between; }
.cover .confidential { font-family: var(--font-mono); font-size: 8pt; letter-spacing: 0.2em; color: var(--sev-critical); }
.cover-rule { height: 1px; background: var(--rule); margin: 18mm 0 0; position: relative; }
.cover-rule::before { content: ''; position: absolute; left: 0; top: -0.5px; width: 56px; height: 2px; background: var(--accent); border-radius: 1px; }
.cover-body { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; }
.cover-eyebrow {
  font-family: var(--font-mono); font-size: 9pt; color: var(--accent);
  letter-spacing: 0.18em; margin-bottom: 22px;
  display: flex; align-items: center; gap: 10px;
}
.cover-eyebrow::before { content: ''; width: 22px; height: 2px; background: var(--accent); border-radius: 1px; }
.cover h1 { font-family: var(--font-serif); font-size: 64pt; line-height: 0.92; color: var(--ink); margin-bottom: 20px; font-weight: 400; }
.cover h1 .accent { color: var(--accent); font-style: italic; }
.target-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 18px; background: var(--paper);
  border: 1px solid var(--rule); border-radius: 6px; margin-bottom: 28px;
}
.target-row .label { font-family: var(--font-mono); font-size: 8pt; color: var(--ink-3); letter-spacing: 0.14em; text-transform: uppercase; }
.target-row .target { font-family: var(--font-mono); font-size: 13pt; color: var(--accent); word-break: break-all; flex: 1; }
.cover-meta {
  display: grid; grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 18px 0;
}
.cover-meta > div { padding: 0 18px; border-right: 1px solid var(--rule); }
.cover-meta > div:first-child { padding-left: 0; }
.cover-meta > div:last-child { border-right: 0; padding-right: 0; }
.cover-meta .label { font-family: var(--font-mono); font-size: 7.5pt; letter-spacing: 0.14em; color: var(--ink-3); text-transform: uppercase; margin-bottom: 8px; }
.cover-meta .value { font-size: 15pt; font-weight: 500; color: var(--ink); letter-spacing: -0.01em; }
.cover-meta .value.mono { font-family: var(--font-mono); font-size: 12pt; }
.cover-foot {
  margin-top: 24px; display: flex; align-items: center; justify-content: space-between;
  font-family: var(--font-mono); font-size: 8.5pt; color: var(--ink-3); letter-spacing: 0.04em;
}

/* ── Running header ── */
.pg-header {
  display: flex; align-items: center; justify-content: space-between;
  padding-bottom: 10px; border-bottom: 1px solid var(--rule); margin-bottom: 22px;
}
.brand { display: flex; align-items: center; gap: 9px; }
.mark {
  width: 18px; height: 18px; border-radius: 4px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  position: relative; flex-shrink: 0;
}
.mark::after {
  content: ''; position: absolute; inset: 5px;
  background: white; clip-path: polygon(50% 0, 100% 25%, 100% 65%, 50% 100%, 0 65%, 0 25%);
}
.brand b { font-size: 11pt; font-weight: 600; letter-spacing: -0.01em; color: var(--ink); }
.pg-meta { font-family: var(--font-mono); font-size: 8pt; color: var(--ink-3); display: flex; align-items: center; gap: 14px; }
.pg-meta .dot { width: 4px; height: 4px; border-radius: 50%; background: var(--ink-4); }

/* ── Running footer ── */
.pg-footer {
  position: absolute; left: 16mm; right: 16mm; bottom: 12mm;
  display: flex; justify-content: space-between; align-items: center;
  padding-top: 10px; border-top: 1px solid var(--rule);
  font-family: var(--font-mono); font-size: 8pt; color: var(--ink-3);
}
.pg-footer .conf { color: var(--sev-critical); letter-spacing: 0.12em; }

/* ── Typography ── */
.eyebrow {
  font-family: var(--font-mono); font-size: 8pt; letter-spacing: 0.14em;
  color: var(--ink-3); text-transform: uppercase;
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
}
.eyebrow::before { content: ''; width: 16px; height: 2px; background: var(--accent); border-radius: 1px; }
h2 { font-size: 18pt; font-weight: 600; letter-spacing: -0.022em; line-height: 1.15; margin: 0 0 14px; color: var(--ink); }
h3 { font-size: 11pt; font-weight: 600; letter-spacing: -0.005em; margin: 0 0 6px; color: var(--ink); }
p.lead { font-size: 10.5pt; color: var(--ink-2); max-width: 540px; margin: 0 0 18px; line-height: 1.6; }

/* ── Metadata grid ── */
.meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1px; background: var(--rule); border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; margin-bottom: 22px; }
.meta-cell { background: white; padding: 12px 14px; }
.meta-cell .label { font-family: var(--font-mono); font-size: 7.5pt; letter-spacing: 0.12em; color: var(--ink-3); text-transform: uppercase; margin-bottom: 5px; }
.meta-cell .value { font-size: 10.5pt; color: var(--ink); font-weight: 500; word-break: break-all; }
.meta-cell .value.mono { font-family: var(--font-mono); font-size: 9.5pt; }

/* ── Risk block ── */
.risk-block { background: linear-gradient(180deg,#fafaf7 0%,#fff 100%); border: 1px solid var(--rule); border-radius: 10px; padding: 20px 22px; margin-bottom: 22px; }
.risk-row-inner { display: flex; align-items: flex-end; gap: 24px; margin-bottom: 16px; }
.risk-num { font-family: var(--font-mono); font-size: 64pt; font-weight: 500; line-height: 0.88; letter-spacing: -0.04em; }
.risk-num .denom { font-size: 22pt; color: var(--ink-3); font-weight: 400; }
.risk-label-wrap { flex: 1; padding-bottom: 6px; }
.risk-tag {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 10px; border-radius: 4px;
  font-family: var(--font-mono); font-size: 9pt; font-weight: 600; letter-spacing: 0.1em;
}
.risk-tag::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.risk-desc { font-size: 9.5pt; color: var(--ink-2); margin-top: 10px; max-width: 360px; line-height: 1.55; }
.risk-bar { height: 10px; border-radius: 5px; background: linear-gradient(90deg,#16a34a 0%,#16a34a 22%,#ca8a04 28%,#ca8a04 48%,#ea580c 54%,#ea580c 74%,#dc2626 80%,#dc2626 100%); position: relative; }
.risk-bar::after {
  content: ''; position: absolute; top: -4px; left: calc(var(--risk-pct,15%) - 9px);
  width: 18px; height: 18px; background: white; border: 3px solid currentColor; border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0,0,0,0.2);
}
.risk-legend { display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 7.5pt; color: var(--ink-3); margin-top: 10px; letter-spacing: 0.06em; }

/* ── KPI row ── */
.kpi-row { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 20px; }
.kpi { border: 1px solid var(--rule); border-radius: 8px; padding: 12px 14px; background: white; position: relative; overflow: hidden; }
.kpi::before { content: ''; position: absolute; top: 0; left: 0; bottom: 0; width: 3px; background: var(--bar, var(--ink-3)); }
.kpi .label { font-family: var(--font-mono); font-size: 7.5pt; letter-spacing: 0.1em; color: var(--ink-3); text-transform: uppercase; padding-left: 8px; }
.kpi .value { font-family: var(--font-mono); font-size: 24pt; font-weight: 500; margin-top: 4px; line-height: 1; letter-spacing: -0.02em; padding-left: 8px; color: var(--bar); }
.kpi .action { font-size: 7.5pt; color: var(--ink-3); margin-top: 4px; padding-left: 8px; font-family: var(--font-mono); letter-spacing: 0.04em; }

/* ── Severity strip ── */
.sev-strip { display: flex; height: 28px; border-radius: 6px; overflow: hidden; margin-bottom: 6px; background: var(--paper); border: 1px solid var(--rule); }
.sev-strip > span { display: flex; align-items: center; justify-content: center; height: 100%; font-family: var(--font-mono); font-size: 8.5pt; font-weight: 600; color: white; min-width: 1px; }
.sev-strip > span.empty { background: var(--paper) !important; color: var(--ink-4); }
.sev-legend { display: flex; gap: 16px; font-family: var(--font-mono); font-size: 8pt; color: var(--ink-3); margin-bottom: 18px; }
.sev-legend .item { display: flex; align-items: center; gap: 5px; }
.sev-legend .swatch { width: 8px; height: 8px; border-radius: 2px; }

/* ── Tables ── */
.tbl-card { border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; margin-bottom: 18px; background: white; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
table thead th {
  text-align: left; font-family: var(--font-mono); font-size: 7.5pt; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.12em; color: var(--ink-3);
  padding: 9px 12px; background: var(--paper); border-bottom: 1px solid var(--rule); white-space: nowrap;
}
table tbody td { padding: 8px 12px; border-bottom: 1px solid var(--rule); vertical-align: middle; }
table tbody tr:last-child td { border-bottom: 0; }
.num-cell { font-family: var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; color: var(--ink-3); font-size: 8.5pt; }
.mono-cell { font-family: var(--font-mono); font-size: 8.5pt; }
.dim-cell { font-size: 9pt; color: var(--ink-3); }

/* Badges */
.badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 3px;
  font-family: var(--font-mono); font-size: 7pt; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap;
}
.badge.dot::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: currentColor; display: inline-block; }

/* ── OWASP ── */
.owasp-list { display: grid; gap: 6px; }
.owasp-row { display: grid; grid-template-columns: 100px 1fr 80px 100px; gap: 14px; align-items: center; padding: 11px 14px; background: white; border: 1px solid var(--rule); border-radius: 6px; }
.owasp-row .code { font-family: var(--font-mono); font-size: 9pt; font-weight: 600; color: var(--accent); background: var(--accent-soft); padding: 2px 7px; border-radius: 3px; text-align: center; }
.owasp-name { font-size: 9.5pt; color: var(--ink); }
.owasp-count { font-family: var(--font-mono); font-size: 11pt; font-weight: 600; text-align: right; color: var(--ink); }
.owasp-count .small { font-size: 8pt; color: var(--ink-3); font-weight: 400; margin-left: 2px; }
.sev-col { text-align: right; }

/* ── AI sections ── */
.ai-section { border: 1px solid var(--rule); border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; background: white; page-break-inside: avoid; }
.ai-head { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px dashed var(--rule); }
.ai-head .ix { width: 22px; height: 22px; border-radius: 5px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-family: var(--font-mono); font-size: 9pt; font-weight: 700; }
.ai-head h3 { font-size: 11pt; text-transform: capitalize; }
.ai-head .pill { margin-left: auto; font-family: var(--font-mono); font-size: 7.5pt; color: var(--ink-3); letter-spacing: 0.1em; text-transform: uppercase; }
.ai-body { font-size: 9.5pt; line-height: 1.65; color: var(--ink-2); }
.ai-body p { margin: 0 0 8px; }
.ai-body p:last-child { margin-bottom: 0; }

/* ── Fix cards ── */
.fix-card { border: 1px solid var(--rule); border-left: 3px solid var(--sev-medium); border-radius: 6px; padding: 14px 16px; margin-bottom: 10px; background: white; page-break-inside: avoid; }
.fix-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.fix-title { font-size: 10pt; font-weight: 600; flex: 1; min-width: 200px; }
.fix-meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; padding: 8px 10px; background: var(--paper); border-radius: 4px; font-size: 8.5pt; margin-bottom: 10px; }
.fix-meta .k { font-family: var(--font-mono); font-size: 7pt; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.1em; }
.fix-meta .v { color: var(--ink); font-weight: 500; margin-top: 2px; }
.fix-steps { font-size: 9.3pt; color: var(--ink-2); line-height: 1.6; }
.fix-steps ol { padding-left: 18px; margin: 0; }
.fix-steps li { margin-bottom: 4px; }
.fix-loc { font-family: var(--font-mono); font-size: 8.5pt; color: var(--ink-3); margin-bottom: 8px; word-break: break-all; }

/* ── TOC ── */
.toc { display: grid; gap: 2px; margin-bottom: 28px; }
.toc-row { display: grid; grid-template-columns: 28px 1fr auto; align-items: baseline; gap: 14px; padding: 9px 0; border-bottom: 1px dashed var(--rule); font-size: 10.5pt; }
.toc-row .ix { font-family: var(--font-mono); font-size: 9pt; color: var(--accent); font-weight: 600; }
.toc-row .pg { font-family: var(--font-mono); font-size: 9pt; color: var(--ink-3); }

/* ── Print overrides ── */
@media print {
  body { background: white; }
  .page { margin: 0; box-shadow: none; }
  .no-print { display: none !important; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
}
@page { size: A4; margin: 0; }
`;

/* ── Full HTML builder ────────────────────────────────────────────────────── */

function buildHtml(data: ScanReportData): string {
  const { scan } = data;
  const now       = new Date();
  const generated = now.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  const footLeft  = `Cyber Sentinel · Penetration Test Report`;

  const findings   = [...(scan.findings ?? [])].sort((a, b) => (SEV_ORDER[a.severity ?? "info"] ?? 5) - (SEV_ORDER[b.severity ?? "info"] ?? 5));
  const sevCounts  = countBySev(findings);
  const riskScore  = scan.risk_score ?? 0;
  const riskPct    = Math.min(100, (riskScore / 10) * 100);
  const rc         = riskColor(riskScore);
  const rl         = riskLabel(riskScore);
  const riskBg     = riskSoftBg(riskScore);
  const duration   = durationLabel(scan.created_at, scan.completed_at);
  const scanLabel  = SCAN_TYPE_LABELS[scan.scan_type ?? ""] ?? scan.scan_type ?? "Scan";

  const sevStripHtml = (["critical", "high", "medium", "low", "info"] as const).map(sev => {
    const cnt = sevCounts[sev];
    return cnt > 0
      ? `<span style="background:${SEV_COLOR[sev]};flex:${cnt}">${cnt} ${sev}</span>`
      : `<span class="empty" style="flex:0"></span>`;
  }).join("");

  const aiSections  = parseAiSections(scan.ai_summary);
  const remSections = parseAiSections(scan.ai_remediation);
  const allAi       = [...aiSections, ...remSections];

  const findingChunks  = chunk(findings, FINDINGS_PER_PAGE);
  const aiGroups       = chunk(allAi, AI_PER_PAGE);
  const actionFindings = findings.filter(f => f.remediation_steps?.length || f.plain_english);
  const fixChunks      = chunk(actionFindings, FIX_PER_PAGE);

  const hasOwasp = findings.some(f => f.owasp_category);

  /* ── page counter ── */
  let pn = 0;
  const p = () => `${++pn}`;
  const pages: string[] = [];

  /* ─────────────────────────────────────────────
     PAGE 1 · COVER
  ───────────────────────────────────────────── */
  pages.push(`<div class="page cover-page">
  <div class="cover">
    <div class="cover-top">
      <div class="brand"><div class="mark"></div><b>Cyber Sentinel</b></div>
      <div class="confidential">CONFIDENTIAL · RESTRICTED DISTRIBUTION</div>
    </div>
    <div class="cover-rule"></div>
    <div class="cover-body">
      <div class="cover-eyebrow">PENETRATION TEST REPORT · ${esc(formatDate(scan.created_at))}</div>
      <h1>Security<br><span class="accent">assessment.</span></h1>
      <div class="target-row">
        <div class="label">Target</div>
        <div class="target">${esc(scan.target)}</div>
      </div>
      <div class="cover-meta">
        <div><div class="label">Scan Type</div><div class="value">${esc(scanLabel)}</div></div>
        <div><div class="label">Duration</div><div class="value mono">${esc(duration)}</div></div>
        <div><div class="label">Risk Score</div><div class="value mono" style="color:${rc}">${riskScore.toFixed(1)} / 10</div></div>
        <div><div class="label">Findings</div><div class="value mono">${findings.length}</div></div>
      </div>
      <div class="cover-foot">
        <span>SMART CITY &amp; CYBERSECURITY LAB · INSTITUT TEKNOLOGI SEPULUH NOPEMBER</span>
        <span>sentinel-engine · v1.0.0</span>
      </div>
    </div>
  </div>
</div>`);
  pn = 1;

  /* ─────────────────────────────────────────────
     PAGE 2 · OVERVIEW — metadata + risk + TOC
  ───────────────────────────────────────────── */
  const pg2 = p();
  pages.push(`<div class="page">
  ${pgHeader(generated)}
  ${eyebrow("01 — Overview")}
  <h2>Scan metadata</h2>
  <div class="meta-grid">
    <div class="meta-cell" style="grid-column:span 3">
      <div class="label">Target URL</div><div class="value mono">${esc(scan.target)}</div>
    </div>
    <div class="meta-cell"><div class="label">Scan Type</div><div class="value">${esc(scanLabel)}</div></div>
    <div class="meta-cell"><div class="label">Generated</div><div class="value mono">${esc(generated)}</div></div>
    <div class="meta-cell"><div class="label">Duration</div><div class="value mono">${esc(duration)}</div></div>
    <div class="meta-cell"><div class="label">Risk Score</div><div class="value mono" style="color:${rc}">${riskScore.toFixed(1)} / 10.0</div></div>
    <div class="meta-cell"><div class="label">Status</div><div class="value"><span class="badge dot" style="background:rgba(22,163,74,0.10);color:#16a34a">${esc(scan.status?.toUpperCase() ?? "COMPLETED")}</span></div></div>
    <div class="meta-cell"><div class="label">Methodology</div><div class="value">OWASP Top 10 · 2025</div></div>
  </div>
  ${eyebrow("Risk level")}
  <h2>Overall risk · ${esc(rl.replace(" RISK", ""))}</h2>
  <div class="risk-block">
    <div class="risk-row-inner">
      <div class="risk-num" style="color:${rc}">${riskScore.toFixed(1)}<span class="denom"> / 10</span></div>
      <div class="risk-label-wrap">
        <span class="risk-tag" style="background:${riskBg};color:${rc}">${esc(rl)}</span>
        <div class="risk-desc">${findings.length} findings across ${Object.values(sevCounts).filter(Boolean).length} severity levels.</div>
      </div>
    </div>
    <div class="risk-bar" style="--risk-pct:${riskPct.toFixed(1)}%;color:${rc}"></div>
    <div class="risk-legend"><span style="color:${SEV_COLOR.low};font-weight:600">LOW</span><span>MODERATE</span><span>HIGH</span><span>CRITICAL</span></div>
  </div>
  ${eyebrow("Contents")}
  <h2 style="margin-bottom:10px">In this report</h2>
  <div class="toc">
    <div class="toc-row"><span class="ix">01</span><span>Scan metadata &amp; risk overview</span><span class="pg">p. ${pg2}</span></div>
    <div class="toc-row"><span class="ix">02</span><span>Finding summary &amp; severity distribution</span><span class="pg">p. ${pn + 1}</span></div>
    ${hasOwasp ? `<div class="toc-row"><span class="ix">03</span><span>OWASP Top 10 · 2025 distribution</span><span class="pg">p. ${pn + 2}</span></div>` : ""}
    <div class="toc-row"><span class="ix">${hasOwasp ? "04" : "03"}</span><span>Findings register (${findings.length} findings)</span><span class="pg">p. —</span></div>
    ${allAi.length ? `<div class="toc-row"><span class="ix">—</span><span>AI analysis &amp; recommendations</span><span class="pg">p. —</span></div>` : ""}
    ${actionFindings.length ? `<div class="toc-row"><span class="ix">—</span><span>Per-finding remediation guide</span><span class="pg">p. —</span></div>` : ""}
  </div>
  ${pgFooter(footLeft, pg2)}
</div>`);

  /* ─────────────────────────────────────────────
     PAGE 3 · FINDING SUMMARY + TOOL COVERAGE
  ───────────────────────────────────────────── */
  pages.push(`<div class="page">
  ${pgHeader(generated)}
  ${eyebrow("02 — Finding summary")}
  <h2>Severity distribution</h2>
  <p class="lead">${findings.length} findings across ${Object.values(sevCounts).filter(Boolean).length} severity levels.</p>
  <div class="kpi-row">
    ${(["critical","high","medium","low","info"] as const).map(sev =>
      `<div class="kpi" style="--bar:${SEV_COLOR[sev]}">
        <div class="label">${sev.charAt(0).toUpperCase() + sev.slice(1)}</div>
        <div class="value">${sevCounts[sev]}</div>
        <div class="action">${SLA_LABEL[sev]}</div>
      </div>`
    ).join("")}
  </div>
  <div class="sev-strip">${sevStripHtml}</div>
  <div class="sev-legend">
    ${(["critical","high","medium","low","info"] as const).map(sev =>
      `<span class="item"><span class="swatch" style="background:${SEV_COLOR[sev]}"></span>${sev.charAt(0).toUpperCase() + sev.slice(1)}</span>`
    ).join("")}
    <span class="item" style="margin-left:auto">${findings.length} total</span>
  </div>
  ${eyebrow("03 — Tool coverage")}
  <h2>${scan.tool_events?.length ?? 0} scanner modules</h2>
  <div class="tbl-card">
    <table>
      <thead><tr><th>Module</th><th>Status</th><th style="text-align:right">Findings</th><th>Elapsed</th></tr></thead>
      <tbody>${toolRows(scan.tool_events)}</tbody>
    </table>
  </div>
  ${pgFooter(footLeft, p())}
</div>`);

  /* ─────────────────────────────────────────────
     PAGE 4 (optional) · OWASP DISTRIBUTION
  ───────────────────────────────────────────── */
  if (hasOwasp) {
    pages.push(`<div class="page">
  ${pgHeader(generated)}
  ${eyebrow("04 — OWASP Top 10 · 2025")}
  <h2>Distribution by category</h2>
  <p class="lead">Findings mapped to the OWASP Top 10 · 2025 framework.</p>
  <div class="owasp-list">${owaspList(findings)}</div>
  ${pgFooter(footLeft, p())}
</div>`);
  }

  /* ─────────────────────────────────────────────
     PAGES · FINDINGS REGISTER (paginated)
  ───────────────────────────────────────────── */
  if (findings.length === 0) {
    pages.push(`<div class="page">
  ${pgHeader(generated)}
  ${eyebrow(`${hasOwasp ? "05" : "04"} — Findings register`)}
  <h2>No findings recorded</h2>
  ${pgFooter(footLeft, p())}
</div>`);
  } else {
    findingChunks.forEach((ch, ci) => {
      const isFirst = ci === 0;
      const sectionNum = hasOwasp ? "05" : "04";
      pages.push(`<div class="page">
  ${pgHeader(generated)}
  ${isFirst ? eyebrow(`${sectionNum} — Findings register`) : `<div class="eyebrow" style="color:var(--ink-3)">Findings register (continued)</div>`}
  ${isFirst ? `<h2>All findings · sorted by severity</h2>` : ""}
  <div class="tbl-card">
    <table>
      <thead><tr>
        <th style="width:32px;text-align:right">#</th>
        <th style="width:90px">Severity</th>
        <th>Finding</th>
        <th style="width:130px">Tool</th>
        <th style="width:140px">OWASP</th>
        <th style="width:80px">Confidence</th>
      </tr></thead>
      <tbody>${findingRows(ch, ci * FINDINGS_PER_PAGE)}</tbody>
    </table>
  </div>
  ${pgFooter(footLeft, p())}
</div>`);
    });
  }

  /* ─────────────────────────────────────────────
     PAGES · AI ANALYSIS (paginated)
  ───────────────────────────────────────────── */
  if (allAi.length > 0) {
    aiGroups.forEach((group, gi) => {
      const isFirst = gi === 0;
      pages.push(`<div class="page">
  ${pgHeader(generated)}
  ${isFirst ? eyebrow("AI analysis &amp; recommendations") : `<div class="eyebrow" style="color:var(--ink-3)">AI analysis (continued)</div>`}
  ${isFirst ? `<h2>Engagement narrative</h2>` : ""}
  ${group.map(({ title, body }, li) => {
    const globalIx = gi * AI_PER_PAGE + li + 1;
    return `<section class="ai-section">
      <div class="ai-head">
        <div class="ix">${String(globalIx).padStart(2, "0")}</div>
        <h3>${esc(title)}</h3>
        <span class="pill">AI GENERATED</span>
      </div>
      <div class="ai-body">${nl2p(body)}</div>
    </section>`;
  }).join("")}
  ${pgFooter(footLeft, p())}
</div>`);
    });
  }

  /* ─────────────────────────────────────────────
     PAGES · REMEDIATION CARDS (paginated)
  ───────────────────────────────────────────── */
  if (actionFindings.length > 0) {
    fixChunks.forEach((ch, ci) => {
      const isFirst = ci === 0;
      pages.push(`<div class="page">
  ${pgHeader(generated)}
  ${isFirst ? eyebrow("Per-finding remediation guide") : `<div class="eyebrow" style="color:var(--ink-3)">Remediation guide (continued)</div>`}
  ${isFirst ? `<h2>Step-by-step fixes · sorted by severity</h2>` : ""}
  ${ch.map((f, li) => {
    const globalIx = ci * FIX_PER_PAGE + li + 1;
    const c   = SEV_COLOR[f.severity?.toLowerCase() ?? "info"] ?? "#475569";
    const steps = (f.remediation_steps ?? []).filter(Boolean);
    return `<div class="fix-card" style="border-left-color:${c}">
      <div class="fix-head">
        ${badge(f.severity ?? "info")}
        <span class="fix-title">${esc(f.name)}</span>
        <span style="font-family:var(--font-mono);font-size:7.5pt;color:var(--ink-4)">#${globalIx}</span>
      </div>
      <div class="fix-meta">
        <div><div class="k">Severity</div><div class="v">${esc(f.severity ?? "—")}</div></div>
        <div><div class="k">Confidence</div><div class="v">${esc(f.confidence ?? "—")}</div></div>
        <div><div class="k">OWASP</div><div class="v">${esc(f.owasp_category ?? "—")}</div></div>
      </div>
      ${(f.affected_url || f.matched_at) ? `<div class="fix-loc">${esc(f.affected_url || f.matched_at)}</div>` : ""}
      ${f.plain_english ? `<p style="font-size:9pt;color:var(--ink-2);margin-bottom:8px">${esc(f.plain_english)}</p>` : ""}
      ${steps.length ? `<div class="fix-steps"><ol>${steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>` : ""}
    </div>`;
  }).join("")}
  ${pgFooter(footLeft, p())}
</div>`);
    });
  }

  /* ── Assemble ── */
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Cyber Sentinel — Penetration Test Report</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Instrument+Serif&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<button class="no-print" onclick="window.print()" style="position:fixed;bottom:20px;right:20px;background:#18181b;color:white;border:0;border-radius:8px;padding:10px 20px;font-size:12px;font-weight:500;cursor:pointer;z-index:100;box-shadow:0 8px 20px -8px rgba(0,0,0,0.4);font-family:sans-serif">Print / Save PDF</button>
${pages.join("\n")}
</body>
</html>`;
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

export async function exportScanReportPDF(data: ScanReportData): Promise<void> {
  const html = buildHtml(data);
  const slug = data.scan.id?.slice(0, 8) ?? new Date().toISOString().slice(0, 10);
  await downloadPDF(html, `cyber-sentinel-report-${slug}`);
}
