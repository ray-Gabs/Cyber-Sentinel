/* ── SOC / Alert Types ────────────────────────────── */

export type AlertClassification = "TRUE_POSITIVE" | "FALSE_POSITIVE" | "UNKNOWN";
export type AlertAction = "ESCALATE" | "MONITOR" | "DISMISS";

export interface MitreTechnique {
  tactic: string;
  technique: string;   // e.g. "T1110"
  name: string;        // e.g. "Brute Force"
}

export interface ThreatIntelResult {
  virustotal?: Array<{
    source: string;
    ip?: string;
    domain?: string;
    malicious: number;
    suspicious: number;
    harmless: number;
    reputation?: number;
    country?: string;
    as_owner?: string;
  }>;
  abuseipdb?: Array<{
    source: string;
    ip: string;
    abuse_confidence: number;
    total_reports: number;
    country_code: string;
    isp: string;
    is_tor: boolean;
  }>;
}

export interface AlertIOCs {
  ips?: string[];
  domains?: string[];
  hashes?: string[];
  users?: string[];
  processes?: string[];
  files?: string[];
}

export interface Alert {
  id: string;
  wazuh_id: string;
  timestamp: string;
  agent_id: string;
  agent_name: string;
  agent_ip: string;
  agent_group?: string;
  rule_id: string;
  rule_description: string;
  rule_level: number;
  rule_groups: string[];
  full_log: string;
  data?: Record<string, unknown>;
  ai_verdict?: string;
  ai_confidence?: number;
  ai_action?: string;
  ai_reasoning?: string;
  severity_label?: string;
  analyst_override?: string;
  analyst_notes?: string;
  ingested_at: string;
  analysed_at?: string;
  mitre_tactics?: string[];
  mitre_techniques?: MitreTechnique[];
  threat_intel?: ThreatIntelResult;
  response_recommendations?: string[];
  false_positive_indicators?: string[];
  iocs?: AlertIOCs;
  triage_notes?: string;
  triage_version?: string;
}

export interface AlertSummary {
  id: string;
  wazuh_id: string;
  timestamp: string;
  agent_name: string;
  rule_id: string;
  rule_description: string;
  rule_level: number;
  ai_verdict?: string;
  ai_confidence?: number;
  ai_action?: string;
  analyst_override?: string;
  mitre_techniques?: MitreTechnique[];
  ingested_at: string;
}

export interface AnalystOverrideRequest {
  override: string;
  notes?: string;
}

export interface AlertFilterParams {
  page?: number;
  size?: number;
  rule_level_min?: number;
  ai_verdict?: string;
  agent_name?: string;
  agent_group?: string;
  project_id?: string;
}

export interface DetectionRule {
  id: string;
  user_id: string;
  project_id?: string | null;
  name: string;
  description?: string;
  pattern: string;
  severity: "low" | "medium" | "high" | "critical";
  enabled: boolean;
  created_at: string;
}

export interface DetectionRuleCreate {
  name: string;
  description?: string;
  pattern: string;
  severity: "low" | "medium" | "high" | "critical";
  enabled?: boolean;
  project_id?: string | null;
}

export interface DetectionRuleUpdate {
  name?: string;
  description?: string;
  pattern?: string;
  severity?: "low" | "medium" | "high" | "critical";
  enabled?: boolean;
  project_id?: string | null;
}

export interface AlertStats {
  total: number;
  by_verdict: Record<string, number>;
  by_action: Record<string, number>;
  by_severity: Record<string, number>;
  daily_counts: Array<{ date: string; count: number }>;
  top_rules: Array<{ _id: string; count: number; desc: string }>;
  top_agents: Array<{ _id: string; count: number }>;
}
