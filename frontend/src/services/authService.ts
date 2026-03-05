/**
 * Auth API service — handles login, register, and getting the current user.
 *
 * TypeScript tip: The functions here have return types like Promise<TokenResponse>.
 * This means "this function returns a Promise that resolves to a TokenResponse object."
 * It helps your editor auto-complete and catch mistakes.
 */
import api from "./api";
import type { LoginRequest, RegisterRequest, TokenResponse, UserResponse } from "@/types";
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
