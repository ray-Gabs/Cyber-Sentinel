/* ── App Constants ─────────────────────────────────── */

export const APP_NAME = "Cyber Sentinel";
export const APP_DESCRIPTION = "AI-Powered Pentesting & SOC Platform";

/** localStorage key for JWT token */
export const TOKEN_KEY = "cyber_sentinel_token";

/** API base path (proxied by Vite in dev) */
export const API_BASE = "/api";

/** WebSocket base (proxied by Vite in dev) */
export const WS_BASE = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

/** Scan type labels */
export const SCAN_TYPE_LABELS: Record<string, string> = {
  quick: "Quick Scan",
  standard: "Standard Scan",
  full: "Full Scan",
  custom: "Custom Scan",
};

/** Scan type descriptions */
export const SCAN_TYPE_DESCRIPTIONS: Record<string, string> = {
  quick: "Crawler + Nmap + Nuclei + SQLi + XSS checks. ~2-5 min.",
  standard: "Crawler + Fingerprint + Nmap + Nuclei + SSLyze + WhatWeb + SQLi + XSS + IDOR + Redirect + Auth + SSRF checks. ~10-20 min.",
  full: "All tools including OWASP ZAP active scan. ~1-2 hours.",
  custom: "Pick your own tools for a tailored assessment.",
};

/** Severity order for sorting */
export const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

/** Tool display names and OWASP Top 10 mapping */
export const TOOL_INFO: Record<string, { label: string; owasp: string; icon: string }> = {
  crawler:     { label: "Web Crawler",       owasp: "Recon",                 icon: "Bug" },
  fingerprint: { label: "Fingerprinter",     owasp: "A06 — Vuln Components", icon: "Search" },
  nmap:        { label: "Nmap Port Scan",    owasp: "A05 — Misconfiguration",icon: "Radar" },
  nuclei:      { label: "Nuclei Scanner",    owasp: "A06 — Vuln Components", icon: "Atom" },
  sslyze:      { label: "SSL/TLS Analyzer",  owasp: "A02 — Crypto Failures", icon: "Lock" },
  whatweb:     { label: "WhatWeb",           owasp: "A06 — Vuln Components", icon: "Globe" },
  sqli:        { label: "SQL Injection",     owasp: "A03 — Injection",       icon: "Database" },
  xss:         { label: "XSS Checker",       owasp: "A03 — Injection",       icon: "Zap" },
  idor:        { label: "IDOR Checker",      owasp: "A01 — Broken Access",   icon: "Unlock" },
  redirect:    { label: "Open Redirect",     owasp: "A01 — Broken Access",   icon: "ExternalLink" },
  auth:        { label: "Auth Checker",      owasp: "A07 — Auth Failures",   icon: "KeyRound" },
  ssrf:        { label: "SSRF Checker",      owasp: "A10 — SSRF",            icon: "Crosshair" },
  zap:         { label: "ZAP Active Scan",   owasp: "Full DAST",             icon: "Swords" },
  ai_analysis: { label: "AI Analysis",       owasp: "Summary",               icon: "Sparkles" },
};

/** Navigation routes */
export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",
  DASHBOARD: "/dashboard",
  SCANS: "/scans",
  SCAN_NEW: "/scans/new",
  SCAN_DETAIL: "/scans/:id",
  ALERTS: "/alerts",
  ALERT_DETAIL: "/alerts/:id",
  ANALYTICS: "/analytics",
  CORRELATIONS: "/correlations",
  SETTINGS: "/settings",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
} as const;
