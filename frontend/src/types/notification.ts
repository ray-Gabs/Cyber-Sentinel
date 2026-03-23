/* ── Notification Types ─────────────────────────────── */

export type NotificationType = "scan_complete" | "scan_failed" | "critical_finding";

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body?: string;
  scan_id?: string;
  scan_target?: string;
  severity_summary?: Record<string, number>;
  risk_score?: number;
  is_read: boolean;
  created_at: string;
}
