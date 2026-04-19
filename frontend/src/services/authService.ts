/**
 * Auth API service — handles login, register, and getting the current user.
 *
 * TypeScript tip: The functions here have return types like Promise<TokenResponse>.
 * This means "this function returns a Promise that resolves to a TokenResponse object."
 * It helps your editor auto-complete and catch mistakes.
 */
import api from "./api";
import type { LoginRequest, RegisterRequest, TokenResponse, UserResponse, UpdateProfileRequest, UpdateRoleRequest, AuditLogEntry } from "@/types";
import { TOKEN_KEY } from "@/lib/constants";

/** POST /api/auth/login → returns { access_token, token_type } */
export async function login(data: LoginRequest): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/auth/login", data);
  // Store the JWT token so future requests are authenticated
  localStorage.setItem(TOKEN_KEY, res.data.access_token);
  return res.data;
}

/** POST /api/auth/register → returns { message, status: "pending" } */
export async function register(data: RegisterRequest): Promise<{ message: string; status: string }> {
  const res = await api.post<{ message: string; status: string }>("/auth/register", data);
  return res.data;
}

/** GET /api/auth/me → returns current user info */
export async function getMe(): Promise<UserResponse> {
  const res = await api.get<UserResponse>("/auth/me");
  return res.data;
}

/** Remove token and log out */
export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = "/login";
}

/** Check if a token exists in localStorage */
export function isAuthenticated(): boolean {
  return !!localStorage.getItem(TOKEN_KEY);
}

/** POST /api/auth/forgot-password → sends reset email */
export async function forgotPassword(email: string): Promise<void> {
  await api.post("/auth/forgot-password", { email });
}

/** POST /api/auth/reset-password → resets password with token */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await api.post("/auth/reset-password", { token, new_password: newPassword });
}

/** PATCH /api/auth/me → update profile (link Wazuh agent etc.) */
export async function updateProfile(data: UpdateProfileRequest): Promise<UserResponse> {
  const res = await api.patch<UserResponse>("/auth/me", data);
  return res.data;
}

// ── Admin ──────────────────────────────────────────────────────────────────

/** GET /api/auth/users → list all users (admin only) */
export async function listUsers(): Promise<UserResponse[]> {
  const res = await api.get<UserResponse[]>("/auth/users");
  return res.data;
}

/** PATCH /api/auth/users/:id/role → change user role (admin only) */
export async function updateUserRole(userId: string, data: UpdateRoleRequest): Promise<UserResponse> {
  const res = await api.patch<UserResponse>(`/auth/users/${userId}/role`, data);
  return res.data;
}

/** PATCH /api/auth/users/:id/status → toggle activate/deactivate (admin only) */
export async function toggleUserStatus(userId: string): Promise<UserResponse> {
  const res = await api.patch<UserResponse>(`/auth/users/${userId}/status`);
  return res.data;
}

/** PATCH /api/auth/users/:id/approve → approve pending user (admin only) */
export async function approveUser(userId: string): Promise<UserResponse> {
  const res = await api.patch<UserResponse>(`/auth/users/${userId}/approve`);
  return res.data;
}

/** PATCH /api/auth/users/:id/suspend → suspend active user (admin only) */
export async function suspendUser(userId: string): Promise<UserResponse> {
  const res = await api.patch<UserResponse>(`/auth/users/${userId}/suspend`);
  return res.data;
}

export interface AgentConfig {
  project_id: string;
  project_name: string;
  slug: string;
  wazuh_agent_name: string | null;
  wazuh_agent_registered: boolean;
}

/** GET /api/auth/users/:id/agent-configs → list user's SOC projects with agent info (admin only) */
export async function getUserAgentConfigs(userId: string): Promise<AgentConfig[]> {
  const res = await api.get<AgentConfig[]>(`/auth/users/${userId}/agent-configs`);
  return res.data;
}

/** GET /api/audit/ → list audit log entries (admin only) */
export async function getAuditLogs(page = 1, size = 50): Promise<AuditLogEntry[]> {
  const res = await api.get<AuditLogEntry[]>(`/audit/?page=${page}&size=${size}`);
  return res.data;
}

/* ── Notification Preferences ─────────────────────────────────────────────── */

export interface NotificationPrefs {
  min_alert_level: number;
  notify_scan_complete: boolean;
  notify_scan_failed: boolean;
  notify_critical_finding: boolean;
  notify_soc_critical: boolean;
  notify_new_registration: boolean;
}

export const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  min_alert_level: 7,
  notify_scan_complete: true,
  notify_scan_failed: true,
  notify_critical_finding: true,
  notify_soc_critical: true,
  notify_new_registration: true,
};

/** GET /api/auth/me/prefs → get current user's notification preferences */
export async function getNotificationPrefs(): Promise<NotificationPrefs> {
  const res = await api.get<NotificationPrefs>("/auth/me/prefs");
  return { ...DEFAULT_NOTIF_PREFS, ...res.data };
}

/** PATCH /api/auth/me/prefs → save notification preferences */
export async function saveNotificationPrefs(prefs: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  const res = await api.patch<NotificationPrefs>("/auth/me/prefs", prefs);
  return res.data;
}
