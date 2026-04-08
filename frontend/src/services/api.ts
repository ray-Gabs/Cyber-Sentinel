import axios from "axios";
import { TOKEN_KEY, API_BASE } from "@/lib/constants";

/** Axios instance with JWT interceptor */
const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
});

// ── Request interceptor: attach JWT ──
api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: handle 401 ──
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const token = localStorage.getItem(TOKEN_KEY);
      // Only clear token and redirect when a stored token was rejected.
      // If there is no token (e.g. login page returning "bad credentials"),
      // do nothing — the caller handles the error in its own catch block.
      if (token && !window.location.pathname.includes("/login")) {
        localStorage.removeItem(TOKEN_KEY);
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
