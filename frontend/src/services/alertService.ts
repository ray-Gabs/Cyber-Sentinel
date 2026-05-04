/**
 * Alert API service — SOC / Wazuh alert operations.
 */
import api from "./api";
import type { Alert, AlertSummary, AlertFilterParams, AlertStats, AnalystOverrideRequest, DetectionRule, DetectionRuleCreate, DetectionRuleUpdate } from "@/types";

/** GET /api/alerts/ → list alerts with optional filters */
export async function getAlerts(
  params: AlertFilterParams = {}
): Promise<AlertSummary[]> {
  const query: Record<string, unknown> = {};
  if (params.page) query.page = params.page;
  if (params.size) query.size = params.size;
  if (params.rule_level_min != null) query.rule_level_min = params.rule_level_min;
  if (params.ai_verdict) query.ai_verdict = params.ai_verdict;
  if (params.agent_name) query.agent_name = params.agent_name;
  if (params.agent_group) query.agent_group = params.agent_group;
  if (params.project_id) query.project_id = params.project_id;
  const res = await api.get<AlertSummary[]>("/alerts/", { params: query });
  return res.data;
}

/** GET /api/alerts/:id → get full alert details + AI verdict */
export async function getAlert(id: string): Promise<Alert> {
  const res = await api.get<Alert>(`/alerts/${id}`);
  return res.data;
}

/** PATCH /api/alerts/:id/override → analyst overrides the AI verdict */
export async function overrideAlert(
  id: string,
  data: AnalystOverrideRequest
): Promise<Alert> {
  const res = await api.patch<Alert>(`/alerts/${id}/override`, data);
  return res.data;
}

/** POST /api/alerts/:id/enrich → run threat intel enrichment */
export async function enrichAlert(id: string): Promise<Alert> {
  const res = await api.post<Alert>(`/alerts/${id}/enrich`);
  return res.data;
}

/** GET /api/alerts/stats/summary → aggregated alert statistics */
export async function getAlertStats(): Promise<AlertStats> {
  const res = await api.get<AlertStats>("/alerts/stats/summary");
  return res.data;
}

/** GET /api/alerts/rules/custom → get custom SIEM rules */
export async function getCustomRules(): Promise<string> {
  const res = await api.get<string>("/alerts/rules/custom");
  return res.data;
}

export interface WazuhAgent {
  id: string;
  name: string;
  ip?: string;
  status: string;
  os?: { name?: string; platform?: string; version?: string };
  version?: string;
  lastKeepAlive?: string;
  dateAdd?: string;
  group?: string[];
  node_name?: string;
}

/** GET /api/alerts/agents → list all registered Wazuh agents */
export async function getWazuhAgents(): Promise<{ agents: WazuhAgent[]; total: number }> {
  const res = await api.get<{ agents: WazuhAgent[]; total: number }>("/alerts/agents");
  return res.data;
}

/* ── Per-user Wazuh Forwarder Token ───────────────── */

export interface WazuhTokenInfo {
  token: string;
  webhook_url: string;
  instructions: string;
  min_level?: number | null;
  agent_group?: string | null;
}

/** GET /api/alerts/tenant/token → get current user's forwarder token + setup info */
export async function getWazuhToken(): Promise<WazuhTokenInfo> {
  const res = await api.get<WazuhTokenInfo>("/alerts/tenant/token");
  return res.data;
}

/** POST /api/alerts/tenant/token → create or rotate the forwarder token */
export async function generateWazuhToken(): Promise<WazuhTokenInfo> {
  const res = await api.post<WazuhTokenInfo>("/alerts/tenant/token");
  return res.data;
}

/** PATCH /api/alerts/tenant/settings → update per-user min alert level and agent group */
export async function updateTenantSettings(data: { wazuh_min_level?: number; wazuh_agent_group?: string }): Promise<void> {
  await api.patch("/alerts/tenant/settings", data);
}

/* ── Detection Rules CRUD ──────────────────────────── */

/** GET /api/alerts/detection-rules → list current user's detection rules */
export async function listDetectionRules(): Promise<DetectionRule[]> {
  const res = await api.get<DetectionRule[]>("/alerts/detection-rules");
  return res.data;
}

/** POST /api/alerts/detection-rules → create a new detection rule */
export async function createDetectionRule(data: DetectionRuleCreate): Promise<DetectionRule> {
  const res = await api.post<DetectionRule>("/alerts/detection-rules", data);
  return res.data;
}

/** PUT /api/alerts/detection-rules/:id → update an existing detection rule */
export async function updateDetectionRule(id: string, data: DetectionRuleUpdate): Promise<DetectionRule> {
  const res = await api.put<DetectionRule>(`/alerts/detection-rules/${id}`, data);
  return res.data;
}

/** DELETE /api/alerts/detection-rules/:id → delete a single detection rule */
export async function deleteDetectionRule(id: string): Promise<void> {
  await api.delete(`/alerts/detection-rules/${id}`);
}

/* ── Playbook Engine ───────────────────────────────── */

export interface PlaybookAction {
  step: number;
  action_type: string;
  description: string;
  automated: boolean;
  executed: boolean;
  executed_at: string | null;
  result: string | null;
  parameters: Record<string, unknown>;
}

export interface PlaybookExecution {
  id: string;
  alert_id: string;
  playbook_name: string;
  trigger_rule: string;
  status: string;
  actions: PlaybookAction[];
  created_at: string;
  completed_at: string | null;
}

/** GET /api/alerts/:id/playbooks → list executions for this alert */
export async function getAlertPlaybooks(alertId: string): Promise<PlaybookExecution[]> {
  const res = await api.get<PlaybookExecution[]>(`/alerts/${alertId}/playbooks`);
  return res.data;
}

/* ── MITRE ATT&CK ─────────────────────────────────── */

export interface MitreSummary {
  by_tactic: Record<string, Record<string, number>>;
  total_technique_hits: number;
  alerts_analyzed: number;
}

/** GET /api/alerts/mitre-summary → tactic/technique frequency from last 2000 alerts */
export async function getMitreSummary(): Promise<MitreSummary> {
  const res = await api.get<MitreSummary>("/alerts/mitre-summary");
  return res.data;
}

/** GET /api/alerts/:id/raw-wazuh → fetch original alert payload from Wazuh Manager */
export async function getAlertRawWazuh(id: string): Promise<{ alert: Record<string, unknown> }> {
  const res = await api.get<{ alert: Record<string, unknown> }>(`/alerts/${id}/raw-wazuh`);
  return res.data;
}

/** POST /api/alerts/:id/playbooks/trigger → manually trigger a playbook */
export async function triggerPlaybook(
  alertId: string,
  playbookId?: string
): Promise<PlaybookExecution> {
  const params = playbookId ? { playbook_id: playbookId } : {};
  const res = await api.post<PlaybookExecution>(
    `/alerts/${alertId}/playbooks/trigger`,
    null,
    { params }
  );
  return res.data;
}
