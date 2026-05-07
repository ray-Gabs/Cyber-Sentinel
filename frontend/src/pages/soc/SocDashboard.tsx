/**
 * SocDashboard — unified SOC overview.
 * Pulls a single /api/soc/dashboard endpoint and renders:
 *   - System notification strip
 *   - 4 summary stat cards
 *   - Per-project agent cards
 *   - Alerts-by-severity breakdown
 *   - Recent alerts table
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, Monitor, ShieldAlert, Clock, Wrench, Database, Zap,
} from "lucide-react";
import {
  getSocDashboard,
  type SocDashboard as SocDashboardData,
  type SystemNotification,
  type PerProjectEntry,
  type RecentAlert,
} from "@/services/socService";
import {
  claimUntenantedAlerts,
  retriageAllUntriaged,
  type AdminClaimResult,
  type AdminRetriangeResult,
} from "@/services/alertService";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";

// ── Small sub-components ──────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { bg: string; text: string }> = {
    critical: { bg: "rgba(239,68,68,0.15)",   text: "#EF4444" },
    high:     { bg: "rgba(245,158,11,0.15)",  text: "#F59E0B" },
    medium:   { bg: "rgba(234,179,8,0.12)",   text: "#EAB308" },
    low:      { bg: "rgba(34,197,94,0.12)",   text: "#22C55E" },
    info:     { bg: "rgba(148,163,184,0.12)", text: "#94A3B8" },
  };
  const c = map[severity?.toLowerCase()] ?? map.info;
  return (
    <span
      className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {severity || "unknown"}
    </span>
  );
}

function AgentDot({ status }: { status: string }) {
  if (status === "connected" || status === "active") {
    return (
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: "#22C55E", boxShadow: "0 0 5px #22C55E80" }}
      />
    );
  }
  if (status === "disconnected") {
    return <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#EF4444" }} />;
  }
  return <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: "#475569" }} />;
}

function NotificationStrip({ notifications }: { notifications: SystemNotification[] }) {
  const iconMap = { error: XCircle, warning: AlertTriangle, info: AlertCircle };
  const colorMap = { error: "#EF4444", warning: "#F59E0B", info: "#00d4ff" };
  return (
    <div className="space-y-1.5">
      {notifications.map((n, i) => {
        const Icon = iconMap[n.level] ?? AlertCircle;
        const color = colorMap[n.level] ?? "#94A3B8";
        return (
          <div
            key={i}
            className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg text-sm"
            style={{
              backgroundColor: `${color}12`,
              border: `1px solid ${color}28`,
            }}
          >
            <Icon size={14} className="shrink-0 mt-0.5" style={{ color }} />
            <span style={{ color: "var(--text-base)" }}>{n.message}</span>
            {n.action && (
              <span className="ml-auto text-[11px] shrink-0" style={{ color: "var(--text-subtle)" }}>
                {n.action}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatCard({
  label, value, icon: Icon, color, danger = false,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  color: string;
  danger?: boolean;
}) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: `1px solid ${danger && value > 0 ? color + "40" : "var(--border)"}`,
        boxShadow: danger && value > 0 ? `0 0 16px ${color}18` : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
          {label}
        </span>
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}18` }}
        >
          <Icon size={14} style={{ color }} />
        </div>
      </div>
      <span
        className="text-3xl font-bold tabular-nums leading-none"
        style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, color: danger && value > 0 ? color : "var(--text-base)" }}
      >
        {value}
      </span>
    </div>
  );
}

function ProjectCard({ entry }: { entry: PerProjectEntry }) {
  const hasIssues = entry.health_issues.length > 0;
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: `1px solid ${hasIssues ? "rgba(245,158,11,0.25)" : "var(--border)"}`,
      }}
    >
      {/* Project header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AgentDot status={entry.agent_status} />
          <span className="text-sm font-semibold truncate" style={{ color: "var(--text-base)" }}>
            {entry.project_name}
          </span>
        </div>
        <span
          className="text-[10px] font-medium px-2 py-0.5 rounded shrink-0"
          style={{
            backgroundColor: entry.agent_status === "connected" ? "rgba(34,197,94,0.12)" : "rgba(148,163,184,0.10)",
            color: entry.agent_status === "connected" ? "#22C55E" : "#94A3B8",
          }}
        >
          {entry.agent_status}
        </span>
      </div>

      {/* Agent name + IP */}
      <div className="text-[11px] space-y-1" style={{ color: "var(--text-subtle)" }}>
        <div className="flex items-center gap-1.5">
          <Monitor size={10} />
          <span style={{ fontFamily: "IBM Plex Mono, monospace" }}>{entry.agent_name}</span>
          {entry.agent_ip && (
            <span className="ml-1" style={{ fontFamily: "IBM Plex Mono, monospace" }}>
              · {entry.agent_ip}
            </span>
          )}
        </div>
      </div>

      {/* Alert counts */}
      <div className="flex items-center gap-4 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>Today</span>
          <span className="text-lg font-bold tabular-nums" style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, color: entry.alerts_today > 0 ? "#F59E0B" : "var(--text-muted)" }}>
            {entry.alerts_today}
          </span>
        </div>
        {entry.critical_today > 0 && (
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>Critical</span>
            <span className="text-lg font-bold tabular-nums" style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, color: "#EF4444" }}>
              {entry.critical_today}
            </span>
          </div>
        )}
        {entry.last_alert_at && (
          <div className="flex items-center gap-1 ml-auto" style={{ color: "var(--text-subtle)" }}>
            <Clock size={10} />
            <span className="text-[10px]">{new Date(entry.last_alert_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
        )}
      </div>

      {/* Health issues */}
      {hasIssues && (
        <div className="space-y-1">
          {entry.health_issues.map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-[11px] px-2 py-1.5 rounded"
              style={{ backgroundColor: "rgba(245,158,11,0.08)", color: "#F59E0B" }}
            >
              <AlertTriangle size={10} className="shrink-0 mt-0.5" />
              {issue}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentAlertsTable({ alerts }: { alerts: RecentAlert[] }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: "1px solid var(--border)" }}
    >
      <table className="w-full text-sm">
        <thead>
          <tr style={{ backgroundColor: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
            {["Time", "Agent", "Project", "Description", "Level", "Verdict"].map((h) => (
              <th
                key={h}
                className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-subtle)" }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alerts.map((alert, i) => (
            <tr
              key={alert.id}
              style={{
                backgroundColor: i % 2 === 0 ? "var(--bg-surface)" : "transparent",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <td
                className="px-4 py-2.5 whitespace-nowrap text-[11px]"
                style={{ fontFamily: "IBM Plex Mono, monospace", color: "var(--text-subtle)" }}
              >
                {new Date(alert.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </td>
              <td
                className="px-4 py-2.5 text-[11px]"
                style={{ fontFamily: "IBM Plex Mono, monospace", color: "var(--text-muted)" }}
              >
                {alert.agent_name}
              </td>
              <td className="px-4 py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>
                {alert.project_name}
              </td>
              <td className="px-4 py-2.5 text-xs max-w-[240px]" style={{ color: "var(--text-base)" }}>
                <span className="line-clamp-1">{alert.rule_description}</span>
              </td>
              <td className="px-4 py-2.5">
                <SeverityBadge severity={alert.severity} />
              </td>
              <td className="px-4 py-2.5">
                {alert.ai_verdict ? (
                  <SeverityBadge severity={alert.ai_verdict} />
                ) : (
                  <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeverityCountBadge({ severity, count }: { severity: string; count: number }) {
  const map: Record<string, { bg: string; text: string }> = {
    critical: { bg: "rgba(239,68,68,0.15)",   text: "#EF4444" },
    high:     { bg: "rgba(245,158,11,0.15)",  text: "#F59E0B" },
    medium:   { bg: "rgba(234,179,8,0.12)",   text: "#EAB308" },
    low:      { bg: "rgba(34,197,94,0.12)",   text: "#22C55E" },
    info:     { bg: "rgba(148,163,184,0.12)", text: "#94A3B8" },
  };
  const c = map[severity.toLowerCase()] ?? map.info;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg"
      style={{ backgroundColor: c.bg, border: `1px solid ${c.text}30` }}
    >
      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: c.text }}>
        {severity}
      </span>
      <span className="text-lg font-bold tabular-nums leading-none" style={{ fontFamily: "Sora, sans-serif", fontWeight: 700, color: c.text }}>
        {count}
      </span>
    </div>
  );
}

// ── Admin Maintenance Panel ───────────────────────────────────────────────────

function AdminMaintenancePanel() {
  const [claimState, setClaimState] = useState<{ loading: boolean; result?: AdminClaimResult; error?: string }>({ loading: false });
  const [triageState, setTriageState] = useState<{ loading: boolean; result?: AdminRetriangeResult; error?: string }>({ loading: false });

  const handleClaim = async () => {
    setClaimState({ loading: true });
    try {
      const result = await claimUntenantedAlerts();
      setClaimState({ loading: false, result });
    } catch (e: unknown) {
      setClaimState({ loading: false, error: e instanceof Error ? e.message : "Failed" });
    }
  };

  const handleRetriage = async () => {
    setTriageState({ loading: true });
    try {
      const result = await retriageAllUntriaged();
      setTriageState({ loading: false, result });
    } catch (e: unknown) {
      setTriageState({ loading: false, error: e instanceof Error ? e.message : "Failed" });
    }
  };

  return (
    <div
      className="rounded-xl p-4"
      style={{ backgroundColor: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.20)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Wrench size={13} style={{ color: "#F59E0B" }} />
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#F59E0B" }}>
          Admin Maintenance
        </span>
      </div>

      <div className="flex flex-wrap gap-4">
        {/* Step 1: Claim untenanted alerts */}
        <div className="flex flex-col gap-1">
          <button
            onClick={handleClaim}
            disabled={claimState.loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-base)", border: "1px solid var(--border)" }}
          >
            {claimState.loading
              ? <RefreshCw size={11} className="animate-spin" />
              : <Database size={11} style={{ color: "#F59E0B" }} />
            }
            1. Claim Untenanted Alerts
          </button>
          {claimState.result && (
            <span className="text-[10px]" style={{ color: "#22C55E" }}>
              {claimState.result.claimed} alerts claimed to your account
            </span>
          )}
          {claimState.error && (
            <span className="text-[10px]" style={{ color: "#EF4444" }}>{claimState.error}</span>
          )}
        </div>

        {/* Step 2: Queue triage for all untriaged */}
        <div className="flex flex-col gap-1">
          <button
            onClick={handleRetriage}
            disabled={triageState.loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity disabled:opacity-50"
            style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-base)", border: "1px solid var(--border)" }}
          >
            {triageState.loading
              ? <RefreshCw size={11} className="animate-spin" />
              : <Zap size={11} style={{ color: "#F59E0B" }} />
            }
            2. Queue Triage Backlog
          </button>
          {triageState.result && (
            <span className="text-[10px]" style={{ color: "#22C55E" }}>
              {triageState.result.queued}/{triageState.result.total_untriaged} tasks queued — check Celery worker
            </span>
          )}
          {triageState.error && (
            <span className="text-[10px]" style={{ color: "#EF4444" }}>{triageState.error}</span>
          )}
        </div>
      </div>

      <p className="text-[10px] mt-3" style={{ color: "var(--text-subtle)" }}>
        Run step 1 to claim alerts ingested via the global webhook token, then step 2 to populate MITRE data and AI verdicts.
        Ensure the Celery worker is running before step 2.
      </p>
    </div>
  );
}

// ── Loading / Error states ────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-4 animate-pulse h-28"
      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="h-2.5 w-20 rounded" style={{ backgroundColor: "var(--border)" }} />
      <div className="mt-4 h-8 w-12 rounded" style={{ backgroundColor: "var(--border)" }} />
    </div>
  );
}

function LoadingState() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="h-7 w-40 rounded animate-pulse" style={{ backgroundColor: "var(--border)" }} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div
        className="rounded-xl p-6 flex flex-col items-center gap-4 text-center"
        style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.20)" }}
      >
        <XCircle size={32} style={{ color: "#EF4444" }} />
        <div>
          <p className="font-semibold" style={{ color: "var(--text-base)" }}>Failed to load SOC dashboard</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>{message}</p>
        </div>
        <button
          onClick={onRetry}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-base)", border: "1px solid var(--border)" }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SocDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState<SocDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await getSocDashboard();
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Real-time: debounce refreshes so rapid alert bursts only trigger one reload
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { messages } = useWebSocket<{ type: string }>({ channel: "alerts" });
  useEffect(() => {
    if (!messages.length) return;
    const t = messages[0].data?.type;
    if (t === "alert_new" || t === "alert_triaged") {
      if (t === "alert_new") setLiveCount((n) => n + 1);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => load(), 3000);
    }
  }, [messages, load]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { summary, per_project, recent_alerts, system_notifications, alerts_by_severity } = data;

  const severityOrder = ["critical", "high", "medium", "low", "info"];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.20)" }}
          >
            <Activity size={16} style={{ color: "#00d4ff" }} />
          </div>
          <div>
            <h1
              className="text-xl font-bold leading-none"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.02em" }}
            >
              SOC Dashboard
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
              Live security operations overview
              {liveCount > 0 && (
                <span className="ml-2 inline-flex items-center gap-1" style={{ color: "#22C55E" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse inline-block" />
                  +{liveCount} new
                </span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-[var(--bg-muted)]"
          style={{ color: "var(--text-muted)", border: "1px solid var(--border)" }}
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Admin maintenance panel — only visible to admins */}
      {user?.role === "admin" && <AdminMaintenancePanel />}

      {/* System notifications */}
      {system_notifications.length > 0 && (
        <NotificationStrip notifications={system_notifications} />
      )}

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Agents"   value={summary.total_agents}       icon={Monitor}        color="#00d4ff" />
        <StatCard label="Active Agents"  value={summary.active_agents}      icon={CheckCircle2}   color="#22C55E" />
        <StatCard label="Alerts Today"   value={summary.alerts_today}       icon={ShieldAlert}    color="#F59E0B" />
        <StatCard label="Critical Unread" value={summary.critical_unread}   icon={AlertTriangle}  color="#EF4444" danger />
      </div>

      {/* Alerts by severity */}
      {Object.keys(alerts_by_severity).length > 0 && (
        <section>
          <h2
            className="text-[10px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-subtle)" }}
          >
            Alerts by Severity — Today
          </h2>
          <div className="flex flex-wrap gap-2">
            {severityOrder.map((sev) => {
              const count = alerts_by_severity[sev];
              if (!count) return null;
              return <SeverityCountBadge key={sev} severity={sev} count={count} />;
            })}
          </div>
        </section>
      )}

      {/* Per-project cards */}
      {per_project.length > 0 && (
        <section>
          <h2
            className="text-[10px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-subtle)" }}
          >
            Projects ({per_project.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {per_project.map((p) => <ProjectCard key={p.project_id} entry={p} />)}
          </div>
        </section>
      )}

      {/* Recent alerts */}
      {recent_alerts.length > 0 && (
        <section>
          <h2
            className="text-[10px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-subtle)" }}
          >
            Recent Alerts
          </h2>
          <RecentAlertsTable alerts={recent_alerts} />
        </section>
      )}

      {/* Empty state */}
      {per_project.length === 0 && recent_alerts.length === 0 && (
        <div
          className="rounded-xl p-10 flex flex-col items-center gap-3 text-center"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          <Activity size={32} style={{ color: "var(--text-subtle)" }} />
          <p className="font-medium" style={{ color: "var(--text-muted)" }}>No project data yet</p>
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
            Create a project and connect a Wazuh agent to see live SOC data.
          </p>
        </div>
      )}
    </div>
  );
}
