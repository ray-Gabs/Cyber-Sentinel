/* ── SOC / Alert Types ────────────────────────────── */

export type AlertClassification = "TRUE_POSITIVE" | "FALSE_POSITIVE";
export type AlertAction = "ESCALATE" | "MONITOR" | "DISMISS";
export type AlertStatus = "new" | "analysed" | "escalated" | "dismissed" | "overridden";

export interface AiVerdict {
  classification: AlertClassification;
  confidence: number;
  reasoning: string;
  recommended_action: AlertAction;
  analysed_at: string;
}

export interface AnalystOverride {
  classification: AlertClassification;
  notes: string;
  analyst_id: string;
  overridden_at: string;
}

export interface WazuhRule {
  id: number;
  level: number;
  description: string;
  groups?: string[];
}

export interface Alert {
  id: string;
  wazuh_id: string;
  rule_id: number;
  rule_level: number;
  rule_description: string;
  agent_id: string;
  agent_name: string;
  timestamp: string;
  status: AlertStatus;
  ai_verdict?: AiVerdict;
  analyst_override?: AnalystOverride;
  raw?: Record<string, unknown>;
}

export interface AlertSummary {
  id: string;
  wazuh_id: string;
  rule_id: number;
  rule_level: number;
  rule_description: string;
  agent_name: string;
  timestamp: string;
  status: AlertStatus;
  ai_classification?: AlertClassification;
  ai_confidence?: number;
}

export interface AnalystOverrideRequest {
  classification: AlertClassification;
  notes: string;
}

export interface AlertFilterParams {
  status?: AlertStatus;
  min_level?: number;
  agent_id?: string;
  classification?: AlertClassification;
  skip?: number;
  limit?: number;
}
