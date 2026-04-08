/* ── TypeScript Types ─────────────────────────────── */

/* ---- User / Auth ---- */
export type UserRole = "admin" | "analyst" | "viewer";

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login?: string;
}

export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  last_login?: string;
  wazuh_agent_name?: string | null;
}

export interface UpdateProfileRequest {
  wazuh_agent_name?: string;
}

export interface UpdateRoleRequest {
  role: UserRole;
}

export interface AuditLogEntry {
  id: string;
  user_id: string;
  username: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  details?: string | null;
  ip_address?: string | null;
  timestamp: string;
}
