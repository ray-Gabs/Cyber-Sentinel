/* ── Shared API Types ─────────────────────────────── */

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface ApiError {
  detail: string;
}

export interface HealthResponse {
  status: string;
  service: string;
}

// Re-exports
export type { User, LoginRequest, RegisterRequest, TokenResponse, UserResponse, UserRole } from "./user";
export type {
  Scan,
  ScanSummary,
  ScanCreateRequest,
  ScanType,
  ScanStatus,
  Severity,
  Finding,
  CVEData,
} from "./scan";
export type {
  Alert,
  AlertSummary,
  AlertFilterParams,
  AlertClassification,
  AlertAction,
  AnalystOverrideRequest,
  AlertStats,
  MitreTechnique,
  ThreatIntelResult,
} from "./alert";
export type {
  Correlation,
  CorrelationLink,
  CorrelationRunRequest,
} from "./correlation";
