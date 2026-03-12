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
  page: number = 1,
  size: number = 20
): Promise<ScanSummary[]> {
  const res = await api.get<ScanSummary[]>("/scans/", {
    params: { page, size },
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

/** DELETE /api/scans/:id → permanently delete a scan */
export async function deleteScan(id: string): Promise<void> {
  await api.delete(`/scans/${id}`);
}

/** GET /api/scans/:id/report/html → download HTML report */
export async function exportHtmlReport(id: string): Promise<string> {
  const res = await api.get<string>(`/scans/${id}/report/html`, {
    responseType: "text",
  });
  return res.data;
}

/** GET /api/scans/:id/report/pdf → download PDF report as blob */
export async function exportPdfReport(id: string): Promise<Blob> {
  const res = await api.get(`/scans/${id}/report/pdf`, {
    responseType: "blob",
  });
  return res.data as Blob;
}
