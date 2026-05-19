import { API_BASE } from "@/lib/constants";
import axios from "axios";
import type { AxiosRequestConfig } from "axios";

/** Axios instance — auth via HttpOnly cookie (sent automatically by the browser). */
const api = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
  timeout: 30000,
  withCredentials: true, // browser sends the HttpOnly access_token cookie on every request
});

let _refreshing = false;
let _refreshQueue: Array<() => void> = [];

function _flushQueue() {
  _refreshQueue.forEach((fn) => fn());
  _refreshQueue = [];
}

// ── Response interceptor: handle 401 (auto-refresh) and 429 ──
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const originalRequest: AxiosRequestConfig & { _retry?: boolean } = error.config ?? {};

    if (status === 401 && !originalRequest._retry) {
      const isAuthPath =
        originalRequest.url?.includes("/auth/login") ||
        originalRequest.url?.includes("/auth/refresh") ||
        originalRequest.url?.includes("/auth/me");
      const onLoginPage = window.location.pathname.includes("/login");

      if (!isAuthPath && !onLoginPage) {
        // Queue concurrent callers while a refresh is in flight
        if (_refreshing) {
          return new Promise((resolve, reject) => {
            _refreshQueue.push(async () => {
              try {
                originalRequest._retry = true;
                resolve(await api(originalRequest));
              } catch (e) { reject(e); }
            });
          });
        }

        _refreshing = true;
        originalRequest._retry = true;
        try {
          await axios.post(`${API_BASE}/auth/refresh`, {}, { withCredentials: true });
          _flushQueue();
          return api(originalRequest);
        } catch {
          _refreshQueue = [];
          window.location.href = "/login";
        } finally {
          _refreshing = false;
        }
        return Promise.reject(error);
      }
    }

    if (status === 429) {
      const retryAfter = error.response?.headers?.["retry-after"];
      const msg = retryAfter
        ? `Rate limit reached — retry in ${retryAfter}s`
        : "Too many requests — please slow down";
      window.dispatchEvent(new CustomEvent("cs:toast", { detail: { msg, type: "warning" } }));
    }

    return Promise.reject(error);
  }
);

export default api;
