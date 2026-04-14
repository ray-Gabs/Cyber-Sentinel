/**
 * socService.ts — SOC Projects, SIEM Config, Agent Status, Dashboard API calls.
 * All endpoints are under /api/soc (mounted at /api/soc in backend main.py).
 */
import api from "./api";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SocProject {
  id: string;
  name: string;
  slug: string;
  target_url: string;
  description?: string;
  wazuh_agent_registered: boolean;
  wazuh_agent_id?: string;
  wazuh_agent_name?: string;
  created_at: string;
}

export interface CustomRule {
  id: string;
  name: string;
  description: string;
  xml_content: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SiemConfig {
  project_id: string;
  custom_rules: CustomRule[];
  rules_last_pushed?: string;
  rules_push_status?: string;
}

export interface AgentStatus {
  agent_name: string;
  wazuh_agent_id?: string;
  status: "connected" | "disconnected" | "never_registered" | "unknown";
  last_seen?: string;
  os?: string;
  os_version?: string;
  ip?: string;
  wazuh_version?: string;
  manager_reachable: boolean;
  alerts_today?: number;
  alerts_last_24h?: number;
  last_alert_at?: string;
  rule_push_status?: string;
  health_issues: string[];
  message?: string;
  error?: string;
}

export interface SocHealth {
  manager_reachable: boolean;
  manager_host: string;
  total_registered_agents?: number;
  active_agents?: number;
  disconnected_agents?: number;
  error?: string;
}

export interface DashboardSummary {
  total_agents: number;
  active_agents: number;
  disconnected_agents: number;
  alerts_today: number;
  critical_unread: number;
  high_unread: number;
}

export interface PerProjectEntry {
  project_id: string;
  project_name: string;
  agent_name: string;
  agent_status: string;
  agent_ip?: string;
  alerts_today: number;
  critical_today: number;
  last_alert_at?: string;
  health_issues: string[];
}

export interface RecentAlert {
  id: string;
  wazuh_id: string;
  agent_name: string;
  project_name: string;
  rule_description: string;
  rule_level: number;
  severity: string;
  timestamp: string;
  ai_verdict?: string;
  ai_action?: string;
}

export interface SystemNotification {
  level: "error" | "warning" | "info";
  project_id?: string;
  project_name?: string;
  message: string;
  action?: string;
}

export interface SocDashboard {
  summary: DashboardSummary;
  alerts_by_severity: Record<string, number>;
  per_project: PerProjectEntry[];
  recent_alerts: RecentAlert[];
  system_notifications: SystemNotification[];
}

export interface XmlCandidate {
  name: string;
  description: string;
  xml_content: string;
  enabled: boolean;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function getSocProjects(): Promise<SocProject[]> {
  const res = await api.get<SocProject[]>("/soc/");
  return res.data;
}

export async function createSocProject(data: {
  name: string;
  target_url: string;
  description?: string;
}): Promise<SocProject> {
  const res = await api.post<SocProject>("/soc/", data);
  return res.data;
}

export async function deleteSocProject(projectId: string): Promise<void> {
  await api.delete(`/soc/${projectId}`);
}

// ── SOC Health ────────────────────────────────────────────────────────────────

export async function getSocHealth(): Promise<SocHealth> {
  const res = await api.get<SocHealth>("/soc/health");
  return res.data;
}

// ── SOC Dashboard ─────────────────────────────────────────────────────────────

export async function getSocDashboard(): Promise<SocDashboard> {
  const res = await api.get<SocDashboard>("/soc/dashboard");
  return res.data;
}

// ── Agent Status ──────────────────────────────────────────────────────────────

export async function getAgentStatus(projectId: string): Promise<AgentStatus> {
  const res = await api.get<AgentStatus>(`/soc/${projectId}/agent-status`);
  return res.data;
}

export async function downloadAgentCompose(
  projectId: string,
  slug: string
): Promise<void> {
  const res = await api.get(`/soc/${projectId}/agent-compose`, {
    responseType: "blob",
  });
  const url = URL.createObjectURL(new Blob([res.data as BlobPart]));
  const a = document.createElement("a");
  a.href = url;
  a.download = `wazuh-agent-${slug}.yml`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── SIEM Config ───────────────────────────────────────────────────────────────

export async function getSiemConfig(projectId: string): Promise<SiemConfig> {
  const res = await api.get<SiemConfig>(`/soc/${projectId}/siem-config`);
  return res.data;
}

export async function addSiemRule(
  projectId: string,
  rule: { name: string; description: string; xml_content: string; enabled?: boolean }
): Promise<SiemConfig> {
  const res = await api.post<SiemConfig>(`/soc/${projectId}/siem-config/rules`, rule);
  return res.data;
}

export async function replaceSiemRules(
  projectId: string,
  rules: Array<{ name: string; description: string; xml_content: string; enabled?: boolean }>
): Promise<SiemConfig> {
  const res = await api.put<SiemConfig>(`/soc/${projectId}/siem-config/rules`, { rules });
  return res.data;
}

export async function deleteSiemRule(
  projectId: string,
  ruleId: string
): Promise<SiemConfig> {
  const res = await api.delete<SiemConfig>(`/soc/${projectId}/siem-config/rules/${ruleId}`);
  return res.data;
}

export async function fetchXmlRules(
  projectId: string,
  url: string
): Promise<{ candidates: XmlCandidate[]; total: number }> {
  const res = await api.post<{ candidates: XmlCandidate[]; total: number }>(
    `/soc/${projectId}/siem-config/fetch-xml`,
    { url }
  );
  return res.data;
}
