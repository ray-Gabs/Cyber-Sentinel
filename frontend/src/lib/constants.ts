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
export const TOOL_INFO: Record<string, { label: string; desc: string; owasp: string; icon: string; owaspExtra?: string[] }> = {
  crawler:          { label: "Web Crawler",        desc: "Maps URLs, forms, and JS routes",         owasp: "Recon",     icon: "Bug" },
  fingerprint:      { label: "Fingerprinter",      desc: "Detects CMS, frameworks, and server info", owasp: "Recon",     icon: "Search" },
  nmap:             { label: "Nmap Port Scan",     desc: "Discovers open ports and services",        owasp: "Recon",     icon: "Radar" },
  nuclei:           { label: "Nuclei Scanner",     desc: "Template-based CVE and vuln detection",    owasp: "A02:2025",  icon: "Atom", owaspExtra: ["A09:2025"] },
  sslyze:           { label: "SSL/TLS Analyzer",   desc: "Checks certs, ciphers, and TLS config",    owasp: "A04:2025",  icon: "Lock" },
  whatweb:          { label: "WhatWeb",            desc: "Identifies web tech stack versions",        owasp: "Recon",     icon: "Globe" },
  sqli:             { label: "SQL Injection",      desc: "Tests input fields for SQL injection",      owasp: "A05:2025",  icon: "Database" },
  xss:              { label: "XSS Checker",        desc: "Probes for cross-site scripting vectors",   owasp: "A05:2025",  icon: "Zap" },
  idor:             { label: "IDOR Checker",       desc: "Tests object references for access bypass", owasp: "A01:2025",  icon: "Unlock" },
  redirect:         { label: "Open Redirect",      desc: "Finds unvalidated URL redirect params",     owasp: "A01:2025",  icon: "ExternalLink" },
  auth:             { label: "Auth Checker",       desc: "Tests login, session, and token security",  owasp: "A07:2025",  icon: "KeyRound" },
  ssrf:             { label: "SSRF Checker",       desc: "Detects server-side request forgery",       owasp: "A05:2025",  icon: "Crosshair" },
  misconfig:        { label: "Misconfig Checker",  desc: "Flags exposed headers and default configs", owasp: "A02:2025",  icon: "Settings", owaspExtra: ["A09:2025"] },
  supply_chain:     { label: "Supply Chain",       desc: "Audits third-party scripts and CDN deps",   owasp: "A03:2025",  icon: "Package" },
  insecure_design:  { label: "Design Checker",     desc: "Reviews for insecure architectural patterns", owasp: "A06:2025", icon: "Layout" },
  integrity:        { label: "Integrity Checker",  desc: "Verifies resource hashes and CSP headers",  owasp: "A08:2025",  icon: "ShieldCheck" },
  error_handling:   { label: "Error Handling",     desc: "Checks for verbose error and stack leaks",  owasp: "A10:2025",  icon: "AlertOctagon" },
  subdomain_enum:   { label: "Subdomain Enum",     desc: "Enumerates subdomains via DNS brute-force", owasp: "Recon",     icon: "Network" },
  dir_brute:        { label: "Dir Bruter",         desc: "Discovers hidden paths and endpoints",      owasp: "Recon",     icon: "FolderSearch" },
  zap:              { label: "ZAP Active Scan",    desc: "Full DAST scan via OWASP ZAP daemon",       owasp: "Full DAST", icon: "Swords" },
  ai_analysis:      { label: "AI Analysis",        desc: "Generates narrative report with Claude",    owasp: "Summary",   icon: "Sparkles" },
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
