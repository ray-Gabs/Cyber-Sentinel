export interface PDFColumn {
  key: string;
  label: string;
  isSeverity?: boolean;
}

export type PDFRow = Record<string, string | number | undefined | null>;

export function exportToPDF(
  title: string,
  subtitle: string,
  columns: PDFColumn[],
  rows: PDFRow[],
  filename = "export"
): void {
  const html = buildHTML(title, subtitle, columns, rows);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    URL.revokeObjectURL(url);
    return;
  }
  win.addEventListener("load", () => {
    setTimeout(() => {
      win.document.title = filename;
      win.print();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    }, 250);
  });
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sevBadge(val: string): string {
  const map: Record<string, { bg: string; text: string }> = {
    critical: { bg: "#fef2f2", text: "#dc2626" },
    high:     { bg: "#fff7ed", text: "#c2410c" },
    medium:   { bg: "#fefce8", text: "#a16207" },
    low:      { bg: "#f0fdf4", text: "#15803d" },
    info:     { bg: "#eff6ff", text: "#2563eb" },
  };
  const key = val.toLowerCase();
  const { bg, text } = map[key] ?? { bg: "#f1f5f9", text: "#475569" };
  return `<span style="display:inline-block;padding:2px 9px;border-radius:3px;font-size:9px;font-weight:700;background:${bg};color:${text};text-transform:uppercase;letter-spacing:0.05em">${esc(val)}</span>`;
}

function buildHTML(title: string, subtitle: string, columns: PDFColumn[], rows: PDFRow[]): string {
  const ths = columns.map(c => `<th>${esc(c.label)}</th>`).join("");
  const trs = rows.map(row => {
    const tds = columns.map(col => {
      const val = String(row[col.key] ?? "—");
      return `<td>${col.isSeverity ? sevBadge(val) : esc(val)}</td>`;
    }).join("");
    return `<tr>${tds}</tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm 18mm; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #ffffff;
      color: #0f172a;
      font-family: -apple-system, "Segoe UI", system-ui, Helvetica, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.55;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      padding-bottom: 12px;
      border-bottom: 2px solid #3B82F6;
      margin-bottom: 18px;
    }
    .eyebrow {
      font-size: 9px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #3B82F6;
      font-weight: 700;
      margin-bottom: 5px;
    }
    .title { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: -0.4px; }
    .subtitle { font-size: 11px; color: #64748b; margin-top: 3px; }
    .header-meta {
      text-align: right;
      font-size: 9px;
      color: #94a3b8;
      line-height: 1.7;
    }
    .confidential-badge {
      display: inline-block;
      border: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 2px 8px;
      border-radius: 2px;
      margin-bottom: 5px;
    }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f1f5f9; }
    th {
      color: #334155;
      font-size: 9px;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      font-weight: 700;
      padding: 7px 12px;
      text-align: left;
      border-bottom: 2px solid #e2e8f0;
      white-space: nowrap;
    }
    td {
      padding: 6px 12px;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: top;
      word-break: break-word;
      color: #334155;
      font-size: 10.5px;
    }
    tr:nth-child(even) td { background: #fafafa; }
    .footer {
      margin-top: 18px;
      padding-top: 8px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      font-size: 9px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="eyebrow">Cyber Sentinel Security Platform</div>
      <div class="title">${esc(title)}</div>
      <div class="subtitle">${esc(subtitle)}</div>
    </div>
    <div class="header-meta">
      <div class="confidential-badge">Confidential</div>
      <div>Generated ${new Date().toLocaleString()}</div>
      <div>${rows.length} records</div>
    </div>
  </div>
  <table>
    <thead><tr>${ths}</tr></thead>
    <tbody>${trs}</tbody>
  </table>
  <div class="footer">
    <span>Cyber Sentinel &mdash; Smart City and Cybersecurity Lab &middot; ITS</span>
    <span>${new Date().toLocaleDateString()}</span>
  </div>
</body>
</html>`;
}
