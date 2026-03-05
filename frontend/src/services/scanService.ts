/**
 * Scan API service — CRUD operations for pentesting scans.
 *
 * TypeScript tip: "interface" defines the shape of an object.
 * When you see `ScanCreateRequest`, it means "an object with target and scan_type fields."
 */
import api from "./api";
import type { Scan, ScanSummary, ScanCreateRequest } from "@/types";

/** POST /api/scans/ → start a new scan */
export async function createScan(data: ScanCreateRequest): Promise<Scan> {
  const res = await api.post<Scan>("/scans/", data);
  return res.data;
}

/** GET /api/scans/ → list all scans (paginated) */
export async function getScans(
  skip: number = 0,
  limit: number = 20
): Promise<ScanSummary[]> {
  const res = await api.get<ScanSummary[]>("/scans/", {
    params: { skip, limit },
  });
  return res.data;
}

/** GET /api/scans/:id → get full scan details + findings */
export async function getScan(id: string): Promise<Scan> {
  const res = await api.get<Scan>(`/scans/${id}`);
  return res.data;
}

/** POST /api/scans/:id/cancel → cancel a running scan */
export async function cancelScan(id: string): Promise<void> {
  await api.post(`/scans/${id}/cancel`);
}
