/**
 * Correlation API service — links pentesting findings to SOC alerts.
 */
import api from "./api";
import type { Correlation } from "@/types";

/** POST /api/correlations/run → run correlation engine for a scan */
export async function runCorrelation(scanId: string): Promise<Correlation> {
  const res = await api.post<Correlation>("/correlations/run", { scan_id: scanId });
  return res.data;
}

/** GET /api/correlations/scan/:scanId → get correlation for a specific scan */
export async function getCorrelationByScan(scanId: string): Promise<Correlation> {
  const res = await api.get<Correlation>(`/correlations/scan/${scanId}`);
  return res.data;
}

/** GET /api/correlations/ → list all correlations */
export async function getCorrelations(): Promise<Correlation[]> {
  const res = await api.get<{ items: Correlation[]; total: number; skip: number; limit: number }>("/correlations/");
  return res.data.items ?? [];
}

/** DELETE /api/correlations/:id → delete a single correlation */
export async function deleteCorrelation(id: string): Promise<void> {
  await api.delete(`/correlations/${id}`);
}

/** DELETE /api/correlations/ → delete all correlations for the current user */
export async function deleteAllCorrelations(): Promise<{ deleted: number }> {
  const res = await api.delete<{ deleted: number }>("/correlations/");
  return res.data;
}
