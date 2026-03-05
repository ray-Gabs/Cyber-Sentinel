import api from "./api";

export interface ScanResult {
  id: string;
  target: string;
  status: string;
  scan_type: string;
  created_at: string;
}

export interface AlertResult {
  id: string;
  rule_description: string;
  agent_name: string;
  rule_level: number;
  timestamp: string;
}

export interface SearchResults {
  scans: ScanResult[];
  alerts: AlertResult[];
}

export async function globalSearch(q: string): Promise<SearchResults> {
  const { data } = await api.get<SearchResults>("/api/search", { params: { q } });
  return data;
}
