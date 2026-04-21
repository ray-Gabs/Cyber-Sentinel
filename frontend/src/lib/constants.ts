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
  quick: "Crawler + Nmap + Nuclei + SQLi + XSS + Misconfig. ~2-5 min.",
  standard: "All 17 tools including OWASP Top 10:2025 coverage. ~10-20 min.",
  full: "All tools + ZAP active scan for thorough DAST. ~1-2 hours.",
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

/** OWASP Top 10:2025 Categories */
export const OWASP_2025: Record<string, { name: string; color: string }> = {
  "A01:2025": { name: "Broken Access Control", color: "#ef4444" },
  "A02:2025": { name: "Security Misconfiguration", color: "#f97316" },
  "A03:2025": { name: "Software Supply Chain Failures", color: "#eab308" },
  "A04:2025": { name: "Cryptographic Failures", color: "#a855f7" },
  "A05:2025": { name: "Injection", color: "#ec4899" },
  "A06:2025": { name: "Insecure Design", color: "#14b8a6" },
  "A07:2025": { name: "Authentication Failures", color: "#f43f5e" },
  "A08:2025": { name: "Software or Data Integrity Failures", color: "#6366f1" },
  "A09:2025": { name: "Security Logging & Alerting Failures", color: "#64748b" },
  "A10:2025": { name: "Mishandling of Exceptional Conditions", color: "#78716c" },
};

/** Tool display names and OWASP Top 10:2025 mapping */
export const TOOL_INFO: Record<string, { label: string; owasp: string; icon: string; owaspExtra?: string[] }> = {
  crawler:          { label: "Web Crawler",        owasp: "Recon",     icon: "Bug" },
  fingerprint:      { label: "Fingerprinter",      owasp: "Recon",     icon: "Search" },
  nmap:             { label: "Nmap Port Scan",     owasp: "Recon",     icon: "Radar" },
  nuclei:           { label: "Nuclei Scanner",     owasp: "A02:2025",  icon: "Atom", owaspExtra: ["A09:2025"] },
  sslyze:           { label: "SSL/TLS Analyzer",   owasp: "A04:2025",  icon: "Lock" },
  whatweb:          { label: "WhatWeb",            owasp: "Recon",     icon: "Globe" },
  sqli:             { label: "SQL Injection",      owasp: "A05:2025",  icon: "Database" },
  xss:              { label: "XSS Checker",        owasp: "A05:2025",  icon: "Zap" },
  idor:             { label: "IDOR Checker",       owasp: "A01:2025",  icon: "Unlock" },
  redirect:         { label: "Open Redirect",      owasp: "A01:2025",  icon: "ExternalLink" },
  auth:             { label: "Auth Checker",       owasp: "A07:2025",  icon: "KeyRound" },
  ssrf:             { label: "SSRF Checker",       owasp: "A05:2025",  icon: "Crosshair" },
  misconfig:        { label: "Misconfig Checker",  owasp: "A02:2025",  icon: "Settings", owaspExtra: ["A09:2025"] },
  supply_chain:     { label: "Supply Chain",       owasp: "A03:2025",  icon: "Package" },
  insecure_design:  { label: "Design Checker",     owasp: "A06:2025",  icon: "Layout" },
  integrity:        { label: "Integrity Checker",  owasp: "A08:2025",  icon: "ShieldCheck" },
  error_handling:   { label: "Error Handling",     owasp: "A10:2025",  icon: "AlertOctagon" },
  zap:              { label: "ZAP Active Scan",    owasp: "Full DAST", icon: "Swords" },
  ai_analysis:      { label: "AI Analysis",        owasp: "Summary",   icon: "Sparkles" },
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
  AGENTS: "/agents",
  CORRELATIONS: "/correlations",
  SETTINGS: "/settings",
  ADMIN: "/admin",
  FORGOT_PASSWORD: "/forgot-password",
  RESET_PASSWORD: "/reset-password",
  AUDIT: "/audit",
  ADMIN_NOTIFICATIONS: "/admin/notifications",
  PROJECTS: "/projects",
  SOC_DASHBOARD: "/soc/dashboard",
  SIEM_CONFIG: "/soc/siem-config",
  MITRE: "/mitre",
  DETECTION_RULES: "/detection-rules",
} as const;
