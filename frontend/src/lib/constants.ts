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
};

/** Scan type descriptions */
export const SCAN_TYPE_DESCRIPTIONS: Record<string, string> = {
  quick: "Nmap (top 100 ports) + Nuclei (tech + misconfig). ~2-5 min.",
  standard: "Nmap + Nuclei (full templates) + SSLyze + WhatWeb. ~10-20 min.",
  full: "All tools including OWASP ZAP active scan. ~1-2 hours.",
};

/** Severity order for sorting */
export const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
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
  SETTINGS: "/settings",
} as const;
