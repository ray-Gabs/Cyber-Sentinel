/**
 * Auth API service — handles login, register, and getting the current user.
 *
 * TypeScript tip: The functions here have return types like Promise<TokenResponse>.
 * This means "this function returns a Promise that resolves to a TokenResponse object."
 * It helps your editor auto-complete and catch mistakes.
 */
import api from "./api";
import type { LoginRequest, RegisterRequest, TokenResponse, UserResponse, UpdateProfileRequest, UpdateRoleRequest } from "@/types";
import { TOKEN_KEY } from "@/lib/constants";

/** POST /api/auth/login → returns { access_token, token_type } */
export async function login(data: LoginRequest): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/auth/login", data);
  // Store the JWT token so future requests are authenticated
  localStorage.setItem(TOKEN_KEY, res.data.access_token);
  return res.data;
}

/** POST /api/auth/register → returns { access_token, token_type } */
export async function register(data: RegisterRequest): Promise<TokenResponse> {
  const res = await api.post<TokenResponse>("/auth/register", data);
  localStorage.setItem(TOKEN_KEY, res.data.access_token);
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
