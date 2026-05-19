export interface PDFColumn {
  key: string;
  label: string;
  isSeverity?: boolean;
  isVerdict?: boolean;
  isAction?: boolean;
  mono?: boolean;
  width?: string;
}

export type PDFRow = Record<string, string | number | undefined | null>;

export interface PDFSummaryStat {
  label: string;
  value: string | number;
  color?: string;
}

export interface PDFExportOptions {
  title: string;
  subtitle: string;
  columns: PDFColumn[];
  rows: PDFRow[];
  filename?: string;
  landscape?: boolean;
  summaryStats?: PDFSummaryStat[];
}

/** Open a print-ready HTML document for the given data. */
export function exportToPDF(
  title: string,
  subtitle: string,
  columns: PDFColumn[],
  rows: PDFRow[],
  filename = "export"
): void {
  exportToPDFOptions({ title, subtitle, columns, rows, filename });
}

export function exportToPDFOptions(opts: PDFExportOptions): void {
  const { title, subtitle, columns, rows, filename = "export", landscape, summaryStats } = opts;
  const autoLandscape = landscape ?? columns.length > 4;
  const html = buildHTML(title, subtitle, columns, rows, autoLandscape, summaryStats);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const win  = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) { URL.revokeObjectURL(url); return; }
  win.addEventListener("load", () => {
    setTimeout(() => {
      win.document.title = filename;
      win.print();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 300);
  });
}

/* ── Helpers ──────────────────────────────────────────────────────────── */

