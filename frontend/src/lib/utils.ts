import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes without conflicts */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format ISO date string to a readable format */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format relative time (e.g., "5 minutes ago") */
export function timeAgo(iso: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(iso).getTime()) / 1000
  );
  const intervals: [number, string][] = [
    [31536000, "year"],
    [2592000, "month"],
    [86400, "day"],
    [3600, "hour"],
    [60, "minute"],
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count} ${label}${count > 1 ? "s" : ""} ago`;
  }
  return "just now";
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
