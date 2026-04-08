/**
 * AuditLog — Admin-only audit trail page.
 * Shows all platform events: logins, scan actions, role changes, account changes.
 * Color-coded by action category. Filterable by action prefix.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ClipboardList, RefreshCw, Filter, User, Target, Shield, Settings, AlertCircle } from "lucide-react";
import { getAuditLogs } from "@/services/authService";
import type { AuditLogEntry } from "@/types";

// ── Action category config ─────────────────────────────────────────────────
const ACTION_STYLES: Record<string, { color: string; bg: string; border: string; icon: React.ElementType }> = {
  "user.login":           { color: "#60a5fa", bg: "rgba(59,130,246,0.10)",  border: "rgba(59,130,246,0.25)",  icon: User    },
  "user.registered":      { color: "#4ade80", bg: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.25)",   icon: User    },
  "scan.created":         { color: "#c084fc", bg: "rgba(168,85,247,0.10)",  border: "rgba(168,85,247,0.25)",  icon: Target  },
  "scan.deleted":         { color: "#f87171", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.25)",   icon: Target  },
  "scan.cancelled":       { color: "#fb923c", bg: "rgba(249,115,22,0.10)",  border: "rgba(249,115,22,0.25)",  icon: Target  },
  "role.changed":         { color: "#fbbf24", bg: "rgba(245,158,11,0.10)",  border: "rgba(245,158,11,0.25)",  icon: Shield  },
  "account.activated":    { color: "#4ade80", bg: "rgba(34,197,94,0.10)",   border: "rgba(34,197,94,0.25)",   icon: Settings },
  "account.deactivated":  { color: "#f87171", bg: "rgba(239,68,68,0.10)",   border: "rgba(239,68,68,0.25)",   icon: Settings },
};

function getActionStyle(action: string) {
  if (ACTION_STYLES[action]) return ACTION_STYLES[action];
  const prefix = action.split(".")[0];
  const defaults: Record<string, { color: string; bg: string; border: string; icon: React.ElementType }> = {
    user:    { color: "#60a5fa", bg: "rgba(59,130,246,0.08)",  border: "rgba(59,130,246,0.2)",  icon: User    },
    scan:    { color: "#c084fc", bg: "rgba(168,85,247,0.08)",  border: "rgba(168,85,247,0.2)",  icon: Target  },
    role:    { color: "#fbbf24", bg: "rgba(245,158,11,0.08)",  border: "rgba(245,158,11,0.2)",  icon: Shield  },
    account: { color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)", icon: Settings },
    alert:   { color: "#f87171", bg: "rgba(239,68,68,0.08)",   border: "rgba(239,68,68,0.2)",   icon: AlertCircle },
  };
  return defaults[prefix] ?? { color: "var(--text-muted)", bg: "var(--bg-muted)", border: "var(--border)", icon: ClipboardList };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

// ── Skeleton row ────────────────────────────────────────────────────────────
function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="skeleton w-20 h-3 rounded" />
      <div className="skeleton w-16 h-3 rounded" />
      <div className="skeleton h-5 w-24 rounded-full" />
      <div className="skeleton w-32 h-3 rounded flex-1" />
    </div>
  );
}

// ── Filter options ──────────────────────────────────────────────────────────
const FILTER_OPTIONS = [
  { value: "",        label: "All" },
  { value: "user.",   label: "Auth" },
  { value: "scan.",   label: "Scans" },
  { value: "role.",   label: "Roles" },
  { value: "account.", label: "Accounts" },
];

// ── Main component ──────────────────────────────────────────────────────────
export default function AuditLog() {
  const [logs, setLogs]       = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState("");
  const [page, setPage]       = useState(1);

  async function load(p = page) {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditLogs(p, 50);
      setLogs(data);
    } catch {
      setError("Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = filter
    ? logs.filter((l) => l.action.startsWith(filter))
    : logs;

  return (
    <div className="space-y-5 max-w-6xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.02em" }}
          >
            Audit Log
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Platform-wide activity trail — logins, scans, role changes, account actions
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-all"
          style={{
            backgroundColor: "var(--bg-muted)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </motion.div>

      {/* Filter pills */}
      <div className="flex gap-1.5 flex-wrap items-center">
        <Filter size={12} style={{ color: "var(--text-subtle)" }} />
        {FILTER_OPTIONS.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
            style={
              filter === value
                ? { backgroundColor: "var(--accent-dim)", color: "var(--accent)", border: "1px solid rgba(59,130,246,0.3)" }
                : { backgroundColor: "transparent", color: "var(--text-muted)", border: "1px solid transparent" }
            }
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="card overflow-hidden"
        style={{ padding: 0 }}
      >
        {/* Table header */}
        <div
          className="grid gap-3 px-4 py-2.5 text-[10px] uppercase tracking-[0.14em] font-semibold border-b"
          style={{
            gridTemplateColumns: "160px 100px 160px 1fr 120px",
            color: "var(--text-subtle)",
            borderColor: "var(--border)",
            backgroundColor: "var(--bg-muted)",
          }}
        >
          <span>Timestamp</span>
          <span>User</span>
          <span>Action</span>
          <span>Details</span>
          <span>IP</span>
        </div>

        {/* Rows */}
        {error ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm" style={{ color: "var(--sev-critical-text)" }}>
            <AlertCircle size={14} />
            {error}
          </div>
        ) : loading ? (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {[...Array(8)].map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: "var(--text-subtle)" }}>
            <ClipboardList size={28} />
            <p className="text-sm">No audit events found</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {filtered.map((entry, i) => {
              const style = getActionStyle(entry.action);
              const Icon = style.icon;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02, duration: 0.2 }}
                  className="grid gap-3 px-4 py-2.5 items-center hover:bg-[var(--bg-muted)] transition-colors"
                  style={{ gridTemplateColumns: "160px 100px 160px 1fr 120px" }}
                >
                  {/* Timestamp */}
                  <span
                    className="text-[11px] font-mono"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {formatTime(entry.timestamp)}
                  </span>

                  {/* Username */}
                  <span
                    className="text-xs font-semibold truncate"
                    style={{ color: "var(--text-base)", fontFamily: "Syne, sans-serif" }}
                  >
                    {entry.username}
                  </span>

                  {/* Action badge */}
                  <span
                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full w-fit"
                    style={{ color: style.color, backgroundColor: style.bg, border: `1px solid ${style.border}` }}
                  >
                    <Icon size={10} />
                    {entry.action}
                  </span>

                  {/* Details */}
                  <span
                    className="text-xs truncate"
                    style={{ color: "var(--text-muted)" }}
                    title={entry.details ?? undefined}
                  >
                    {entry.details ?? (entry.resource_type ? `${entry.resource_type} ${entry.resource_id ?? ""}` : "—")}
                  </span>

                  {/* IP */}
                  <span
                    className="text-[11px] font-mono"
                    style={{ color: "var(--text-subtle)" }}
                  >
                    {entry.ip_address ?? "—"}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Pagination */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
          style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          Previous
        </button>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={logs.length < 50 || loading}
          className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors"
          style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          Next
        </button>
      </div>
    </div>
  );
}
