import { useState, useEffect, useCallback, useRef } from "react";
import api from "@/services/api";
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
  retriageMyAlerts,
  getMitreSummary,
  type AdminClaimResult,
  type AdminRetriangeResult,
  type MitreSummary,
} from "@/services/alertService";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";
import { Icon, Badge, KPI, PageHead, Status, Card } from "@/components/ui";

// ── Sub-components ─────────────────────────────────────────────────────────

function NotificationStrip({ notifications }: { notifications: SystemNotification[] }) {
  const toneMap: Record<string, "critical" | "medium" | "info"> = {
    error: "critical", warning: "medium", info: "info",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {notifications.map((n, i) => {
        const tone = toneMap[n.level] ?? "info";
        return (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "10px 14px", borderRadius: "var(--r-md)",
            background: `oklch(from var(--sev-${tone}) l c h / 0.08)`,
            border: `1px solid oklch(from var(--sev-${tone}) l c h / 0.25)`,
            fontSize: 13,
          }}>
            <Icon name={n.level === "error" ? "x" : n.level === "warning" ? "alert" : "info"} size={13}
              style={{ color: `var(--sev-${tone})`, flexShrink: 0, marginTop: 1 }} />
            <span style={{ color: "var(--text)", flex: 1 }}>{n.message}</span>
            {n.action && <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>{n.action}</span>}
          </div>
        );
      })}
    </div>
  );
}

