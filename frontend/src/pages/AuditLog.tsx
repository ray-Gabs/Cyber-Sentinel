/**
 * AuditLog — Admin-only audit trail page.
 * Shows all platform events: logins, scan actions, role changes, account actions.
 * Color-coded by action category. Filterable by action prefix.
 */
import { useEffect, useState, useMemo } from "react";
import { getAuditLogs } from "@/services/authService";
import type { AuditLogEntry } from "@/types";
import { Icon, PageHead, Tabs } from "@/components/ui";
import { useAuth } from "@/hooks/useAuth";
import { exportAuditLogPDF } from "@/lib/exportAuditLog";
import { showToast } from "@/lib/utils";

const ACTION_TONE: Record<string, string> = {
  "user":    "accent",
  "scan":    "medium",
  "role":    "high",
  "account": "info",
  "alert":   "critical",
};

function actionTone(action: string): string {
  const prefix = action.split(".")[0];
  return ACTION_TONE[prefix] ?? "default";
}

function catFromAction(action: string): string {
  return action.split(".")[0];
}

const TONE_COLOR: Record<string, string> = {
  accent:   "#3B82F6",
  medium:   "#f59e0b",
  high:     "#f97316",
  critical: "#ef4444",
  info:     "#94a3b8",
  default:  "var(--border)",
};

function toneColor(action: string): string {
  return TONE_COLOR[actionTone(action)] ?? TONE_COLOR.default;
}

const ACTION_DESCRIPTIONS: Record<string, string> = {
  "user.login":              "Authentication successful",
  "user.logout":             "Session ended",
  "user.registered":         "Account created",
  "user.password_changed":   "Password updated",
  "user.password_reset":     "Password reset via email",
  "account.activated":       "Account enabled",
  "account.deactivated":     "Account disabled",
  "role.changed":            "Role permission updated",
  "scan.created":            "New scan initiated",
  "scan.deleted":            "Scan record removed",
  "scan.cancelled":          "Scan cancelled",
  "scan.completed":          "Scan finished successfully",
  "alert.received":          "Wazuh alert ingested",
  "alert.triaged":           "AI triage verdict assigned",
  "detection_rule.created":  "Detection rule added",
  "detection_rule.updated":  "Detection rule modified",
  "detection_rule.deleted":  "Detection rule removed",
};

function getActionDetail(entry: AuditLogEntry): string {
  if (entry.details) return entry.details;
  if (entry.resource_type && entry.resource_id) {
    return `${entry.resource_type}: ${entry.resource_id.slice(0, 12)}…`;
  }
  return ACTION_DESCRIPTIONS[entry.action] ?? "—";
}

