/**
 * Alert API service — SOC / Wazuh alert operations.
 */
import api from "./api";
import { getWazuhConfig } from "@/hooks/useWazuhConfig";
import type { Alert, AlertSummary, AlertFilterParams, AlertStats, AnalystOverrideRequest } from "@/types";

/**
 * Build the Wazuh credential headers from the user's saved config.
 * Only non-empty values are included so the backend can fall back to
 * its own .env when the user hasn't configured a personal connection.
 */
function wazuhHeaders(): Record<string, string> {
  const cfg = getWazuhConfig();
  if (!cfg || !cfg.apiUrl.trim()) return {};
  const headers: Record<string, string> = { "X-Wazuh-Url": cfg.apiUrl.trim() };
  if (cfg.username.trim()) headers["X-Wazuh-Username"] = cfg.username.trim();
  if (cfg.password)        headers["X-Wazuh-Password"] = cfg.password;
  return headers;
}

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

/** POST /api/alerts/rules/deploy → deploy custom rules to Wazuh */
export async function deployRules(): Promise<{ message: string }> {
  // Forward the user's personal Wazuh credentials so the backend can deploy
  // to their specific Wazuh instance rather than the server default.
  const res = await api.post<{ message: string }>("/alerts/rules/deploy", undefined, {
    headers: wazuhHeaders(),
  });
  return res.data;
}