function esc(s: string | number | undefined | null): string {
  return String(s ?? "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const SEV_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  high:     { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  medium:   { bg: "#fefce8", text: "#a16207", border: "#fde68a" },
  low:      { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  info:     { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe" },
};

const VERDICT_STYLES: Record<string, { bg: string; text: string; border: string; label: string }> = {
  true_positive:  { bg: "#fef2f2", text: "#dc2626", border: "#fecaca", label: "TRUE POSITIVE"  },
  false_positive: { bg: "#fefce8", text: "#a16207", border: "#fde68a", label: "FALSE POSITIVE" },
  unknown:        { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", label: "UNKNOWN"        },
  unanalyzed:     { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0", label: "UNANALYZED"     },
  triage_failed:  { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa", label: "TRIAGE FAILED"  },
};

const ACTION_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  escalate: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  monitor:  { bg: "#fefce8", text: "#a16207", border: "#fde68a" },
  dismiss:  { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
};

function sevBadge(val: string): string {
  const key = val.toLowerCase();
  const s = SEV_STYLES[key] ?? { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:8.5px;font-weight:700;background:${s.bg};color:${s.text};border:1px solid ${s.border};text-transform:uppercase;letter-spacing:0.05em;font-family:'JetBrains Mono',monospace">${esc(val)}</span>`;
}

function verdictBadge(val: string): string {
  const key = val.toLowerCase();
  const s = VERDICT_STYLES[key] ?? VERDICT_STYLES.unknown;
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:8.5px;font-weight:700;background:${s.bg};color:${s.text};border:1px solid ${s.border};text-transform:uppercase;letter-spacing:0.05em;font-family:'JetBrains Mono',monospace">${s.label}</span>`;
}

function actionBadge(val: string): string {
  const key = val.toLowerCase();
  const s = ACTION_STYLES[key] ?? { bg: "#f1f5f9", text: "#475569", border: "#e2e8f0" };
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:8.5px;font-weight:700;background:${s.bg};color:${s.text};border:1px solid ${s.border};text-transform:uppercase;letter-spacing:0.05em;font-family:'JetBrains Mono',monospace">${esc(val)}</span>`;
}

function renderCell(col: PDFColumn, val: string): string {
  if (col.isSeverity) return sevBadge(val);
  if (col.isVerdict)  return verdictBadge(val);
  if (col.isAction)   return actionBadge(val);
  if (col.mono)       return `<span style="font-family:'JetBrains Mono',monospace;font-size:10px">${esc(val)}</span>`;
  return esc(val);
}

function buildSummaryStrip(stats: PDFSummaryStat[]): string {
  if (!stats.length) return "";
  const cells = stats.map(({ label, value, color }) => {
    const c = color ?? "#2563eb";
    return `
      <div style="display:flex;flex-direction:column;gap:3px;padding:10px 16px;border-right:1px solid #e4e4e7;min-width:90px">
        <span style="font-size:8px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:#71717a">${esc(label)}</span>
        <span style="font-size:18px;font-weight:700;color:${c};font-family:'JetBrains Mono',monospace;letter-spacing:-0.02em">${esc(String(value))}</span>
      </div>`;
  }).join("");
  return `
    <div style="display:flex;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden;margin-bottom:16px;background:#fafaf9">
      ${cells}
    </div>`;
}

function buildHTML(
  title: string,
  subtitle: string,
  columns: PDFColumn[],
  rows: PDFRow[],
  landscape: boolean,
  summaryStats?: PDFSummaryStat[],
): string {
  const pageSize = landscape ? "A4 landscape" : "A4 portrait";
  const margin   = landscape ? "12mm 14mm" : "14mm 16mm";

  const ths = columns.map(c => {
    const w = c.width ? `width:${c.width};` : "";
    return `<th style="${w}">${esc(c.label)}</th>`;
  }).join("");

  const trs = rows.map((row, ri) => {
    const bg = ri % 2 === 0 ? "" : `background:#fafaf9`;
    const tds = columns.map(col => {
      const raw = String(row[col.key] ?? "—");
      const cell = renderCell(col, raw);
      return `<td>${cell}</td>`;
    }).join("");
    return `<tr style="${bg}">${tds}</tr>`;
  }).join("");

  const summaryHtml = summaryStats ? buildSummaryStrip(summaryStats) : "";

  const now = new Date();
  const generated = now.toLocaleString("en-US", {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    @page { size: ${pageSize}; margin: ${margin}; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #ffffff;
      color: #18181b;
      font-family: 'Inter', -apple-system, "Segoe UI", system-ui, Helvetica, Arial, sans-serif;
      font-size: 10.5px;
      line-height: 1.55;
    }

    /* ── Header ── */
    .pg-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      padding-bottom: 12px;
      border-bottom: 2px solid #2563eb;
      margin-bottom: 18px;
    }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
    .mark {
      width: 22px; height: 22px; border-radius: 5px;
      background: linear-gradient(135deg, #2563eb, #1e3a8a);
      position: relative; flex-shrink: 0;
    }
    .mark::after {
      content: '';
      position: absolute; inset: 6px;
      background: white;
      clip-path: polygon(50% 0, 100% 25%, 100% 65%, 50% 100%, 0 65%, 0 25%);
    }
    .brand-name { font-size: 11px; font-weight: 700; color: #18181b; letter-spacing: -0.01em; }
    .brand-sub  { font-size: 9px; color: #71717a; letter-spacing: 0.05em; text-transform: uppercase; }

    .doc-title    { font-size: 20px; font-weight: 800; color: #18181b; letter-spacing: -0.025em; line-height: 1.2; }
    .doc-subtitle { font-size: 10.5px; color: #71717a; margin-top: 4px; }
    .doc-eyebrow  {
      font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
      color: #2563eb; margin-bottom: 6px;
    }

    .meta-block { text-align: right; font-size: 8.5px; color: #a1a1aa; line-height: 1.8; }
    .confidential {
      display: inline-block; border: 1px solid #d4d4d8; color: #71717a;
      font-size: 7.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;
      padding: 2px 8px; border-radius: 3px; margin-bottom: 4px;
    }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f4f4f5; }
    th {
      color: #3f3f46; font-size: 8.5px; letter-spacing: 0.07em; text-transform: uppercase;
      font-weight: 700; padding: 7px 12px; text-align: left;
      border-bottom: 2px solid #e4e4e7; white-space: nowrap;
    }
    td {
      padding: 6px 12px; border-bottom: 1px solid #f4f4f5;
      vertical-align: middle; word-break: break-word;
      color: #3f3f46; font-size: 10px;
    }

    /* ── Footer ── */
    .pg-footer {
      margin-top: 20px; padding-top: 8px;
      border-top: 1px solid #e4e4e7;
      display: flex; justify-content: space-between;
      font-size: 8.5px; color: #a1a1aa;
    }
    .pg-footer a { color: #a1a1aa; text-decoration: none; }
  </style>
</head>
<body>

  <div class="pg-header">
    <div>
      <div class="brand">
        <div class="mark"></div>
        <div>
          <div class="brand-name">Cyber Sentinel</div>
          <div class="brand-sub">Security Platform</div>
        </div>
      </div>
      <div class="doc-eyebrow">Smart City and Cybersecurity Lab &middot; ITS</div>
      <div class="doc-title">${esc(title)}</div>
      <div class="doc-subtitle">${esc(subtitle)}</div>
    </div>
    <div class="meta-block">
      <div class="confidential">Confidential</div>
      <div>Generated ${esc(generated)}</div>
      <div>${rows.length.toLocaleString()} records</div>
    </div>
  </div>

  ${summaryHtml}

  <table>
    <thead><tr>${ths}</tr></thead>
    <tbody>${trs}</tbody>
  </table>

  <div class="pg-footer">
    <span>Cyber Sentinel &mdash; Smart City and Cybersecurity Lab &middot; ITS</span>
    <span>${now.toLocaleDateString()}</span>
  </div>

</body>
</html>`;
}
