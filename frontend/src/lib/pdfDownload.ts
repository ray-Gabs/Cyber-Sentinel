/**
 * Send HTML to the backend Playwright renderer and trigger a real .pdf download.
 * No new tab opened — the file lands directly in the user's Downloads folder.
 */
const TOKEN_KEY = "cyber_sentinel_token";
const RENDER_URL = "/api/reports/render-pdf";

export async function downloadPDF(html: string, filename: string): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY) ?? "";

  const res = await fetch(RENDER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: html,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PDF export failed (${res.status}): ${detail}`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
