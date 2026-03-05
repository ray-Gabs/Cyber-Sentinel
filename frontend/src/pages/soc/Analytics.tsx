import { useEffect, useState } from "react";
import { getAlertStats } from "@/services/alertService";
import { getPentestAnalytics } from "@/services/analyticsService";
import type { PentestAnalytics, AnalyticsRange } from "@/services/analyticsService";
import type { AlertStats } from "@/types";
import { Icon, KPI, PageHead, Card, Bars, Donut } from "@/components/ui";
import { exportToPDF } from "@/lib/pdfExport";

type Tone = "critical" | "high" | "medium" | "low" | "info";
const SEV_ORDER: Tone[] = ["critical", "high", "medium", "low", "info"];

export default function Analytics() {
  const [stats,          setStats]          = useState<AlertStats | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState(false);
  const [pentest,        setPentest]        = useState<PentestAnalytics | null>(null);
  const [pentestLoading, setPentestLoading] = useState(true);
  const [pentestError,   setPentestError]   = useState(false);
  const [range,          setRange]          = useState<AnalyticsRange>("30d");

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try { setStats(await getAlertStats()); }
    catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  };

  const loadPentest = async (r: AnalyticsRange = range) => {
    setPentestLoading(true); setPentestError(false);
    try { setPentest(await getPentestAnalytics(r)); }
    catch { setPentestError(true); }
    finally { setPentestLoading(false); }
  };

  useEffect(() => { load(); loadPentest(); }, []);

  const socTotal = stats?.total ?? 0;
  const socTP    = stats?.by_verdict?.["TRUE_POSITIVE"]  ?? 0;
  const socFP    = stats?.by_verdict?.["FALSE_POSITIVE"] ?? 0;
  const socEsc   = stats?.by_action?.["ESCALATE"]        ?? 0;

  // Verdict donut segments
  const verdictSegments = stats ? [
    { value: socTP,                                         color: "var(--sev-critical)" },
    { value: socFP,                                         color: "var(--sev-medium)"   },
    { value: stats.by_verdict?.["UNKNOWN"] ?? 0,           color: "var(--sev-info)"     },
    { value: stats.by_verdict?.["UNANALYZED"] ?? 0,        color: "var(--sev-low)"      },
  ] : [];

  // Action donut segments
  const actionSegments = stats ? [
    { value: stats.by_action?.["ESCALATE"] ?? 0, color: "var(--sev-critical)" },
    { value: stats.by_action?.["MONITOR"]  ?? 0, color: "var(--sev-medium)"   },
    { value: stats.by_action?.["DISMISS"]  ?? 0, color: "var(--sev-low)"      },
  ] : [];

  // Severity bars data
  const severityBars = stats
    ? SEV_ORDER.map((s) => ({ label: s, value: stats.by_severity?.[s] ?? 0, color: `var(--sev-${s})` }))
    : [];

  // Top agents bars
  const agentBars = (stats?.top_agents ?? []).slice(0, 6).map((a) => ({
    label: (a._id || "unknown").slice(0, 14),
    value: a.count,
    color: "var(--accent)",
  }));

  // Pentest findings severity bars
  const pentestSevBars = pentest ? SEV_ORDER.map((s) => ({
    label: s,
    value: (pentest.findings_by_severity as unknown as Record<string, number>)[s] ?? 0,
    color: `var(--sev-${s})`,
  })) : [];

  // Pentest scans over time bars (last 10 days)
  const scanTimeBars = (pentest?.scans_over_time ?? []).slice(-10).map((d) => ({
    label: d.date.slice(-5),
    value: d.count,
    color: "var(--sev-medium)",
  }));

  // Alerts over time from daily_counts (last 14 days)
  const alertTimeBars = (stats?.daily_counts ?? []).slice(-14).map((d) => ({
    label: (d.date ?? "").slice(-5),
    value: d.count,
    color: "var(--accent)",
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-md)" }}>

      <PageHead
        eyebrow="ANALYTICS"
        title="Platform Analytics"
        sub={`${socTotal.toLocaleString()} total alerts ingested · last 30 days.`}
        actions={<>
          {(["7d", "30d", "90d"] as AnalyticsRange[]).map((r) => (
            <button key={r} onClick={() => { setRange(r); loadPentest(r); }}
              className={`btn btn-sm${range === r ? " btn-primary" : ""}`}>
              {r}
            </button>
          ))}
          <button
            className="btn btn-sm"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => {
              const socRows = [
                { metric: "Total Alerts",    value: String(socTotal)  },
                { metric: "True Positives",  value: String(socTP)     },
                { metric: "False Positives", value: String(socFP)     },
                { metric: "Escalated",       value: String(socEsc)    },
                { metric: "Unknown",         value: String(stats?.by_verdict?.["UNKNOWN"]   ?? 0) },
                { metric: "Unanalyzed",      value: String(stats?.by_verdict?.["UNANALYZED"] ?? 0) },
                { metric: "Monitor Actions", value: String(stats?.by_action?.["MONITOR"]    ?? 0) },
                { metric: "Dismiss Actions", value: String(stats?.by_action?.["DISMISS"]    ?? 0) },
              ];
              const pentestRows = pentest ? [
                { metric: "Total Scans",         value: String(pentest.total_scans)  },
                { metric: "Avg Scan Duration",   value: `${pentest.avg_scan_duration_seconds}s` },
                { metric: "Wazuh Alerts",        value: String(pentest.total_alerts) },
                { metric: "Critical Findings",   value: String((pentest.findings_by_severity as unknown as Record<string, number>)["critical"] ?? 0) },
                { metric: "High Findings",       value: String((pentest.findings_by_severity as unknown as Record<string, number>)["high"]     ?? 0) },
                { metric: "Medium Findings",     value: String((pentest.findings_by_severity as unknown as Record<string, number>)["medium"]   ?? 0) },
                { metric: "Low Findings",        value: String((pentest.findings_by_severity as unknown as Record<string, number>)["low"]      ?? 0) },
              ] : [];
              exportToPDF(
                "Platform Analytics Report",
                `SOC + Pentest metrics · range: ${range} · ${new Date().toLocaleDateString()}`,
                [{ key: "metric", label: "Metric" }, { key: "value", label: "Value" }],
                [...socRows, ...pentestRows],
                "analytics-report"
              );
            }}
          >
            <Icon name="download" size={12} /> Export
          </button>
          <button className="btn btn-sm" onClick={() => load(true)} disabled={refreshing}
            style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="refresh" size={12} style={{ animation: refreshing ? "spin 1s linear infinite" : undefined }} />
            Refresh
          </button>
        </>}
      />

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap-md)" }}>
        {loading ? (
          [0,1,2,3].map((i) => <div key={i} className="kpi animate-pulse" style={{ minHeight: 80 }} />)
        ) : (<>
          <KPI label="TOTAL ALERTS"    value={socTotal.toLocaleString()} sub="↑ ingested" icon="bell" />
          <KPI label="TRUE POSITIVES"  value={socTP} accent={socTP > 0 ? "critical" : "default"} sub={`${socTotal > 0 ? ((socTP / socTotal) * 100).toFixed(2) : "0.00"}% rate`} icon="alert" />
          <KPI label="ESCALATED"       value={socEsc} accent={socEsc > 0 ? "high" : "default"} sub="paged" icon="flag" />
          <KPI label="FALSE POSITIVES" value={socFP} accent="medium" sub="auto-dismissed" icon="check" />
        </>)}
      </div>

      {error || (!loading && (!stats || socTotal === 0)) ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 60, textAlign: "center", borderRadius: "var(--r-lg)", background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Icon name="chart" size={32} style={{ color: "var(--text-4)" }} />
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)" }}>{error ? "Could not load analytics" : "No data yet"}</p>
          <p style={{ fontSize: 12, color: "var(--text-4)", maxWidth: 320 }}>
            {error ? "Check your backend connection and try again." : "Analytics will appear once Wazuh alerts are ingested."}
          </p>
          {error && <button className="btn btn-sm" onClick={() => load()}>Retry</button>}
        </div>
      ) : !loading && stats && (<>

        {/* Row 1: alerts over time + verdict breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-md)" }}>
          <Card title="Alerts Over Time" eyebrow="VOLUME · 30 DAYS">
            {alertTimeBars.length > 0
              ? <Bars data={alertTimeBars} height={180} />
              : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180 }}><p style={{ fontSize: 13, color: "var(--text-3)" }}>No timeline data</p></div>
            }
          </Card>
          <Card title="AI Verdict Breakdown" eyebrow="TRIAGE">
            <div className="row" style={{ gap: 24, padding: "12px 0" }}>
              <Donut size={170} thickness={18} label={String(socTP + socFP + (stats.by_verdict?.["UNKNOWN"] ?? 0))} sub="ANALYZED" segments={verdictSegments} />
              <div style={{ flex: 1, display: "grid", gap: 10 }}>
                {[
                  { l: "True positive",  v: socTP,                                    tone: "critical" as Tone },
                  { l: "False positive", v: socFP,                                    tone: "medium"   as Tone },
                  { l: "Unknown",        v: stats.by_verdict?.["UNKNOWN"] ?? 0,        tone: "info"     as Tone },
                  { l: "Unanalyzed",     v: stats.by_verdict?.["UNANALYZED"] ?? 0,     tone: "low"      as Tone },
                ].map((r) => (
                  <div key={r.l} className="between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span className="row" style={{ gap: 8 }}>
                      <span style={{ width: 10, height: 10, background: `var(--sev-${r.tone})`, borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 12 }}>{r.l}</span>
                    </span>
                    <span className="num">{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Row 2: severity distribution + recommended actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-md)" }}>
          <Card title="Severity Distribution" eyebrow="ACROSS PROJECTS">
            {severityBars.some((b) => b.value > 0)
              ? <Bars data={severityBars.filter((b) => b.value > 0)} height={180} />
              : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180 }}><p style={{ fontSize: 13, color: "var(--text-3)" }}>No severity data</p></div>
            }
          </Card>
          <Card title="Recommended Actions" eyebrow="AI · LAST 30D">
            <div className="row" style={{ gap: 24, padding: "12px 0" }}>
              <Donut size={170} thickness={18} label={String(actionSegments.reduce((s, a) => s + a.value, 0))} sub="ACTIONS" segments={actionSegments} />
              <div style={{ flex: 1, display: "grid", gap: 10 }}>
                {[
                  { l: "Escalate", v: stats.by_action?.["ESCALATE"] ?? 0, tone: "critical" as Tone },
                  { l: "Monitor",  v: stats.by_action?.["MONITOR"]  ?? 0, tone: "medium"   as Tone },
                  { l: "Dismiss",  v: stats.by_action?.["DISMISS"]  ?? 0, tone: "low"      as Tone },
                ].map((r) => (
                  <div key={r.l} className="between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span className="row" style={{ gap: 8 }}>
                      <span style={{ width: 10, height: 10, background: `var(--sev-${r.tone})`, borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 12 }}>{r.l}</span>
                    </span>
                    <span className="num">{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </div>

        {/* Top triggered rules */}
        {stats.top_rules && stats.top_rules.length > 0 && (
          <Card title="Top Triggered Rules" pad={false}>
            <table className="tbl">
              <thead><tr><th>Rule ID</th><th>Description</th><th style={{ textAlign: "right" }}>Count</th></tr></thead>
              <tbody>
                {stats.top_rules.map((r) => (
                  <tr key={r._id}>
                    <td><span className="mono" style={{ fontSize: 11, color: "var(--accent)" }}>{r._id}</span></td>
                    <td><span style={{ fontSize: 12, color: "var(--text-2)" }}>{r.desc}</span></td>
                    <td style={{ textAlign: "right" }}><span className="num" style={{ fontSize: 12 }}>{r.count.toLocaleString()}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {/* Top agents */}
        {agentBars.length > 0 && (
          <Card title="Top Agents by Alert Volume" eyebrow="ALERT COUNTS">
            <Bars data={agentBars} height={160} />
          </Card>
        )}
      </>)}

      {/* ── Pentest Analytics Section ──────────────────────────── */}
      <div className="between" style={{ paddingTop: 8 }}>
        <div className="row" style={{ gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "oklch(from var(--sev-medium) l c h / 0.08)", border: "1px solid oklch(from var(--sev-medium) l c h / 0.18)", display: "grid", placeItems: "center" }}>
            <Icon name="scan" size={16} style={{ color: "var(--sev-medium)" }} />
          </div>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700, color: "var(--text)", letterSpacing: "-0.01em" }}>Pentest Metrics</h2>
            <p style={{ fontSize: 12, color: "var(--text-3)", marginTop: 2 }}>
              {pentest ? `${pentest.total_scans} scan${pentest.total_scans !== 1 ? "s" : ""} in period` : "Scan trends and findings"}
            </p>
          </div>
        </div>
        {/* Range selector (already in header, shown again here for pentest context) */}
        <div className="row" style={{ gap: 4, padding: "2px 2px", borderRadius: 8, background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          {(["7d", "30d", "90d"] as AnalyticsRange[]).map((r) => (
            <button key={r} onClick={() => { setRange(r); loadPentest(r); }}
              className="btn btn-sm"
              style={{ background: range === r ? "var(--surface)" : "transparent", border: range === r ? "1px solid var(--border)" : "1px solid transparent", color: range === r ? "var(--text)" : "var(--text-3)" }}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {pentestLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--gap-md)" }}>
          {[1,2,3].map((i) => <div key={i} className="kpi animate-pulse" style={{ minHeight: 80 }} />)}
        </div>
      ) : pentestError ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: 40, textAlign: "center", borderRadius: "var(--r-lg)", background: "oklch(from var(--sev-critical) l c h / 0.04)", border: "1px solid oklch(from var(--sev-critical) l c h / 0.2)" }}>
          <Icon name="alert" size={20} style={{ color: "var(--sev-critical)" }} />
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>Could not load pentest analytics</p>
          <button className="btn btn-sm" onClick={() => loadPentest()}>Retry</button>
        </div>
      ) : pentest && (<>
        {/* Pentest KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "var(--gap-md)" }}>
          <KPI label="TOTAL SCANS"        value={pentest.total_scans} icon="scan" accent="medium" />
          <KPI label="AVG SCAN DURATION"  value={pentest.avg_scan_duration_seconds > 60 ? `${Math.round(pentest.avg_scan_duration_seconds / 60)}m` : `${pentest.avg_scan_duration_seconds}s`} icon="clock" sub="per scan" />
          <KPI label="WAZUH ALERTS"       value={pentest.total_alerts} icon="bell" accent={pentest.total_alerts > 0 ? "critical" : "default"} />
        </div>

        {/* Pentest charts */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-md)" }}>
          <Card title="Scans Over Time" eyebrow={`LAST ${range.toUpperCase()}`}>
            {scanTimeBars.length > 0
              ? <Bars data={scanTimeBars} height={180} />
              : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180 }}><p style={{ fontSize: 13, color: "var(--text-3)" }}>No scan data in this period</p></div>
            }
          </Card>
          <Card title="Findings by Severity" eyebrow="DISTRIBUTION">
            {pentestSevBars.some((b) => b.value > 0) ? (
              <div className="row" style={{ gap: 24, padding: "12px 0" }}>
                <Donut size={160} thickness={16}
                  label={String(pentestSevBars.reduce((s, b) => s + b.value, 0))}
                  sub="FINDINGS"
                  segments={pentestSevBars.filter((b) => b.value > 0).map((b) => ({ value: b.value, color: b.color }))} />
                <div style={{ flex: 1, display: "grid", gap: 8 }}>
                  {pentestSevBars.filter((b) => b.value > 0).map((b) => (
                    <div key={b.label} className="between" style={{ padding: "6px 0", borderBottom: "1px solid var(--border)" }}>
                      <span className="row" style={{ gap: 8 }}>
                        <span style={{ width: 8, height: 8, background: b.color, borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: 12 }}>{b.label}</span>
                      </span>
                      <span className="num">{b.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180 }}><p style={{ fontSize: 13, color: "var(--text-3)" }}>No findings in this period</p></div>
            )}
          </Card>
        </div>

        {/* Scanner success + top targets */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-md)" }}>
          {pentest.scanner_success_rate.length > 0 && (
            <Card title="Scanner Success Rate" eyebrow="PER TOOL">
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {pentest.scanner_success_rate.map(({ scanner, rate, completed, failed }) => (
                  <div key={scanner}>
                    <div className="between" style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "var(--text-2)" }}>{scanner}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: rate >= 0.8 ? "var(--sev-low)" : rate >= 0.5 ? "var(--sev-medium)" : "var(--sev-critical)" }}>
                        {Math.round(rate * 100)}%
                      </span>
                    </div>
                    <div style={{ height: 4, borderRadius: 2, overflow: "hidden", background: "var(--surface-2)" }}>
                      <div style={{ width: `${rate * 100}%`, height: "100%", background: rate >= 0.8 ? "var(--sev-low)" : rate >= 0.5 ? "var(--sev-medium)" : "var(--sev-critical)", transition: "width 0.5s" }} />
                    </div>
                    <p style={{ fontSize: 10, marginTop: 3, color: "var(--text-3)" }}>{completed} completed · {failed} failed</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {pentest.top_vulnerable_targets.length > 0 && (
            <Card title="Top Vulnerable Targets" pad={false}>
              {pentest.top_vulnerable_targets.slice(0, 5).map(({ target, findings }, i) => (
                <div key={target} className="between" style={{ padding: "12px 18px", borderBottom: i < 4 ? "1px solid var(--border)" : undefined }}>
                  <span className="mono" style={{ fontSize: 12, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{target}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "oklch(from var(--sev-critical) l c h / 0.1)", color: "var(--sev-critical)", border: "1px solid oklch(from var(--sev-critical) l c h / 0.2)", flexShrink: 0 }}>
                    {findings} finding{findings !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      </>)}
    </div>
  );
}
