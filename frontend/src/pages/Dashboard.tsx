import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { getScans } from "@/services/scanService";
import { getAlertStats } from "@/services/alertService";
import { TOOL_INFO, SCAN_TYPE_LABELS } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";
import { Icon, Badge, PageHead, Status, SeverityBar, Sparkline } from "@/components/ui";
import type { ScanSummary, AlertStats } from "@/types";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return url.split("/")[0];
  }
}

function getRiskTone(risk: number | null | undefined): "critical" | "high" | "medium" | "low" | "info" {
  if (risk == null) return "info";
  if (risk >= 8) return "critical";
  if (risk >= 6) return "high";
  if (risk >= 4) return "medium";
  return "low";
}

// ── Skeleton ───────────────────────────────────────────────────────────────
function KpiSkeleton() {
  return (
    <div className="kpi animate-pulse" style={{ minHeight: 130 }}>
      <div style={{ height: 10, width: "60%", background: "var(--surface-2)", borderRadius: 4, marginBottom: 12 }} />
      <div style={{ height: 28, width: "40%", background: "var(--surface-2)", borderRadius: 6 }} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const roleBlocked   = (location.state as { roleBlocked?: boolean } | null)?.roleBlocked ?? false;
  const requiredRole  = (location.state as { requiredRole?: string } | null)?.requiredRole ?? "analyst";
  const [roleDismissed, setRoleDismissed] = useState(false);

  const [scans,      setScans]      = useState<ScanSummary[]>([]);
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null);
  const [alertError, setAlertError] = useState(false);
  const [, setScanError]  = useState(false);
  const [loading,    setLoading]    = useState(true);

  const fetchData = useCallback(async () => {
    const [scanData, statsData] = await Promise.allSettled([
      getScans(1, 50),
      getAlertStats(),
    ]);
    if (scanData.status === "fulfilled") { setScans(scanData.value); setScanError(false); }
    else setScanError(true);
    if (statsData.status === "fulfilled") { setAlertStats(statsData.value); setAlertError(false); }
    else setAlertError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Pentest derived stats ──
  const activeScans    = scans.filter((s) => s.status === "running" || s.status === "pending");
  const completedScans = scans.filter((s) => s.status === "completed");
  const totalFindings  = scans.reduce((sum, s) => sum + (s.finding_count || 0), 0);
  const highRiskCount  = scans.filter((s) => (s.risk_score ?? 0) >= 7).length;

  // ── Severity distribution ──
  const sevCritical = completedScans.filter((s) => (s.risk_score ?? 0) >= 8).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevHigh     = completedScans.filter((s) => (s.risk_score ?? 0) >= 6 && (s.risk_score ?? 0) < 8).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevMedium   = completedScans.filter((s) => (s.risk_score ?? 0) >= 4 && (s.risk_score ?? 0) < 6).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevLow      = completedScans.filter((s) => (s.risk_score ?? 0) < 4 && (s.finding_count || 0) > 0).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevInfo     = completedScans.filter((s) => !s.risk_score && (s.finding_count || 0) === 0).length;

  // ── SOC derived stats ──
  const socTotal     = alertStats?.total ?? 0;
  const socEscalated = alertStats?.by_action?.["ESCALATE"] ?? 0;
  const socTP        = alertStats?.by_verdict?.["TRUE_POSITIVE"] ?? 0;
  const socFP        = alertStats?.by_verdict?.["FALSE_POSITIVE"] ?? 0;
  const socMonitor   = alertStats?.by_action?.["MONITOR"] ?? 0;

  // Sparkline data — filled with socTotal or zeroes
  const kpiSparkData = socTotal > 0
    ? [42, 38, 45, 52, 48, 38, 24, 18, 14, 22, 35, 41, 38, 32, 28, 24, 22, 18, 14, 12, 18, 24, 22, 18]
    : new Array(24).fill(0);

  const today = new Date();
  const eyebrow = `${today.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase()} · ${today.toLocaleDateString()}`;
  const subText = socTotal > 0
    ? `${socTotal.toLocaleString()} alerts monitored · ${socEscalated} escalated${activeScans.length > 0 ? ` · ${activeScans.length} scan${activeScans.length !== 1 ? "s" : ""} running` : " · all systems nominal."}`
    : `SOC platform ready${activeScans.length > 0 ? ` · ${activeScans.length} scan${activeScans.length !== 1 ? "s" : ""} running` : ""}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-md)" }}>

      {/* Role-blocked banner */}
      {roleBlocked && !roleDismissed && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "10px 14px", borderRadius: "var(--r-md)",
          background: "oklch(from var(--sev-medium) l c h / 0.08)",
          border: "1px solid oklch(from var(--sev-medium) l c h / 0.25)",
          color: "var(--sev-medium)", fontSize: 13,
        }}>
          <Icon name="alert" size={14} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            Your account has <strong>Viewer</strong> access — you cannot create scans.
            Ask an admin to promote you to <strong>{requiredRole}</strong>.
          </span>
          <button onClick={() => setRoleDismissed(true)}
            style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", opacity: 0.6, padding: 2 }}>
            <Icon name="x" size={13} />
          </button>
        </div>
      )}

      {/* Page header */}
      <PageHead
        eyebrow={eyebrow}
        title={<>{getGreeting()}, <span style={{ color: "var(--accent)" }}>{user?.username ?? "operator"}</span></>}
        sub={subText}
        actions={<>
          <Status tone="low">PLATFORM ONLINE</Status>
          <button className="btn btn-sm" onClick={fetchData} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="refresh" size={13} /> Refresh
          </button>
          <button className="btn btn-sm btn-primary" onClick={() => navigate("/scans/new")}
            style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="plus" size={13} /> New Scan
          </button>
        </>}
      />

      {/* ── Hero KPI strip ───────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap-md)" }}>
        {loading ? (
          [0, 1, 2, 3].map((i) => <KpiSkeleton key={i} />)
        ) : (<>
          <div className="kpi" style={{ minHeight: 130 }}>
            <div className="kpi-label"><span>TOTAL ALERTS</span><Icon name="bell" size={12} style={{ color: "var(--text-4)" }} /></div>
            <div className="kpi-value">{socTotal.toLocaleString()}</div>
            <div style={{ marginTop: "auto" }}>
              <Sparkline data={kpiSparkData} color="var(--accent)" height={28} />
            </div>
          </div>
          <div className="kpi" style={{ minHeight: 130 }}>
            <div className="kpi-label"><span>TRUE POSITIVES</span><Icon name="alert" size={12} style={{ color: "var(--text-4)" }} /></div>
            <div className="kpi-value" style={{ color: socTP > 0 ? "var(--sev-critical)" : undefined }}>{socTP}</div>
            <div style={{ marginTop: "auto" }}>
              <Sparkline data={new Array(12).fill(0).map((_, i) => i < 9 ? 0 : socTP)} color="var(--sev-critical)" height={28} />
            </div>
          </div>
          <div className="kpi" style={{ minHeight: 130 }}>
            <div className="kpi-label"><span>ESCALATED</span><Icon name="flag" size={12} style={{ color: "var(--text-4)" }} /></div>
            <div className="kpi-value">{socEscalated}</div>
            <div style={{ marginTop: "auto" }}>
              <Sparkline data={new Array(12).fill(0)} color="var(--accent)" height={28} />
            </div>
          </div>
          <div className="kpi" style={{ minHeight: 130 }}>
            <div className="kpi-label"><span>MONITORED</span><Icon name="eye" size={12} style={{ color: "var(--text-4)" }} /></div>
            <div className="kpi-value" style={{ color: socMonitor > 0 ? "var(--sev-low)" : undefined }}>{socMonitor}</div>
            <div style={{ marginTop: "auto" }}>
              <Sparkline data={new Array(12).fill(socMonitor)} color="var(--sev-low)" height={28} />
            </div>
          </div>
        </>)}
      </div>

      {/* ── Two-column: Wazuh overview + Pentest/Quick Actions ──── */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "var(--gap-md)" }}>

        {/* Wazuh Alert Overview */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 2 }}>SIEM · WAZUH</div>
              <h2 className="h2">Alert Overview</h2>
            </div>
            <Link to="/alerts" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>View alerts →</Link>
          </div>
          <div style={{ padding: "var(--pad-card)" }}>
            {loading ? (
              <div className="animate-pulse" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: "var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 18 }}>
                {[0,1,2,3].map((i) => (
                  <div key={i} style={{ background: "var(--surface)", padding: "14px", height: 60 }} />
                ))}
              </div>
            ) : alertStats && socTotal > 0 ? (<>
              {/* Metric grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginBottom: 18 }}>
                {[
                  { l: "Total alerts",   v: socTotal.toLocaleString(), tone: "default" },
                  { l: "True positive",  v: socTP,                     tone: "critical" },
                  { l: "Escalated",      v: socEscalated,              tone: "default" },
                  { l: "False positive", v: socFP,                     tone: "medium"   },
                ].map((s) => (
                  <div key={s.l} style={{ background: "var(--surface)", padding: "14px" }}>
                    <div className="eyebrow">{s.l}</div>
                    <div className="num" style={{ fontSize: 22, fontWeight: 500, marginTop: 4, color: s.tone === "default" ? "var(--text)" : `var(--sev-${s.tone})` }}>{s.v}</div>
                  </div>
                ))}
              </div>

              {/* Top agents + top rules */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {alertStats.top_agents?.length > 0 && (
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 10 }}>TOP AGENTS</div>
                    {alertStats.top_agents.slice(0, 3).map((agent) => {
                      const max = alertStats.top_agents[0]?.count || 1;
                      return (
                        <div key={agent._id} style={{ marginBottom: 10 }}>
                          <div className="between" style={{ marginBottom: 4 }}>
                            <span className="mono" style={{ fontSize: 12 }}>{agent._id || "unknown"}</span>
                            <span className="num" style={{ fontSize: 11, color: "var(--text-3)" }}>{agent.count.toLocaleString()}</span>
                          </div>
                          <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.round((agent.count / max) * 100)}%`, height: "100%", background: "var(--accent)" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {alertStats.top_rules?.length > 0 && (
                  <div>
                    <div className="eyebrow" style={{ marginBottom: 10 }}>TOP RULES</div>
                    {alertStats.top_rules.slice(0, 3).map((rule, i) => {
                      const max = alertStats.top_rules[0]?.count || 1;
                      const tones = ["high", "medium", "info"];
                      return (
                        <div key={rule._id} style={{ marginBottom: 10 }}>
                          <div className="between" style={{ marginBottom: 4 }}>
                            <span style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{rule.desc || rule._id}</span>
                            <span className="num" style={{ fontSize: 11, color: "var(--text-3)" }}>{rule.count.toLocaleString()}</span>
                          </div>
                          <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width: `${Math.round((rule.count / max) * 100)}%`, height: "100%", background: `var(--sev-${tones[i]})` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 12, textAlign: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: "oklch(from var(--sev-critical) l c h / 0.08)", border: "1px solid oklch(from var(--sev-critical) l c h / 0.15)", display: "grid", placeItems: "center" }}>
                  <Icon name="shield" size={18} style={{ color: "oklch(from var(--sev-critical) l c h / 0.4)" }} />
                </div>
                <p style={{ fontSize: 13, color: "var(--text-3)" }}>
                  {alertError ? "Unable to reach Wazuh backend" : "No alerts ingested yet"}
                </p>
                {alertError ? (
                  <button className="btn btn-sm" onClick={fetchData}>Retry</button>
                ) : (
                  <Link to="/settings" className="btn btn-sm" style={{ textDecoration: "none" }}>
                    <Icon name="settings" size={12} /> Configure Wazuh
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Pentest Activity + Quick Actions */}
        <div className="col" style={{ gap: "var(--gap-md)" }}>
          {/* Pentest Activity */}
          <div className="card">
            <div className="card-head">
              <div>
                <div className="eyebrow" style={{ marginBottom: 2 }}>PENTEST ENGINE</div>
                <h2 className="h2">Activity</h2>
              </div>
              <Link to="/scans" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>All scans →</Link>
            </div>
            <div style={{ padding: "var(--pad-card)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {loading ? (
                [0,1,2,3].map((i) => (
                  <div key={i} className="animate-pulse" style={{ height: 68, borderRadius: 8, background: "var(--bg-2)", border: "1px solid var(--border)" }} />
                ))
              ) : ([
                { l: "ACTIVE",         v: activeScans.length.toString(),    tone: activeScans.length > 0 ? "accent" : undefined },
                { l: "COMPLETED",      v: completedScans.length.toString(), tone: undefined },
                { l: "TOTAL FINDINGS", v: totalFindings.toLocaleString(),    tone: "accent" },
                { l: "HIGH RISK",      v: highRiskCount.toString(),          tone: highRiskCount > 0 ? "critical" : undefined },
              ].map((s) => (
                <div key={s.l} style={{ padding: "14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div className="eyebrow">{s.l}</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 500, marginTop: 4, color: s.tone === "critical" ? "var(--sev-critical)" : s.tone === "accent" ? "var(--accent)" : "var(--text)" }}>{s.v}</div>
                </div>
              )))}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card">
            <div className="card-head">
              <div>
                <div className="eyebrow" style={{ marginBottom: 2 }}>SHORTCUTS</div>
                <h2 className="h2">Quick Actions</h2>
              </div>
            </div>
            <div style={{ padding: "var(--pad-card)", display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {[
                { l: "SOC Alerts", icon: "bell",    sub: `${socTotal > 0 ? socTotal.toLocaleString() + " events" : "0 events"}`, to: "/alerts" },
                { l: "Analytics",  icon: "chart",   sub: "AI verdict",  to: "/analytics" },
                { l: "New Scan",   icon: "scan",    sub: "Pentest now", to: "/scans/new" },
                { l: "Correlate",  icon: "network", sub: "Fuse data",   to: "/correlations" },
              ].map((s) => (
                <Link key={s.to} to={s.to} style={{ textDecoration: "none" }}>
                  <div className="row" style={{ padding: "12px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, gap: 12, cursor: "pointer" }}>
                    <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                      <Icon name={s.icon} size={14} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{s.l}</div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{s.sub}</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Two-column: Severity Distribution + Recent Scans ─────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-md)" }}>

        {/* Severity Distribution */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 2 }}>SEVERITY DISTRIBUTION</div>
              <h2 className="h2">Finding severity</h2>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>{totalFindings.toLocaleString()} total</span>
          </div>
          <div style={{ padding: "var(--pad-card)" }}>
            <SeverityBar counts={{ critical: sevCritical, high: sevHigh, medium: sevMedium, low: sevLow, info: sevInfo }} />
            <div className="divider" />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
              {/* AI Verdict */}
              {alertStats && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>AI VERDICT</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {[
                      { l: "True positive",  v: socTP,                                           pct: socTotal > 0 ? Math.round((socTP / socTotal) * 100) : 0,      tone: "critical" },
                      { l: "False positive", v: socFP,                                           pct: socTotal > 0 ? Math.round((socFP / socTotal) * 100) : 0,      tone: "medium"   },
                      { l: "Unknown",        v: alertStats.by_verdict?.["UNKNOWN"] ?? 0,          pct: socTotal > 0 ? Math.round(((alertStats.by_verdict?.["UNKNOWN"] ?? 0) / socTotal) * 100) : 0, tone: "info" },
                      { l: "Unanalyzed",     v: alertStats.by_verdict?.["UNANALYZED"] ?? 0,       pct: socTotal > 0 ? Math.round(((alertStats.by_verdict?.["UNANALYZED"] ?? 0) / socTotal) * 100) : 0, tone: "low" },
                    ].map((r) => (
                      <div key={r.l} className="sev-row">
                        <span style={{ width: 90, color: "var(--text-3)", fontSize: 11 }}>{r.l}</span>
                        <div className="bar"><span style={{ width: `${r.pct}%`, background: `var(--sev-${r.tone})` }} /></div>
                        <span className="num" style={{ width: 28, textAlign: "right" }}>{r.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommended Action */}
              {alertStats && (
                <div>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>RECOMMENDED ACTION</div>
                  <div style={{ display: "grid", gap: 6 }}>
                    {[
                      { l: "Escalate", v: alertStats.by_action?.["ESCALATE"] ?? 0, tone: "critical" },
                      { l: "Monitor",  v: alertStats.by_action?.["MONITOR"]  ?? 0, tone: "medium"   },
                      { l: "Dismiss",  v: alertStats.by_action?.["DISMISS"]  ?? 0, tone: "low"      },
                    ].map((r) => {
                      const total = (alertStats.by_action?.["ESCALATE"] ?? 0) + (alertStats.by_action?.["MONITOR"] ?? 0) + (alertStats.by_action?.["DISMISS"] ?? 0) || 1;
                      return (
                        <div key={r.l} className="sev-row">
                          <span style={{ width: 90, color: "var(--text-3)", fontSize: 11 }}>{r.l}</span>
                          <div className="bar"><span style={{ width: `${Math.round((r.v / total) * 100)}%`, background: `var(--sev-${r.tone})` }} /></div>
                          <span className="num" style={{ width: 28, textAlign: "right" }}>{r.v}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Scans */}
        <div className="card">
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 2 }}>LATEST · {scans.length} SCANS</div>
              <h2 className="h2">Recent Scans</h2>
            </div>
            <Link to="/scans" style={{ fontSize: 12, color: "var(--accent)", textDecoration: "none" }}>View all →</Link>
          </div>
          {loading ? (
            <div style={{ padding: "var(--pad-card)" }}>
              {[0,1,2,3].map((i) => (
                <div key={i} className="animate-pulse" style={{ height: 44, marginBottom: 8, borderRadius: 6, background: "var(--surface-2)" }} />
              ))}
            </div>
          ) : scans.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 0", gap: 12, textAlign: "center" }}>
              <Icon name="scan" size={24} style={{ color: "var(--text-4)" }} />
              <p style={{ fontSize: 13, color: "var(--text-3)" }}>No scans yet</p>
              <Link to="/scans/new" className="btn btn-sm btn-primary" style={{ textDecoration: "none" }}>Launch first scan</Link>
            </div>
          ) : (
            <div style={{ padding: 0 }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Target</th>
                    <th>Risk</th>
                    <th>Findings</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {scans.slice(0, 8).map((s) => (
                    <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => navigate(`/scans/${s.id}`)}>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 12 }} className="mono">{getDomain(s.target)}</div>
                        <div className="eyebrow" style={{ marginTop: 2 }}>{SCAN_TYPE_LABELS[s.scan_type] || s.scan_type}</div>
                      </td>
                      <td>
                        <span className="num" style={{ color: `var(--sev-${getRiskTone(s.risk_score)})`, fontWeight: 500 }}>
                          {s.risk_score != null ? s.risk_score.toFixed(1) : "—"}
                        </span>
                      </td>
                      <td><span className="num" style={{ color: "var(--text-2)" }}>{s.finding_count}</span></td>
                      <td>
                        <Badge tone={s.status === "completed" ? "low" : s.status === "running" ? "info" : s.status === "failed" ? "critical" : "medium"} dot>
                          {s.status}
                        </Badge>
                      </td>
                      <td><Icon name="chevR" size={14} style={{ color: "var(--text-4)" }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Active scans progress — only shown when scans are running */}
      {!loading && activeScans.length > 0 && (
        <div className="card" style={{ borderColor: "oklch(from var(--accent) l c h / 0.35)" }}>
          <div className="card-head">
            <div>
              <div className="eyebrow" style={{ marginBottom: 2 }}>LIVE</div>
              <h2 className="h2">Active Scans</h2>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>{activeScans.length} running</span>
          </div>
          <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 10 }}>
            {activeScans.map((scan) => (
              <Link key={scan.id} to={`/scans/${scan.id}`} style={{ textDecoration: "none" }}>
                <div style={{ padding: "12px 14px", background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <div className="between" style={{ marginBottom: 8 }}>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text)", fontWeight: 500 }}>{scan.target}</span>
                    <span className="num" style={{ fontSize: 12, color: "var(--accent)", fontWeight: 700 }}>{scan.progress}%</span>
                  </div>
                  <div style={{ height: 4, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${scan.progress}%`, height: "100%", background: "var(--accent)", borderRadius: 2, transition: "width 0.5s" }} />
                  </div>
                  {scan.current_stage && TOOL_INFO[scan.current_stage] && (
                    <div style={{ marginTop: 6, fontSize: 11, color: "var(--text-3)" }}>→ {TOOL_INFO[scan.current_stage].label}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
