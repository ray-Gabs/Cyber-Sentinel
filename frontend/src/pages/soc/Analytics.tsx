import { useEffect, useState } from "react";
import { getAlertStats } from "@/services/alertService";
import type { AlertStats } from "@/types";
import { Icon, KPI, PageHead, Card, Bars, Donut } from "@/components/ui";
import { exportAnalyticsPDF } from "@/lib/exportAnalytics";

type Range = "7d" | "30d" | "90d";
type Tone  = "critical" | "high" | "medium" | "low" | "info";

const RANGE_LABELS: Record<Range, string> = {
  "7d":  "Week",
  "30d": "Month",
  "90d": "Quarter",
};

const DAY_NAMES   = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

type DayEntry = { date: string; count: number };
type BarEntry = { label: string; value: number; color: string };

/** Group daily data into a stable number of bars (7 / 4 / 3) based on range. */
function buildAlertBars(daily: DayEntry[], range: Range): BarEntry[] {
  if (!daily.length) return [];

  if (range === "7d") {
    // 7 bars — one per day, labelled by day-of-week abbreviation
    return daily.slice(-7).map((d) => ({
      label: DAY_NAMES[new Date(d.date + "T12:00:00Z").getUTCDay()],
      value: d.count,
      color: "var(--accent)",
    }));
  }

  if (range === "30d") {
    // 4 bars — one per week (last 28 days), labelled by week-start date
    const items = daily.slice(-28);
    const bars: BarEntry[] = [];
    for (let w = 0; w < 4; w++) {
      const week = items.slice(w * 7, w * 7 + 7);
      if (!week.length) continue;
      bars.push({
        label: week[0].date.slice(5).replace("-", "/"), // "MM/DD"
        value: week.reduce((s, d) => s + d.count, 0),
        color: "var(--accent)",
      });
    }
    return bars;
  }

  // "90d" — group by calendar month, ~3 bars
  const monthMap = new Map<string, number>();
  for (const d of daily) {
    const m = d.date.slice(0, 7); // "YYYY-MM"
    monthMap.set(m, (monthMap.get(m) ?? 0) + d.count);
  }
  return [...monthMap.entries()].map(([ym, count]) => ({
    label: MONTH_NAMES[parseInt(ym.slice(5, 7)) - 1],
    value: count,
    color: "var(--accent)",
  }));
}

function normKeys(rec: Record<string, number> | undefined): Record<string, number> {
  if (!rec) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    const upper = k.toUpperCase();
    out[upper] = (out[upper] ?? 0) + v;
  }
  return out;
}