function exportCSV(logs: AuditLogEntry[]) {
  const headers = ["Timestamp", "Action", "User ID", "Username", "IP Address", "Details"];
  const rows = logs.map((l) => [
    formatTime(l.timestamp),
    l.action,
    l.user_id ?? "",
    l.username ?? "",
    l.ip_address ?? "",
    l.details ?? (l.resource_type ? `${l.resource_type} ${l.resource_id ?? ""}` : ""),
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseUtcDate(iso: string): Date {
  if (!iso.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(iso)) return new Date(iso + "Z");
  return new Date(iso);
}

function formatTime(iso: string): string {
  const d = parseUtcDate(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const FILTER_TABS = [
  { id: "all",      label: "All",      count: 0 },
  { id: "user",     label: "Auth",     count: 0 },
  { id: "scan",     label: "Scans",    count: 0 },
  { id: "role",     label: "Roles",    count: 0 },
  { id: "account",  label: "Accounts", count: 0 },
];

export default function AuditLog() {
  const { user } = useAuth();
  const [logs, setLogs]       = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [filter, setFilter]   = useState("all");
  const [page, setPage]       = useState(1);

  const PAGE_SIZE = 10;

  async function load(p = page) {
    setLoading(true);
    setError(null);
    try {
      const data = await getAuditLogs(p, PAGE_SIZE);
      setLogs(data);
    } catch {
      setError("Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(page); }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredLogs = useMemo(
    () => filter === "all" ? logs : logs.filter((l) => catFromAction(l.action) === filter),
    [logs, filter]
  );

  // Admin-only fallback guard (route-level guard in AdminRoute is primary)
  if (user && user.role !== "admin") {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: "var(--text-3)" }}>Access restricted to administrators.</p>
      </div>
    );
  }

  const tabsWithCounts = FILTER_TABS.map((t) => ({
    ...t,
    count: t.id === "all" ? logs.length : logs.filter((l) => catFromAction(l.action) === t.id).length,
  }));

  return (
    <div className="flex flex-col gap-5 max-w-6xl mx-auto w-full">
      <PageHead
        eyebrow="PLATFORM-WIDE ACTIVITY TRAIL"
        title="Audit Log"
        sub="Logins · scans · rule changes · account actions."
        actions={
          <>
            <button className="btn btn-sm flex items-center gap-1.5">
              <Icon name="filter" size={13} /> Filters
            </button>
            <button
              onClick={() => exportCSV(filteredLogs)}
              className="btn btn-sm flex items-center gap-1.5"
            >
              <Icon name="download" size={13} /> Export CSV
            </button>
            <button
              disabled={exportingPdf}
              onClick={async () => {
                setExportingPdf(true);
                try {
                  await exportAuditLogPDF({ logs: filteredLogs, filter });
                } catch (err) {
                  showToast((err as Error).message ?? "PDF export failed", "error");
                } finally {
                  setExportingPdf(false);
                }
              }}
              className="btn btn-sm flex items-center gap-1.5"
            >
              <Icon name="file" size={13} /> {exportingPdf ? "Exporting…" : "Export PDF"}
            </button>
            <button
              onClick={() => load()}
              disabled={loading}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              <Icon name="refresh" size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </>
        }
      />

      {/* Tabs */}
      <div className="card" style={{ padding: "14px 18px" }}>
        <Tabs
          active={filter}
          onChange={setFilter}
          tabs={tabsWithCounts}
        />
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Header */}
        <div
          className="grid gap-3 px-4 py-2.5 text-xs font-medium uppercase tracking-wide border-b"
          style={{
            gridTemplateColumns: "160px 100px 200px 1fr 120px",
            color: "var(--text-3)",
            borderColor: "var(--border)",
            background: "var(--bg-2)",
          }}
        >
          <span>Timestamp</span>
          <span>User</span>
          <span>Action</span>
          <span>Details</span>
          <span>IP</span>
        </div>

        {error ? (
          <div className="flex items-center gap-2 px-4 py-8 text-sm" style={{ color: "var(--sev-critical)" }}>
            <Icon name="alertCircle" size={14} /> {error}
          </div>
        ) : loading ? (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {[...Array(8)].map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <div className="animate-pulse rounded h-3 w-20" style={{ background: "var(--bg-2)" }} />
                <div className="animate-pulse rounded h-3 w-16" style={{ background: "var(--bg-2)" }} />
                <div className="animate-pulse rounded-full h-5 w-24" style={{ background: "var(--bg-2)" }} />
                <div className="animate-pulse rounded h-3 flex-1" style={{ background: "var(--bg-2)" }} />
              </div>
            ))}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2" style={{ color: "var(--text-3)" }}>
            <Icon name="logs" size={28} />
            <p className="text-sm">No audit events found</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "var(--border)" }}>
            {filteredLogs.map((entry) => {
              const tone = actionTone(entry.action);
              return (
                <div
                  key={entry.id}
                  className="grid gap-3 px-4 py-2.5 items-center hover:bg-white/5 transition-colors"
                  style={{
                    gridTemplateColumns: "160px 100px 200px 1fr 120px",
                    borderLeft: `3px solid ${toneColor(entry.action)}`,
                  }}
                >
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>
                    {formatTime(entry.timestamp)}
                  </span>
                  <span className="text-xs font-medium truncate mono" style={{ color: "var(--text)" }}>
                    {entry.username}
                  </span>
                  <span
                    className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded w-fit"
                    style={{
                      background: `color-mix(in oklab, var(--sev-${tone}) 12%, transparent)`,
                      color: `var(--sev-${tone})`,
                    }}
                  >
                    {entry.action}
                  </span>
                  <span className="text-xs truncate mono" style={{ color: "var(--text-3)" }} title={getActionDetail(entry)}>
                    {getActionDetail(entry)}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
                    {entry.ip_address ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1 || loading}
          className="btn btn-sm disabled:opacity-40"
        >
          Previous
        </button>
        <span className="text-xs" style={{ color: "var(--text-2)" }}>Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={logs.length < PAGE_SIZE || loading}
          className="btn btn-sm disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}
