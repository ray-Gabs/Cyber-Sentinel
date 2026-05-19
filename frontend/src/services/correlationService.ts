/**
 * Correlation API service — links pentesting findings to SOC alerts.
 */
import api from "./api";
import type { Correlation } from "@/types";

export interface CorrelationPage {
  items: Correlation[];
  total: number;
  skip: number;
  limit: number;
}

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

/** GET /api/correlations/ → list correlations with pagination */
export async function getCorrelations(skip = 0, limit = 10): Promise<CorrelationPage> {
  const res = await api.get<CorrelationPage>("/correlations/", { params: { skip, limit } });
  // Normalise: backend returns { items, total, skip, limit }
  return {
    items: res.data.items ?? [],
    total: res.data.total ?? 0,
    skip:  res.data.skip  ?? skip,
    limit: res.data.limit ?? limit,
  };
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