export default function Analytics() {
  const [stats,      setStats]      = useState<AlertStats | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState(false);
  const [range,      setRange]      = useState<Range>("30d");

  const load = async (isRefresh = false, r: Range = range) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try { setStats(await getAlertStats(r)); }
    catch { setError(true); }
    finally { setLoading(false); setRefreshing(false); }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(false, range); }, []);

  const byVerdict = normKeys(stats?.by_verdict);
  const byAction  = normKeys(stats?.by_action);

  const socTotal      = stats?.total ?? 0;
  const socTP         = byVerdict["TRUE_POSITIVE"]  ?? 0;
  const socFP         = byVerdict["FALSE_POSITIVE"] ?? 0;
  const socEsc        = byAction["ESCALATE"]        ?? 0;
  const socUnanalyzed = byVerdict["UNANALYSED"] ?? byVerdict["UNANALYZED"] ?? 0;

  // Only include analyzed verdicts — Unanalyzed must NOT use a severity color
  // (it's absence of analysis, not a low-severity verdict). Keeping it out of
  // the segments means the donut ring shows the quality of analysis, not volume.
  const verdictSegments = stats ? [
    { value: socTP,                     color: "var(--sev-critical)" },
    { value: socFP,                     color: "var(--sev-medium)"   },
    { value: byVerdict["UNKNOWN"] ?? 0, color: "var(--sev-info)"     },
  ] : [];

  const actionSegments = stats ? [
    { value: byAction["ESCALATE"] ?? 0, color: "var(--sev-critical)" },
    { value: byAction["MONITOR"]  ?? 0, color: "var(--sev-medium)"   },
    { value: byAction["DISMISS"]  ?? 0, color: "var(--sev-low)"      },
  ] : [];

  // Always show all 4 severity bars (including zero-count) so the chart is stable
  const severityBars: BarEntry[] = stats
    ? (["critical", "high", "medium", "low"] as const).map((s) => ({
        label: s.charAt(0).toUpperCase() + s.slice(1),
        value: stats.by_severity?.[s] ?? 0,
        color: `var(--sev-${s})`,
      }))
    : [];

  // Build alert timeline bars with consistent count per range
  const alertTimeBars = buildAlertBars(stats?.daily_counts ?? [], range);

  const rangeLabel = RANGE_LABELS[range];
  const eyebrow    = rangeLabel.toUpperCase();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-md)" }}>

      <PageHead
        eyebrow="ANALYTICS"
        title="Platform Analytics"
        sub={`${socTotal.toLocaleString()} total alerts ingested · last ${rangeLabel.toLowerCase()}.`}
        actions={<>
          {(["7d", "30d", "90d"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); load(false, r); }}
              className={`btn btn-sm${range === r ? " btn-primary" : ""}`}
            >
              {RANGE_LABELS[r]}
            </button>
          ))}
          <button
            className="btn btn-sm"
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            disabled={!stats}
            onClick={() => {
              if (stats) exportAnalyticsPDF({ range, alertStats: stats, pentest: null }).catch(() => {});
            }}
          >
            <Icon name="download" size={12} /> Export
          </button>
          <button
            className="btn btn-sm"
            onClick={() => load(true)}
            disabled={refreshing}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
          >
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
          <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)" }}>
            {error ? "Could not load analytics" : "No data yet"}
          </p>
          <p style={{ fontSize: 12, color: "var(--text-4)", maxWidth: 320 }}>
            {error ? "Check your backend connection and try again." : "Analytics will appear once Wazuh alerts are ingested."}
          </p>
          {error && <button className="btn btn-sm" onClick={() => load()}>Retry</button>}
        </div>
      ) : !loading && stats && (<>

        {/* Row 1: alerts over time + verdict breakdown */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-md)" }}>
          <Card title="Alerts Over Time" eyebrow={`VOLUME · ${eyebrow}`}>
            {alertTimeBars.length > 0
              ? <Bars data={alertTimeBars} height={180} />
              : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180 }}>
                  <p style={{ fontSize: 13, color: "var(--text-3)" }}>No alert activity in this period</p>
                </div>
            }
          </Card>
          <Card title="AI Verdict Breakdown" eyebrow="TRIAGE">
            <div className="row" style={{ gap: 24, padding: "12px 0" }}>
              <Donut
                size={170} thickness={18}
                label={String(socTP + socFP + (byVerdict["UNKNOWN"] ?? 0))}
                sub="ANALYZED"
                segments={verdictSegments}
              />
              <div style={{ flex: 1, display: "grid", gap: 10 }}>
                {[
                  { l: "True positive",  v: socTP,                     color: "var(--sev-critical)" },
                  { l: "False positive", v: socFP,                     color: "var(--sev-medium)"   },
                  { l: "Unknown",        v: byVerdict["UNKNOWN"] ?? 0, color: "var(--sev-info)"     },
                ].map((row) => (
                  <div key={row.l} className="between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span className="row" style={{ gap: 8 }}>
                      <span style={{ width: 10, height: 10, background: row.color, borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 12 }}>{row.l}</span>
                    </span>
                    <span className="num">{row.v.toLocaleString()}</span>
                  </div>
                ))}
                {/* Triage coverage — shown as a neutral progress bar, not a severity color */}
                <div style={{ padding: "6px 0" }}>
                  <div className="between" style={{ marginBottom: 4 }}>
                    <span className="row" style={{ gap: 8 }}>
                      <span style={{ width: 10, height: 10, background: "var(--border)", borderRadius: 2, flexShrink: 0, border: "1px solid var(--text-4)" }} />
                      <span style={{ fontSize: 12, color: "var(--text-3)" }}>Unanalyzed</span>
                    </span>
                    <span className="num" style={{ color: "var(--text-3)" }}>{socUnanalyzed.toLocaleString()}</span>
                  </div>
                  <div style={{ height: 3, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{
                      height: "100%", borderRadius: 4,
                      width: socTotal > 0 ? `${((socTotal - socUnanalyzed) / socTotal) * 100}%` : "0%",
                      background: "var(--accent)",
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text-4)" }}>
                    {socTotal > 0 ? (((socTotal - socUnanalyzed) / socTotal) * 100).toFixed(1) : "0.0"}% triage coverage
                  </span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Row 2: severity distribution + recommended actions */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--gap-md)" }}>
          <Card title="Severity Distribution" eyebrow={`ACROSS PROJECTS · ${eyebrow}`}>
            {severityBars.some((b) => b.value > 0)
              ? <Bars data={severityBars} height={180} showValues />
              : <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 180 }}>
                  <p style={{ fontSize: 13, color: "var(--text-3)" }}>No severity data in this period</p>
                </div>
            }
          </Card>
          <Card title="Recommended Actions" eyebrow={`AI · LAST ${eyebrow}`}>
            <div className="row" style={{ gap: 24, padding: "12px 0" }}>
              <Donut
                size={170} thickness={18}
                label={String(actionSegments.reduce((s, a) => s + a.value, 0))}
                sub="ACTIONS"
                segments={actionSegments}
              />
              <div style={{ flex: 1, display: "grid", gap: 10 }}>
                {[
                  { l: "Escalate", v: byAction["ESCALATE"] ?? 0, tone: "critical" as Tone },
                  { l: "Monitor",  v: byAction["MONITOR"]  ?? 0, tone: "medium"   as Tone },
                  { l: "Dismiss",  v: byAction["DISMISS"]  ?? 0, tone: "low"      as Tone },
                ].map((row) => (
                  <div key={row.l} className="between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <span className="row" style={{ gap: 8 }}>
                      <span style={{ width: 10, height: 10, background: `var(--sev-${row.tone})`, borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: 12 }}>{row.l}</span>
                    </span>
                    <span className="num">{(row.v).toLocaleString()}</span>
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
              <thead>
                <tr><th>Rule ID</th><th>Description</th><th style={{ textAlign: "right" }}>Count</th></tr>
              </thead>
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

      </>)}
    </div>
  );
}
