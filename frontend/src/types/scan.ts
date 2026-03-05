/* ── Scan / Pentesting Types ──────────────────────── */

export type ScanType = "quick" | "standard" | "full";
export type ScanStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Finding {
  tool: string;
  name: string;
  severity: Severity;
  description: string;
  evidence?: string;
  location?: string;
  cve_id?: string;
  cvss_score?: number;
  references?: string[];
  remediation?: string;
}

export interface AiReport {
  executive_summary: string;
  risk_score: number;
  recommendations: string[];
}

export interface Scan {
  id: string;
  target: string;
  scan_type: ScanType;
  status: ScanStatus;
  progress: number;
  current_tool?: string;
  started_by: string;
  started_at: string;
  completed_at?: string;
  findings: Finding[];
  ai_report?: AiReport;
  tool_results?: Record<string, unknown>;
}

export interface ScanSummary {
  id: string;
  target: string;
  scan_type: ScanType;
  status: ScanStatus;
  progress: number;
  finding_count: number;
  risk_score?: number;
  started_at: string;
  completed_at?: string;
}

export interface ScanCreateRequest {
  target: string;
  scan_type: ScanType;
}
