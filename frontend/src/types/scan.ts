/* ── Scan / Pentesting Types ──────────────────────── */

export type ScanType = "quick" | "standard" | "full" | "custom";
export type ScanStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type AuthType = "none" | "cookie" | "bearer" | "basic" | "header";

export interface AuthConfig {
  auth_type: AuthType;
  cookies?: string;
  bearer_token?: string;
  basic_username?: string;
  basic_password?: string;
  custom_headers?: Record<string, string>;
  login_url?: string;
  login_data?: Record<string, string>;
}

export interface CVEData {
  cve_id: string;
  description: string;
  cvss_score: number;
  cvss_vector: string;
  cvss_severity: string;
  cwes: string[];
  epss_score?: number;
  epss_percentile?: number;
  references: string[];
}

export interface Finding {
  tool: string;
  name: string;
  severity: Severity;
  description: string;
  matched_at?: string;        // URL or host:port where found
  template_id?: string;       // Nuclei template ID
  reference?: string[];       // CVE links, references
  references?: string[];      // Additional references (rich findings)
  cve_data?: CVEData[];       // NVD CVE + EPSS enrichment
  owasp_category?: string;    // OWASP 2025 category e.g. "A05:2025"
  raw?: Record<string, unknown>;

  // ── Precise location ──────────────────────────────────
  affected_url?: string;
  affected_parameter?: string;
  http_method?: string;
  injection_point?: string;
  line_number?: number;

  // ── Evidence ──────────────────────────────────────────
  request_snippet?: string;
  response_snippet?: string;
  evidence?: string;

  // ── Audience-specific context ─────────────────────────
  plain_english?: string;        // Jargon-free explanation for non-technical users
  technical_detail?: string;     // Precise technical detail for developers / pentesters
  business_impact?: string;      // Business risk framing for stakeholders

  // ── Remediation ───────────────────────────────────────
  remediation_steps?: string[];
  remediation_code?: string;
  remediation_priority?: string; // "immediate" | "high" | "medium" | "low"

  // ── Confidence ────────────────────────────────────────
  confidence?: "Confirmed" | "Likely" | "Possible";
}

export interface ToolEvent {
  tool: string;
  status: "completed" | "failed" | "timeout" | "skipped";
  findings_count: number;
  elapsed_seconds: number;
  error: string | null;
  timestamp: string;
}

export interface Scan {
  id: string;
  target: string;
  scan_type: ScanType;
  status: ScanStatus;
  progress: number;
  finding_count: number;
  risk_score?: number;
  current_stage?: string;
  completed_tools?: string[];
  failed_tools?: string[];
  tool_events?: ToolEvent[];
  scan_coverage?: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  findings: Finding[];
  ai_summary?: string;
  ai_remediation?: string;
  crawler_raw?: Record<string, unknown>;
  fingerprint_raw?: Record<string, unknown>;
  nmap_raw?: Record<string, unknown>;
  nuclei_raw?: Record<string, unknown>[];
  zap_raw?: Record<string, unknown>;
  sslyze_raw?: Record<string, unknown>;
  whatweb_raw?: Record<string, unknown>;
  error_message?: string;
  auth_config?: AuthConfig;
}

export interface ScanSummary {
  id: string;
  target: string;
  scan_type: ScanType;
  status: ScanStatus;
  progress: number;
  finding_count: number;
  risk_score?: number;
  current_stage?: string;
  completed_tools?: string[];
  created_at: string;
  completed_at?: string;
}

export interface ScanCreateRequest {
  target: string;
  scan_type: ScanType;
  tools_enabled?: string[];
  auth_config?: AuthConfig;
}
