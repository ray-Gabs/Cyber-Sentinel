/**
 * Analytics API service — pentest scan metrics and trends.
 */
import api from "./api";

export type AnalyticsRange = "7d" | "30d" | "90d";

export interface ScansOverTimePoint {
  date: string;
  count: number;
}

export interface FindingsBySeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface TopVulnerableTarget {
  target: string;
  findings: number;
}

export interface ScannerSuccessRate {
  scanner: string;
  completed: number;
  failed: number;
  rate: number; // 0-1
}

export interface PentestAnalytics {
  scans_over_time: ScansOverTimePoint[];
  findings_by_severity: FindingsBySeverity;
  top_vulnerable_targets: TopVulnerableTarget[];
  scanner_success_rate: ScannerSuccessRate[];
  avg_scan_duration_seconds: number;
  alerts_over_time: ScansOverTimePoint[];
  total_scans: number;
  total_alerts: number;
}

/** GET /api/analytics?range=7d|30d|90d */
export async function getPentestAnalytics(range: AnalyticsRange = "30d"): Promise<PentestAnalytics> {
  const res = await api.get<PentestAnalytics>("/analytics", { params: { range } });
  return res.data;
}
