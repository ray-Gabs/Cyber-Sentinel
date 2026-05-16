import type { AlertStats } from "@/types";
import type { PentestAnalytics } from "@/services/analyticsService";
import { downloadPDF } from "@/lib/pdfDownload";

export interface AnalyticsExportData {
  range: string;
  alertStats: AlertStats;
  pentest?: PentestAnalytics | null;
}

function esc(s: string | number | undefined | null): string {
  return String(s ?? "—")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function row(label: string, value: string | number): string {
  return `<tr><td class="l">${esc(label)}</td><td class="v">${esc(value)}</td></tr>`;
}

function section(title: string, rows: string): string {
  return `<div class="section">
    <div class="section-hd">${esc(title)}</div>
    <table>${rows}</table>
  </div>`;
}

function buildHtml(data: AnalyticsExportData): string {
  const { range, alertStats, pentest } = data;
  const now = new Date();
  const dateStr = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  const byVerdict = alertStats.by_verdict ?? {};
  const byAction  = alertStats.by_action  ?? {};
  const sevMap    = (pentest?.findings_by_severity ?? {}) as Record<string, number>;

  const tp         = byVerdict["TRUE_POSITIVE"]  ?? 0;
  const fp         = byVerdict["FALSE_POSITIVE"] ?? 0;
  const escalated  = byAction["ESCALATE"]        ?? 0;

  const socRows = [
    row("Total Alerts",    alertStats.total ?? 0),
    row("True Positives",  tp),
    row("False Positives", fp),
    row("Escalated",       escalated),
    row("Unknown",         byVerdict["UNKNOWN"]    ?? 0),
    row("Unanalyzed",      byVerdict["UNANALYZED"] ?? 0),
    row("Monitor Actions", byAction["MONITOR"]     ?? 0),
    row("Dismiss Actions", byAction["DISMISS"]     ?? 0),
  ].join("");

  const pentestRows = pentest ? [
    row("Total Scans",       pentest.total_scans),
    row("Avg Scan Duration", `${pentest.avg_scan_duration_seconds}s`),
    row("Total Alerts",      pentest.total_alerts),
    row("Critical Findings", sevMap["critical"] ?? 0),
    row("High Findings",     sevMap["high"]     ?? 0),
    row("Medium Findings",   sevMap["medium"]   ?? 0),
    row("Low Findings",      sevMap["low"]      ?? 0),
  ].join("") : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Platform Analytics — Cyber Sentinel</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
@page { size: A4 landscape; margin: 0; }
@media print {
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
}
*,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #fff; --paper: #fafaf7; --ink: #18181b; --ink2: #52525b; --ink3: #a1a1aa;
  --border: #e4e4e7; --border2: #f4f4f5; --accent: #2563eb;
}
body { background: var(--bg); color: var(--ink); font-family: 'Inter', system-ui, sans-serif; font-size: 10px; line-height: 1.5; padding: 12mm 14mm 18mm; }
.page-header { display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 10px; border-bottom: 2px solid var(--accent); margin-bottom: 18px; }
.brand { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
.mark { width: 20px; height: 20px; border-radius: 4px; background: linear-gradient(135deg, #2563eb, #1e3a8a); position: relative; flex-shrink: 0; }
.mark::after { content: ''; position: absolute; inset: 5px; background: white; clip-path: polygon(50% 0, 100% 25%, 100% 65%, 50% 100%, 0 65%, 0 25%); }
.brand-name { font-size: 10.5px; font-weight: 700; color: var(--ink); }
.brand-sub  { font-size: 8px; color: var(--ink3); letter-spacing: 0.08em; text-transform: uppercase; }
.doc-eyebrow { font-size: 8px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); margin-bottom: 4px; }
.doc-title { font-size: 18px; font-weight: 800; letter-spacing: -0.025em; }
.doc-sub { font-size: 9px; color: var(--ink2); margin-top: 3px; }
.meta { text-align: right; font-size: 8px; color: var(--ink3); line-height: 1.9; }
.conf-pill { display: inline-block; border: 1px solid var(--border); color: var(--ink2); font-size: 7px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; padding: 2px 7px; border-radius: 3px; margin-bottom: 3px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 4px; }
.section-hd { font-size: 8px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); border-bottom: 1px solid var(--border); padding-bottom: 5px; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; }
td { padding: 6px 8px; border-bottom: 1px solid var(--border2); vertical-align: middle; }
td.l { color: var(--ink2); font-size: 9px; }
td.v { font-weight: 600; font-size: 11px; text-align: right; font-family: 'JetBrains Mono', monospace; }
tr:last-child td { border-bottom: none; }
</style>
</head>
<body>
<div class="page-header">
  <div>
    <div class="brand">
      <div class="mark"></div>
      <div>
        <div class="brand-name">Cyber Sentinel</div>
        <div class="brand-sub">Security Platform</div>
      </div>
    </div>
    <div class="doc-eyebrow">Platform Analytics · ${esc(range)} range</div>
    <div class="doc-title">Analytics Report</div>
    <div class="doc-sub">SOC + Pentest combined metrics · Generated ${esc(dateStr)}</div>
  </div>
  <div class="meta">
    <div class="conf-pill">CONFIDENTIAL</div><br>
    ${esc(dateStr)}
  </div>
</div>

<div class="cols">
  ${section("SOC Alert Metrics", socRows)}
  ${pentest ? section("Pentest Metrics", pentestRows) : ""}
</div>
</body>
</html>`;
}

export async function exportAnalyticsPDF(data: AnalyticsExportData): Promise<void> {
  const html = buildHtml(data);
  await downloadPDF(html, `analytics-report-${data.range}.pdf`);
}
