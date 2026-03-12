/* ── Scan / Pentesting Types ──────────────────────── */

export type ScanType = "quick" | "standard" | "full" | "custom";
export type ScanStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

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
  cve_data?: CVEData[];       // NVD CVE + EPSS enrichment
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
}
