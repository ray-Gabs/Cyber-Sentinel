/**
 * Scan API service — CRUD operations for pentesting scans.
 *
 * TypeScript tip: "interface" defines the shape of an object.
 * When you see `ScanCreateRequest`, it means "an object with target and scan_type fields."
 */
import axios from "axios";
import api from "./api";
import type { Scan, ScanSummary, ScanCreateRequest, ScanDiff, ScheduledScan, ScheduledScanCreateRequest, PaginatedScans, PaginatedScheduledScans } from "@/types";

/** POST /api/scans/ → start a new scan */
export async function createScan(data: ScanCreateRequest): Promise<Scan> {
  const res = await api.post<Scan>("/scans/", data);
  return res.data;
}

/** Internal helper — fetches paginated scan list from server. */
async function _fetchScansPage(
  page: number,
  size: number,
  status?: string,
  search?: string,
): Promise<PaginatedScans> {
  const params: Record<string, string | number> = { page, size };
  if (status && status !== "all") params.status = status;
  if (search?.trim()) params.search = search.trim();
  const res = await api.get<PaginatedScans>("/scans/", { params });
  return res.data;
}

/**
 * GET /api/scans/ → paginated list with optional server-side filtering.
 * Use this in the scan list view for full pagination + filter support.
 */
export async function getScansPage(
  page: number = 1,
  size: number = 20,
  status?: string,
  search?: string,
): Promise<PaginatedScans> {
  return _fetchScansPage(page, size, status, search);
}

/**
 * GET /api/scans/ → returns just the items array (backwards-compatible).
 * Used by Dashboard, Correlation, ScanDiff for lightweight recent-scan lists.
 */
export async function getScans(
  page: number = 1,
  size: number = 20
): Promise<ScanSummary[]> {
  const data = await _fetchScansPage(page, size);
  return data.items;
}

export interface ScanStats {
  total: number;
  running: number;
  pending: number;
  completed: number;
  failed: number;
  cancelled: number;
  high_risk: number;
  total_findings: number;
  findings_critical: number;
  findings_high: number;
  findings_medium: number;
  findings_low: number;
}

/** GET /api/scans/stats → aggregate counts (accurate regardless of page size) */
export async function getScanStats(): Promise<ScanStats> {
  const res = await api.get<ScanStats>("/scans/stats");
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

/** POST /api/scans/:id/rerun → re-run with same target, type, and config */
export async function reRunScan(scanId: string): Promise<Scan> {
  const res = await api.post<Scan>(`/scans/${scanId}/rerun`);
  return res.data;
}

/** GET /api/scans/:id/report/html → download HTML report */
export async function exportHtmlReport(id: string): Promise<string> {
  const res = await api.get<string>(`/scans/${id}/report/html`, {
    responseType: "text",
  });
  return res.data;
}

/** GET /api/scans/:id/report/pdf → download PDF report as blob.
 * axios responseType:"blob" wraps error bodies as Blobs too — we read them
 * back to text so extractErrorMessage can surface the actual server error. */
export async function exportPdfReport(id: string): Promise<Blob> {
  try {
    const res = await api.get(`/scans/${id}/report/pdf`, { responseType: "blob" });
    return res.data as Blob;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
      try {
        const text = await (err.response.data as Blob).text();
        const json = JSON.parse(text) as { detail?: string; message?: string };
        throw new Error(json.detail ?? json.message ?? "PDF export failed");
      } catch (parseErr) {
        if (parseErr instanceof Error && parseErr.message !== "PDF export failed") throw parseErr;
      }
    }
    throw err;
  }
}

/** GET /api/scans/:id/diff/:baselineId → compare two completed scans */
export async function diffScans(scanId: string, baselineId: string): Promise<ScanDiff> {
  const res = await api.get<ScanDiff>(`/scans/${scanId}/diff/${baselineId}`);
  return res.data;
}

export interface VerifyResponse {
  message?: string;
  task_id?: string;
  scan_id?: string;
  findings_to_verify?: number;
  finding_idx?: number;
  finding_name?: string;
  verified?: boolean;
  note?: string;
  probe_type?: string;
  evidence?: string | null;
  request_snippet?: string | null;
}

/** POST /api/scans/:id/verify → queue verification probes for all findings (async) */
export async function verifyFindings(id: string): Promise<VerifyResponse> {
  const res = await api.post<VerifyResponse>(`/scans/${id}/verify`);
  return res.data;
}

/** POST /api/scans/:id/findings/:idx/verify → verify a single finding synchronously */
export async function verifySingleFinding(scanId: string, findingIdx: number): Promise<VerifyResponse> {
  const res = await api.post<VerifyResponse>(`/scans/${scanId}/findings/${findingIdx}/verify`);
  return res.data;
}

export interface FindingVerdictRequest {
  verdict: "confirmed" | "false_positive" | "needs_investigation";
  notes?: string;
}

export interface FindingVerdictResponse {
  finding_idx: number;
  analyst_verdict: string;
  analyst_notes: string | null;
  analyst_reviewed_at: string;
}

/** PATCH /api/scans/:id/findings/:idx/verdict → analyst marks a finding */
export async function setFindingVerdict(
  scanId: string,
  findingIdx: number,
  data: FindingVerdictRequest,
): Promise<FindingVerdictResponse> {
  const res = await api.patch<FindingVerdictResponse>(
    `/scans/${scanId}/findings/${findingIdx}/verdict`,
    data,
  );
  return res.data;
}

/** POST /api/scans/scheduled → create a scheduled scan */
export async function createScheduledScan(data: ScheduledScanCreateRequest): Promise<ScheduledScan> {
  const res = await api.post<ScheduledScan>("/scans/scheduled", data);
  return res.data;
}

/** GET /api/scans/scheduled → list scheduled scans (paginated) */
export async function getScheduledScans(
  page: number = 1,
  size: number = 20,
): Promise<PaginatedScheduledScans> {
  const res = await api.get<PaginatedScheduledScans>("/scans/scheduled", {
    params: { page, size },
  });
  return res.data;
}

/** PATCH /api/scans/scheduled/:id/toggle → enable or disable a scheduled scan */
export async function toggleScheduledScan(id: string): Promise<ScheduledScan> {
  const res = await api.patch<ScheduledScan>(`/scans/scheduled/${id}/toggle`);
  return res.data;
}

/** DELETE /api/scans/scheduled/:id → delete a scheduled scan */
export async function deleteScheduledScan(id: string): Promise<void> {
  await api.delete(`/scans/scheduled/${id}`);
}
