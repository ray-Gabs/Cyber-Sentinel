/**
 * Alert API service — SOC / Wazuh alert operations.
 */
import api from "./api";
import type { Alert, AlertSummary, AlertFilterParams, AnalystOverrideRequest } from "@/types";

/** GET /api/alerts/ → list alerts with optional filters */
export async function getAlerts(
  params: AlertFilterParams = {}
): Promise<AlertSummary[]> {
  const res = await api.get<AlertSummary[]>("/alerts/", { params });
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
