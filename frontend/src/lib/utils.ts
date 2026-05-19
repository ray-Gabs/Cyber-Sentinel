import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes without conflicts */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse an ISO datetime string as UTC regardless of whether it carries a
 * timezone indicator. MongoDB/Beanie returns naive UTC strings (no `Z`),
 * which browsers interpret as LOCAL time per the ECMAScript spec — causing
 * timestamps to be offset by the user's UTC offset (e.g. −7h for UTC+7).
 * Appending `Z` forces correct UTC interpretation.
 */
export function parseUtcDate(iso: string): Date {
  if (!iso.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(iso)) {
    return new Date(iso + "Z");
  }
  return new Date(iso);
}

/** Format ISO date string to a readable format (24-hour clock) */
export function formatDate(iso: string): string {
  return parseUtcDate(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Compact timestamp for SIEM alert lists.
 * Today  → "HH:MM:SS"
 * Other  → "Mon DD  HH:MM"
 */
export function formatAlertTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = parseUtcDate(iso);
  if (isNaN(d.getTime())) return "—";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${date}  ${time}`;
}

/** Format relative time with sub-hour precision for SIEM use cases */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - parseUtcDate(iso).getTime();
  if (isNaN(ms)) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60)  return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60)  return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const mins  = minutes % 60;
  if (hours < 24)    return mins > 0 ? `${hours}h ${mins}m ago` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30)     return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12)   return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

/** Truncate long strings */
export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "..." : str;
}

/** Capitalize first letter */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Get severity display color class */
export function severityColor(severity: string): string {
  const map: Record<string, string> = {
    critical: "text-severity-critical",
    high: "text-severity-high",
    medium: "text-severity-medium",
    low: "text-severity-low",
    info: "text-severity-info",
  };
  return map[severity.toLowerCase()] ?? "text-gray-400";
}

/** Get severity badge class */
export function severityBadge(severity: string): string {
  const map: Record<string, string> = {
    critical: "badge-critical",
    high: "badge-high",
    medium: "badge-medium",
    low: "badge-low",
    info: "badge-info",
  };
  return map[severity.toLowerCase()] ?? "badge-info";
}

/**
 * Extract a human-readable message from an API error.
 *
 * Handles: Axios error objects, raw Error instances, plain strings,
 * FastAPI 422 validation arrays, and the project's standard envelope
 * format { error: "CODE", message: "Human readable" }.
 */
export function extractErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (!error) return fallback;
  if (typeof error === "string") return error;

  const e = error as Record<string, unknown>;
  const data = (e?.response as Record<string, unknown>)?.data as Record<string, unknown> | undefined;

  // Standard envelope: { message: "..." }
  if (typeof data?.message === "string" && data.message) return data.message;

  // FastAPI 422 validation array: [{ msg: "..." }]
  if (Array.isArray(data?.detail)) {
    const msgs = (data.detail as Array<Record<string, string>>)
      .map((d) => d?.msg?.replace(/^Value error,\s*/i, ""))
      .filter(Boolean);
    if (msgs.length) return msgs.join("; ");
  }

  // FastAPI string detail
  if (typeof data?.detail === "string" && data.detail) return data.detail;

  // Axios / native Error message (skip generic network errors)
  if (typeof e?.message === "string" && e.message && e.message !== "Network Error")
    return e.message;

  return fallback;
}

/** Dispatch a toast notification from anywhere without importing the toast component. */
export function showToast(
  msg: string,
  type: "success" | "error" | "warning" | "info" = "error",
): void {
  window.dispatchEvent(new CustomEvent("cs:toast", { detail: { msg, type } }));
}

/** Get status badge variant */
export function statusColor(status: string): string {
  const map: Record<string, string> = {
    completed: "text-green-400",
    running: "text-sentinel-400",
    pending: "text-yellow-400",
    failed: "text-red-400",
    cancelled: "text-gray-500",
  };
  return map[status] ?? "text-gray-400";
}
