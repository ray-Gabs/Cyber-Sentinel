/* ── Correlation Engine Types ─────────────────────── */

export interface CorrelationLink {
  finding_tool: string;
  finding_name: string;
  finding_severity: string;
  alert_wazuh_id: string;
  alert_rule_desc: string;
  alert_level: number;
  correlation_type: string; // "ip_match" | "attack_pattern" | "cve_match" | "port_match" | "keyword"
  confidence: number;       // 0-1
}

export interface Correlation {
  id: string;
  scan_id: string;
  scan_target: string;
  links: CorrelationLink[];
  ai_summary?: string;
  created_at: string;
}

export interface CorrelationRunRequest {
  scan_id: string;
}