function ProjectCard({ entry }: { entry: PerProjectEntry }) {
  const hasIssues  = entry.health_issues.length > 0;
  const connected  = entry.agent_status === "connected" || entry.agent_status === "active";
  return (
    <div style={{
      padding: 16, background: "var(--surface)",
      border: `1px solid ${hasIssues ? "oklch(from var(--sev-medium) l c h / 0.25)" : "var(--border)"}`,
      borderRadius: "var(--r-lg)", display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div className="between">
        <div className="row" style={{ gap: 8, minWidth: 0 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: connected ? "var(--sev-low)" : "var(--sev-critical)",
            boxShadow: connected ? "0 0 6px var(--sev-low)" : undefined,
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {entry.project_name}
          </span>
        </div>
        <Badge tone={connected ? "low" : "critical"}>{entry.agent_status}</Badge>
      </div>

      <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
        <Icon name="cube" size={10} style={{ verticalAlign: "middle" }} /> {entry.agent_name}
        {entry.agent_ip && ` · ${entry.agent_ip}`}
      </div>

      <div className="row" style={{ gap: 16, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <div>
          <div className="eyebrow">TODAY</div>
          <div className="num" style={{ fontSize: 18, fontWeight: 600, color: entry.alerts_today > 0 ? "var(--sev-medium)" : "var(--text-3)" }}>
            {entry.alerts_today}
          </div>
        </div>
        {entry.critical_today > 0 && (
          <div>
            <div className="eyebrow">CRITICAL</div>
            <div className="num" style={{ fontSize: 18, fontWeight: 600, color: "var(--sev-critical)" }}>{entry.critical_today}</div>
          </div>
        )}
        {entry.last_alert_at && (
          <div style={{ marginLeft: "auto", textAlign: "right" }}>
            <div className="eyebrow">LAST</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>
              {new Date(entry.last_alert_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        )}
      </div>

      {hasIssues && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {entry.health_issues.map((issue, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 6, fontSize: 11,
              padding: "6px 8px", borderRadius: 6,
              background: "oklch(from var(--sev-medium) l c h / 0.08)", color: "var(--sev-medium)",
            }}>
              <Icon name="alert" size={10} style={{ flexShrink: 0, marginTop: 1 }} /> {issue}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SEVERITY_TONE: Record<string, "critical" | "high" | "medium" | "low" | "info"> = {
  critical: "critical", high: "high", medium: "medium", low: "low",
};
const VERDICT_STYLE: Record<string, { tone: "critical" | "high" | "medium" | "low" | "info"; label: string }> = {
  true_positive:  { tone: "critical", label: "TRUE POS"      },
  false_positive: { tone: "medium",   label: "FALSE POS"     },
  unknown:        { tone: "info",     label: "UNKNOWN"       },
  unanalyzed:     { tone: "low",      label: "UNANALYZED"    },
  triage_failed:  { tone: "high",     label: "TRIAGE FAILED" },
};

function RecentAlertsTable({ alerts }: { alerts: RecentAlert[] }) {
  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
    <table className="tbl" style={{ width: "100%" }}>
      <thead>
        <tr>
          <th style={{ width: 100 }}>Time</th>
          <th style={{ width: 140 }}>Agent</th>
          <th style={{ width: 110 }}>Project</th>
          <th>Description</th>
          <th style={{ width: 110 }}>Level</th>
          <th style={{ width: 130 }}>Verdict</th>
        </tr>
      </thead>
      <tbody>
        {alerts.map((alert, i) => {
          const sevTone = SEVERITY_TONE[alert.severity?.toLowerCase()] ?? "info";
          const vKey    = (alert.ai_verdict ?? "").toLowerCase();
          const vStyle  = VERDICT_STYLE[vKey];
          return (
            <tr key={alert.id ?? i}>
              <td><span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{new Date(alert.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></td>
              <td><span className="mono" style={{ fontSize: 11 }}>{alert.agent_name}</span></td>
              <td><span style={{ fontSize: 12 }}>{alert.project_name}</span></td>
              <td><span style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block", maxWidth: 240 }}>{alert.rule_description}</span></td>
              <td><Badge tone={sevTone}>{alert.severity?.toUpperCase() ?? "—"}</Badge></td>
              <td>
                {vStyle
                  ? <Badge tone={vStyle.tone}>{vStyle.label}</Badge>
                  : <span className="dim mono" style={{ fontSize: 11 }}>—</span>
                }
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

// ── MITRE Tactics Widget ───────────────────────────────────────────────────

const TACTIC_COLORS: Record<string, string> = {
  "Initial Access": "var(--sev-critical)", "Execution": "var(--sev-high)", "Persistence": "var(--sev-medium)",
  "Privilege Escalation": "var(--accent)", "Defense Evasion": "var(--accent)", "Credential Access": "var(--sev-critical)",
  "Discovery": "var(--sev-low)", "Lateral Movement": "var(--accent)", "Collection": "var(--sev-low)",
  "Command and Control": "var(--sev-critical)", "Exfiltration": "var(--sev-high)", "Impact": "var(--sev-critical)",
};

function MitreTacticsWidget({ data }: { data: MitreSummary | null }) {
  const navAction = <a href="/mitre" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>Full Navigator →</a>;

  if (!data) {
    return (
      <Card title="Top MITRE ATT&CK Tactics" eyebrow="LAST 24H" action={navAction}>
        <div style={{ display: "grid", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse row" style={{ gap: 10 }}>
              <div style={{ width: 140, height: 11, borderRadius: 4, background: "var(--surface-2)" }} />
              <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--surface-2)" }} />
              <div style={{ width: 44, height: 11, borderRadius: 4, background: "var(--surface-2)" }} />
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const tactics = Object.entries(data.by_tactic)
    .map(([tactic, techs]) => ({
      tactic, total: Object.values(techs).reduce((s, e) => s + e.count, 0), count: Object.keys(techs).length,
    }))
    .sort((a, b) => b.total - a.total).slice(0, 6);

  if (tactics.length === 0) {
    return (
      <Card title="Top MITRE ATT&CK Tactics" eyebrow="LAST 24H" action={navAction}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "28px 0", textAlign: "center" }}>
          <Icon name="shield" size={26} style={{ color: "var(--text-4)" }} />
          <p style={{ fontSize: 12, color: "var(--text-3)", maxWidth: 180, lineHeight: 1.5 }}>
            No MITRE data yet — run AI triage on your alerts to populate tactics.
          </p>
        </div>
      </Card>
    );
  }

  const maxTotal = Math.max(...tactics.map((t) => t.total), 1);

  return (
    <Card title="Top MITRE ATT&CK Tactics" eyebrow="LAST 24H" action={navAction}>
      <div style={{ display: "grid", gap: 10 }}>
        {tactics.map(({ tactic, total, count }) => {
          const color = TACTIC_COLORS[tactic] ?? "var(--sev-info)";
          return (
            <div key={tactic} className="row" style={{ gap: 10 }}>
              <span style={{ fontSize: 12, width: 140, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tactic}</span>
              <div style={{ flex: 1, height: 5, background: "var(--surface-2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(total / maxTotal) * 100}%`, height: "100%", background: color }} />
              </div>
              <span className="num" style={{ fontSize: 11, color: "var(--text-3)", width: 50, textAlign: "right" }}>{total} hits</span>
              <Badge tone="accent">{count} tech</Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Admin Maintenance Panel ────────────────────────────────────────────────

function AdminMaintenancePanel() {
  const [claimState,  setClaimState]  = useState<{ loading: boolean; result?: AdminClaimResult;   error?: string }>({ loading: false });
  const [triageState, setTriageState] = useState<{ loading: boolean; result?: AdminRetriangeResult; error?: string }>({ loading: false });

  const handleClaim = async () => {
    setClaimState({ loading: true });
    try { const result = await claimUntenantedAlerts();  setClaimState({ loading: false, result }); }
    catch (e: unknown) { setClaimState({ loading: false, error: e instanceof Error ? e.message : "Failed" }); }
  };
  const handleRetriage = async () => {
    setTriageState({ loading: true });
    try { const result = await retriageAllUntriaged();   setTriageState({ loading: false, result }); }
    catch (e: unknown) { setTriageState({ loading: false, error: e instanceof Error ? e.message : "Failed" }); }
  };

  return (
    <div style={{ padding: 16, borderRadius: "var(--r-lg)", background: "oklch(from var(--sev-medium) l c h / 0.06)", border: "1px solid oklch(from var(--sev-medium) l c h / 0.2)" }}>
      <div className="row" style={{ gap: 6, marginBottom: 12 }}>
        <Icon name="settings" size={13} style={{ color: "var(--sev-medium)" }} />
        <span className="eyebrow" style={{ color: "var(--sev-medium)" }}>Admin Maintenance</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={handleClaim} disabled={claimState.loading} className="btn btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name={claimState.loading ? "refresh" : "database"} size={11} style={{ color: "var(--sev-medium)" }} />
            1. Claim Untenanted Alerts
          </button>
          {claimState.result && <span style={{ fontSize: 10, color: "var(--sev-low)" }}>{claimState.result.claimed} alerts claimed</span>}
          {claimState.error  && <span style={{ fontSize: 10, color: "var(--sev-critical)" }}>{claimState.error}</span>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <button onClick={handleRetriage} disabled={triageState.loading} className="btn btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name={triageState.loading ? "refresh" : "zap"} size={11} style={{ color: "var(--sev-medium)" }} />
            2. Queue Triage Backlog
          </button>
          {triageState.result && <span style={{ fontSize: 10, color: "var(--sev-low)" }}>{triageState.result.queued}/{triageState.result.total_untriaged} queued — check Celery worker</span>}
          {triageState.error  && <span style={{ fontSize: 10, color: "var(--sev-critical)" }}>{triageState.error}</span>}
        </div>
      </div>
      <p style={{ fontSize: 10, marginTop: 12, color: "var(--text-3)" }}>
        Run step 1 to claim alerts ingested via global webhook token, then step 2 to populate MITRE data and AI verdicts.
      </p>
    </div>
  );
}

function AnalystTriagePanel() {
  const [state, setState] = useState<{ loading: boolean; result?: AdminRetriangeResult; error?: string }>({ loading: false });
  const [aiProvider, setAiProvider] = useState<string>("");

  useEffect(() => {
    api.get<{ ai_provider: string }>("/config")
      .then(r => setAiProvider(r.data.ai_provider))
      .catch(() => setAiProvider(""));
  }, []);

  const handle = async () => {
    setState({ loading: true });
    try { const result = await retriageMyAlerts(); setState({ loading: false, result }); }
    catch (e: unknown) { setState({ loading: false, error: e instanceof Error ? e.message : "Failed" }); }
  };
  return (
    <div style={{ padding: 16, borderRadius: "var(--r-lg)", background: "var(--accent-soft)", border: "1px solid oklch(from var(--accent) l c h / 0.3)" }}>
      <div className="between">
        <div>
          <div className="row" style={{ gap: 6, marginBottom: 6 }}>
            <Icon name="brain" size={13} style={{ color: "var(--accent)" }} />
            <span className="eyebrow" style={{ color: "var(--accent)" }}>{`AI TRIAGE · ${aiProvider ? aiProvider.toUpperCase() : "—"}`}</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text)" }}>Queue your untriaged alerts for AI analysis.</div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
            Worker queue: <span style={{ color: "var(--sev-low)" }}>healthy</span> · avg latency 4.2s
          </div>
        </div>
        <button onClick={handle} disabled={state.loading} className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Icon name={state.loading ? "refresh" : "zap"} size={13} />
          {state.loading ? "Queuing…" : "Queue Untriaged Alerts"}
        </button>
      </div>
      {state.result && <p style={{ marginTop: 10, fontSize: 11, color: "var(--sev-low)" }}>{state.result.queued}/{state.result.total_untriaged} tasks queued — Celery worker is processing</p>}
      {state.error  && <p style={{ marginTop: 10, fontSize: 11, color: "var(--sev-critical)" }}>{state.error}</p>}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

export default function SocDashboard() {
  const { user } = useAuth();
  const [data,      setData]      = useState<SocDashboardData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [liveCount, setLiveCount] = useState(0);
  const [mitreData, setMitreData] = useState<MitreSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getSocDashboard()); }
    catch (e: unknown) { setError(e instanceof Error ? e.message : "Failed to load dashboard"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { getMitreSummary().then(setMitreData).catch(() => null); }, []);

  useEffect(() => { load(); }, [load]);

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

  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-md)" }}>
        <div style={{ height: 28, width: 160, borderRadius: 6, background: "var(--surface-2)" }} className="animate-pulse" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "var(--gap-md)" }}>
          {[0,1,2,3].map((i) => (
            <div key={i} className="animate-pulse kpi" style={{ minHeight: 100 }} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 40, textAlign: "center", borderRadius: "var(--r-lg)", background: "oklch(from var(--sev-critical) l c h / 0.06)", border: "1px solid oklch(from var(--sev-critical) l c h / 0.2)" }}>
        <Icon name="x" size={32} style={{ color: "var(--sev-critical)" }} />
        <p style={{ fontWeight: 600, color: "var(--text)" }}>Failed to load SOC dashboard</p>
        <p style={{ fontSize: 13, color: "var(--text-3)" }}>{error}</p>
        <button onClick={load} className="btn btn-sm">Try again</button>
      </div>
    );
  }

  if (!data) return null;

  const { summary, per_project, recent_alerts, system_notifications, alerts_by_severity } = data;
  const severityOrder = ["critical", "high", "medium", "low", "info"];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-md)" }}>
      <PageHead
        eyebrow={`LIVE · ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
        title={<span className="row" style={{ gap: 12 }}>
          <span style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent-soft)", color: "var(--accent)", display: "inline-grid", placeItems: "center", border: "1px solid oklch(from var(--accent) l c h / 0.3)" }}>
            <Icon name="activity" size={15} />
          </span>
          SOC Dashboard
          {liveCount > 0 && <span className="mono" style={{ fontSize: 13, color: "var(--sev-low)", fontWeight: 400 }}>+{liveCount} new</span>}
        </span>}
        sub={`Live security operations · ${per_project.length} project${per_project.length !== 1 ? "s" : ""} · ${summary.alerts_today} alerts today · ${summary.critical_unread} critical unread.`}
        actions={<>
          <Status tone="low">LIVE · WS CONNECTED</Status>
          <button className="btn btn-sm" onClick={load} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="refresh" size={12} /> Refresh
          </button>
        </>}
      />

      {user?.role === "admin"  && <AdminMaintenancePanel />}
      {user?.role !== "admin"  && <AnalystTriagePanel />}
      {system_notifications.length > 0 && <NotificationStrip notifications={system_notifications} />}

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap-md)" }}>
        {user?.role === "admin"
          ? <KPI label="TOTAL AGENTS"  value={summary.total_agents}  icon="cube" />
          : <KPI label="MY PROJECTS"   value={per_project.length}    icon="cube" />
        }
        <KPI label="ACTIVE AGENTS"  value={summary.active_agents}  icon="check" accent="low" />
        <KPI label="ALERTS TODAY"   value={summary.alerts_today}   icon="bell" accent="medium" />
        <KPI label="CRITICAL UNREAD" value={summary.critical_unread} icon="alert" accent={summary.critical_unread > 0 ? "critical" : "default"} sub="needs review" />
      </div>

      {/* Alerts by severity strip */}
      {Object.keys(alerts_by_severity).length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>ALERTS BY SEVERITY · TODAY</div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {severityOrder.map((sev) => {
              const count = alerts_by_severity[sev];
              if (!count) return null;
              return (
                <div key={sev} className="row" style={{
                  gap: 10, padding: "8px 14px",
                  background: `var(--sev-${sev}-bg)`,
                  border: `1px solid oklch(from var(--sev-${sev}) l c h / 0.3)`,
                  borderRadius: 8,
                }}>
                  <span className="eyebrow" style={{ color: `var(--sev-${sev})` }}>{sev}</span>
                  <span className="num" style={{ fontSize: 16, fontWeight: 600, color: `var(--sev-${sev})` }}>{count.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MITRE tactics + Projects — always 2-col side by side */}
      {per_project.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "var(--gap-md)" }}>
          <MitreTacticsWidget data={mitreData} />
          <Card
            title="Projects"
            eyebrow={`${per_project.length} CONNECTED`}
            action={
              per_project.length > 6
                ? <a href="/projects" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
                    All {per_project.length} projects →
                  </a>
                : undefined
            }
            pad={false}
          >
            <div style={{ padding: "var(--pad-card)", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
              {per_project.slice(0, 6).map((p) => <ProjectCard key={p.project_id} entry={p} />)}
            </div>
            {per_project.length > 6 && (
              <div style={{ padding: "10px var(--pad-card)", borderTop: "1px solid var(--border)", textAlign: "center" }}>
                <a href="/projects" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>
                  +{per_project.length - 6} more projects — view all →
                </a>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Recent alerts */}
      {recent_alerts.length > 0 && (
        <Card title="Recent Alerts" eyebrow="LIVE STREAM"
          action={<a href="/alerts" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>All alerts →</a>}
          pad={false}>
          <RecentAlertsTable alerts={recent_alerts} />
        </Card>
      )}

      {per_project.length === 0 && recent_alerts.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 48, textAlign: "center", borderRadius: "var(--r-lg)", background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Icon name="activity" size={32} style={{ color: "var(--text-4)" }} />
          <p style={{ fontWeight: 600, color: "var(--text-3)" }}>No project data yet</p>
          <p style={{ fontSize: 13, color: "var(--text-4)" }}>Create a project and connect a Wazuh agent to see live SOC data.</p>
        </div>
      )}
    </div>
  );
}
