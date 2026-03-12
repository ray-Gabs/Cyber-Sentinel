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
  const res = await api.get<Correlation[]>("/correlations/");
  return res.data;
}
