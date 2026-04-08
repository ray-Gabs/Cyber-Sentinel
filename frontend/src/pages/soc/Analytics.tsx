/**
 * Analytics — SOC alert statistics + pentest scan metrics and trend charts.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getAlertStats } from "@/services/alertService";
import { getPentestAnalytics } from "@/services/analyticsService";
import type { PentestAnalytics, AnalyticsRange } from "@/services/analyticsService";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import type { AlertStats } from "@/types";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend,
} from "recharts";
import {
  BarChart3, RefreshCw, Info, ShieldAlert, TrendingUp,
  AlertTriangle, Activity, Crosshair, Clock,
} from "lucide-react";

// ── Chart tooltip style ────────────────────────────────────────────────
// recharts tooltip renders as HTML, so CSS vars resolve correctly here.
const tooltipStyle: React.CSSProperties = {
  backgroundColor: "#111118",   // --bg-surface resolved value
  border: "1px solid #1e1e2e", // --border resolved value
  borderRadius: 8,
  color: "#e2e8f0",             // --text-base resolved value
  fontSize: 12,
};

// recharts tick uses SVG <text> elements. CSS vars do NOT resolve on SVG
// attributes in all browsers — use literal color values instead.
const TICK_STYLE = { fontSize: 10, fill: "#475569" } as const;

const VERDICT_COLORS: Record<string, string> = {
  TRUE_POSITIVE:  "#ef4444",
  FALSE_POSITIVE: "#22c55e",
  UNKNOWN:        "#eab308",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#22c55e",
  info:     "#64748b",
};

const ACTION_COLORS: Record<string, string> = {
  ESCALATE: "#ef4444",
  MONITOR:  "#eab308",
  DISMISS:  "#64748b",
};

// ── Reusable tooltip for difficult concepts ───────────────────────────
function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center">
      <Info size={12} style={{ color: "var(--text-subtle)" }} className="cursor-help" />
      <div
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-lg px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-50"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

function ChartHeader({ title, tooltip }: { title: string; tooltip?: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
        {title}
      </h2>
      {tooltip && <InfoTooltip text={tooltip} />}
    </div>
  );
}

const SEVERITY_PIE_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#22c55e",
  info:     "#64748b",
};

export default function Analytics() {
  const [stats, setStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  const [pentest, setPentest]           = useState<PentestAnalytics | null>(null);
  const [pentestLoading, setPentestLoading] = useState(true);
  const [pentestError, setPentestError] = useState(false);
  const [range, setRange]               = useState<AnalyticsRange>("30d");

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(false);
    try {
      const data = await getAlertStats();
      setStats(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadPentest = async (r: AnalyticsRange = range) => {
    setPentestLoading(true);
    setPentestError(false);
    try {
      const data = await getPentestAnalytics(r);
      setPentest(data);
    } catch {
      setPentestError(true);
    } finally {
      setPentestLoading(false);
    }
  };

  useEffect(() => { load(); loadPentest(); }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl"
            style={{ backgroundColor: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.18)" }}
          >
            <BarChart3 size={16} style={{ color: "#a855f7" }} />
          </div>
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
            >
              Analytics
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {stats && stats.total > 0
                ? `${stats.total.toLocaleString()} total alerts ingested`
                : "Security trends and statistics"}
            </p>
          </div>
        </div>

        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="btn-secondary gap-1.5"
          style={{ fontSize: "0.8125rem" }}
        >
          {refreshing ? <LoadingSpinner size="sm" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </motion.div>

      {/* ── Empty / Error state ──────────────────────────────── */}
      {(error || !stats || stats.total === 0) ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.25 }}
          className="card flex flex-col items-center justify-center py-16"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--bg-muted)" }}
          >
            <BarChart3 size={24} style={{ color: "var(--text-subtle)" }} />
          </div>
          <p
            className="text-base font-semibold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-muted)" }}
          >
            {error ? "Could not load analytics" : "No data yet"}
          </p>
          <p className="text-sm mt-1 text-center max-w-xs" style={{ color: "var(--text-subtle)" }}>
            {error
              ? "Check your backend connection and try again."
              : "Analytics will appear once Wazuh alerts are ingested via webhook or polling."}
          </p>
          {error && (
            <button onClick={() => load()} className="btn-secondary mt-4 gap-1.5" style={{ fontSize: "0.8125rem" }}>
              <RefreshCw size={13} /> Retry
            </button>
          )}
        </motion.div>
      ) : (
        <>
          {/* ── KPI stat cards ───────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.25 }}
            className="grid grid-cols-2 gap-3 lg:grid-cols-4"
          >
            {[
              {
                label: "Total Alerts",
                value: stats.total.toLocaleString(),
                color: "#a855f7",
                bg: "rgba(168,85,247,0.08)",
                border: "rgba(168,85,247,0.18)",
                icon: Activity,
              },
              {
                label: "True Positives",
                value: stats.by_verdict.TRUE_POSITIVE ?? 0,
                color: "#ef4444",
                bg: "rgba(239,68,68,0.08)",
                border: "rgba(239,68,68,0.18)",
                icon: ShieldAlert,
                tooltip: "Alerts confirmed as real threats by the AI classification engine.",
              },
              {
                label: "Escalated",
                value: stats.by_action.ESCALATE ?? 0,
                color: "#f97316",
                bg: "rgba(249,115,22,0.08)",
                border: "rgba(249,115,22,0.18)",
                icon: TrendingUp,
                tooltip: "Alerts the AI flagged for immediate analyst review and action.",
              },
              {
                label: "False Positives",
                value: stats.by_verdict.FALSE_POSITIVE ?? 0,
                color: "#22c55e",
                bg: "rgba(34,197,94,0.08)",
                border: "rgba(34,197,94,0.18)",
                icon: AlertTriangle,
                tooltip: "Alerts classified as non-threatening — helps tune detection rules over time.",
              },
            ].map(({ label, value, color, bg, border, icon: Icon, tooltip }) => (
              <div
                key={label}
                className="card flex items-center gap-3"
                style={{ padding: "0.875rem 1rem" }}
              >
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ backgroundColor: bg, border: `1px solid ${border}` }}
                >
                  <Icon size={16} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold leading-none" style={{ color: "var(--text-base)" }}>
                    {value}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
                    {tooltip && <InfoTooltip text={tooltip} />}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>

          {/* ── Charts row 1 ─────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.25 }}
            className="grid grid-cols-1 gap-4 lg:grid-cols-2"
          >
            {/* Alert Timeline */}
            <div className="card">
              <ChartHeader
                title="Alerts Over Time"
                tooltip="Daily alert volume. Sudden spikes may indicate active attack campaigns or new detection rules firing."
              />
              <div className="h-64">
                {stats.daily_counts && stats.daily_counts.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={stats.daily_counts}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis
                        dataKey="date"
                        tick={TICK_STYLE}
                        axisLine={{ stroke: "#1e1e2e" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={TICK_STYLE}
                        axisLine={{ stroke: "#1e1e2e" }}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Line
                        type="monotone"
                        dataKey="count"
                        stroke="#a855f7"
                        strokeWidth={2}
                        dot={{ fill: "#a855f7", r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 5, strokeWidth: 0 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: "var(--text-subtle)" }}>No timeline data</p>
                  </div>
                )}
              </div>
            </div>

            {/* AI Verdict Breakdown */}
            <div className="card">
              <ChartHeader
                title="AI Verdict Breakdown"
                tooltip="How the AI classified each alert — True Positive (real threat), False Positive (benign), Unknown (uncertain, needs analyst review)."
              />
              <div className="h-64">
                {Object.keys(stats.by_verdict).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(stats.by_verdict).map(([name, value]) => ({
                          name: name.replace(/_/g, " "),
                          value,
                        }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={88}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {Object.keys(stats.by_verdict).map((name) => (
                          <Cell key={name} fill={VERDICT_COLORS[name] ?? "#64748b"} stroke="transparent" />
                        ))}
                      </Pie>
                      <Legend
                        formatter={(value) => (
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{value}</span>
                        )}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: "var(--text-subtle)" }}>No verdict data</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── Charts row 2 ─────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.25 }}
            className="grid grid-cols-1 gap-4 lg:grid-cols-2"
          >
            {/* Severity Distribution */}
            <div className="card">
              <ChartHeader
                title="Severity Distribution"
                tooltip="Alert counts by Wazuh rule level — level 1-4 (low), 5-7 (medium), 8-11 (high), 12-15 (critical)."
              />
              <div className="h-64">
                {Object.keys(stats.by_severity).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={Object.entries(stats.by_severity).map(([name, value]) => ({ name, value }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis
                        dataKey="name"
                        tick={TICK_STYLE}
                        axisLine={{ stroke: "#1e1e2e" }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={TICK_STYLE}
                        axisLine={{ stroke: "#1e1e2e" }}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {Object.keys(stats.by_severity).map((name) => (
                          <Cell key={name} fill={SEVERITY_COLORS[name] ?? "#64748b"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: "var(--text-subtle)" }}>No severity data</p>
                  </div>
                )}
              </div>
            </div>

            {/* Action Distribution */}
            <div className="card">
              <ChartHeader
                title="Recommended Actions"
                tooltip="What the AI recommends per alert — Escalate (needs immediate attention), Monitor (watch for recurrence), Dismiss (safe to close)."
              />
              <div className="h-64">
                {Object.keys(stats.by_action).length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(stats.by_action).map(([name, value]) => ({ name, value }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={88}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {Object.keys(stats.by_action).map((name) => (
                          <Cell key={name} fill={ACTION_COLORS[name] ?? "#64748b"} stroke="transparent" />
                        ))}
                      </Pie>
                      <Legend
                        formatter={(value) => (
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{value}</span>
                        )}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: "var(--text-subtle)" }}>No action data</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── Top Triggered Rules table ─────────────────────── */}
          {stats.top_rules && stats.top_rules.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.25 }}
              className="card"
              style={{ padding: 0, overflow: "hidden" }}
            >
              <div
                className="flex items-center gap-2 px-5 py-3.5 border-b"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-muted)" }}
              >
                <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                  Top Triggered Rules
                </h2>
                <InfoTooltip text="Most frequently triggered Wazuh rules. Consistently high counts may warrant tuning the rule threshold or investigating the source." />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr
                      className="text-left"
                      style={{ borderBottom: "1px solid var(--border)", backgroundColor: "var(--bg-muted)" }}
                    >
                      <th className="px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                        Rule ID
                      </th>
                      <th className="px-5 py-2.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                        Description
                      </th>
                      <th className="px-5 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                        Count
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_rules.map((r, i) => (
                      <tr
                        key={r._id}
                        style={{
                          borderBottom: i < (stats.top_rules?.length ?? 0) - 1
                            ? "1px solid var(--border)"
                            : undefined,
                        }}
                      >
                        <td className="px-5 py-3 font-mono text-xs" style={{ color: "var(--accent)" }}>
                          {r._id}
                        </td>
                        <td className="px-5 py-3 text-sm" style={{ color: "var(--text-muted)" }}>
                          {r.desc}
                        </td>
                        <td className="px-5 py-3 text-right text-sm font-semibold" style={{ color: "var(--text-base)" }}>
                          {r.count}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* ── Top Agents by Alert Volume ─────────────────────── */}
          {stats.top_agents && stats.top_agents.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.25 }}
              className="card"
            >
              <ChartHeader
                title="Top Agents by Alert Volume"
                tooltip="Agents generating the most alerts. High-volume agents may be under active attack or have overly sensitive detection rules."
              />
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.top_agents} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis
                      type="number"
                      tick={TICK_STYLE}
                      axisLine={{ stroke: "#1e1e2e" }}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="_id"
                      tick={TICK_STYLE}
                      axisLine={{ stroke: "#1e1e2e" }}
                      tickLine={false}
                      width={130}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill="#a855f7" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
        </>
      )}

      {/* ══ Pentest Analytics Section ══════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.25 }}
        className="flex items-center justify-between pt-2"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl"
            style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}
          >
            <Crosshair size={16} style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <h2 className="text-lg font-bold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
              Pentest Metrics
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {pentest ? `${pentest.total_scans} scan${pentest.total_scans !== 1 ? "s" : ""} in period` : "Scan trends and findings"}
            </p>
          </div>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-1 p-0.5 rounded-lg" style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}>
          {(["7d", "30d", "90d"] as AnalyticsRange[]).map((r) => (
            <button
              key={r}
              onClick={() => { setRange(r); loadPentest(r); }}
              className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
              style={{
                backgroundColor: range === r ? "var(--bg-surface)" : "transparent",
                color: range === r ? "var(--text-base)" : "var(--text-muted)",
                border: range === r ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Pentest KPI cards */}
      {pentestLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse" style={{ height: 80, backgroundColor: "var(--bg-muted)" }} />
          ))}
        </div>
      ) : pentestError ? (
        <div
          className="card flex flex-col items-center py-10"
          style={{ border: "1px solid rgba(239,68,68,0.2)", backgroundColor: "rgba(239,68,68,0.04)" }}
        >
          <AlertTriangle size={20} className="mb-2" style={{ color: "#ef4444" }} />
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Could not load pentest analytics</p>
          <button onClick={() => loadPentest()} className="btn-secondary mt-3 gap-1.5" style={{ fontSize: "0.8125rem" }}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      ) : pentest && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-4">

          {/* KPI row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              {
                label: "Total Scans",
                value: pentest.total_scans,
                color: "#f59e0b",
                bg: "rgba(245,158,11,0.08)",
                border: "rgba(245,158,11,0.18)",
                icon: Crosshair,
              },
              {
                label: "Avg Scan Duration",
                value: pentest.avg_scan_duration_seconds > 60
                  ? `${Math.round(pentest.avg_scan_duration_seconds / 60)}m`
                  : `${pentest.avg_scan_duration_seconds}s`,
                color: "#3b82f6",
                bg: "rgba(59,130,246,0.08)",
                border: "rgba(59,130,246,0.18)",
                icon: Clock,
                tooltip: "Average time from scan start to completion.",
              },
              {
                label: "Wazuh Alerts",
                value: pentest.total_alerts,
                color: "#ef4444",
                bg: "rgba(239,68,68,0.08)",
                border: "rgba(239,68,68,0.18)",
                icon: ShieldAlert,
              },
            ].map(({ label, value, color, bg, border, icon: Icon, tooltip }) => (
              <div key={label} className="card flex items-center gap-3" style={{ padding: "0.875rem 1rem" }}>
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ backgroundColor: bg, border: `1px solid ${border}` }}
                >
                  <Icon size={16} style={{ color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-2xl font-bold leading-none" style={{ color: "var(--text-base)" }}>{value}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
                    {tooltip && <InfoTooltip text={tooltip} />}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Scans over time */}
            <div className="card">
              <ChartHeader title="Scans Over Time" tooltip="Number of scans run per day in the selected period." />
              <div className="h-56">
                {pentest.scans_over_time.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pentest.scans_over_time}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                      <XAxis dataKey="date" tick={TICK_STYLE} axisLine={{ stroke: "#1e1e2e" }} tickLine={false} />
                      <YAxis tick={TICK_STYLE} axisLine={{ stroke: "#1e1e2e" }} tickLine={false} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: "var(--text-subtle)" }}>No scan data in this period</p>
                  </div>
                )}
              </div>
            </div>

            {/* Findings by severity */}
            <div className="card">
              <ChartHeader title="Findings by Severity" tooltip="Distribution of vulnerabilities found across all scans in the period." />
              <div className="h-56">
                {Object.values(pentest.findings_by_severity).some((v) => v > 0) ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(pentest.findings_by_severity)
                          .filter(([, v]) => v > 0)
                          .map(([name, value]) => ({ name, value }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={82}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {Object.keys(pentest.findings_by_severity)
                          .filter((k) => (pentest.findings_by_severity as unknown as Record<string, number>)[k] > 0)
                          .map((k) => (
                            <Cell key={k} fill={SEVERITY_PIE_COLORS[k] ?? "#64748b"} stroke="transparent" />
                          ))}
                      </Pie>
                      <Legend formatter={(v) => <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{v}</span>} />
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-sm" style={{ color: "var(--text-subtle)" }}>No findings in this period</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Scanner success rate + top targets */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Scanner success rate */}
            {pentest.scanner_success_rate.length > 0 && (
              <div className="card">
                <ChartHeader title="Scanner Success Rate" tooltip="Percentage of scans where each tool completed without error." />
                <div className="space-y-3">
                  {pentest.scanner_success_rate.map(({ scanner, rate, completed, failed }) => (
                    <div key={scanner}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>{scanner}</span>
                        <span className="text-xs font-semibold" style={{ color: rate >= 0.8 ? "#22c55e" : rate >= 0.5 ? "#eab308" : "#ef4444" }}>
                          {Math.round(rate * 100)}%
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-muted)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${rate * 100}%`,
                            backgroundColor: rate >= 0.8 ? "#22c55e" : rate >= 0.5 ? "#eab308" : "#ef4444",
                          }}
                        />
                      </div>
                      <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
                        {completed} completed · {failed} failed
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top vulnerable targets */}
            {pentest.top_vulnerable_targets.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div
                  className="px-5 py-3.5 border-b"
                  style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-muted)" }}
                >
                  <h2 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                    Top Vulnerable Targets
                  </h2>
                </div>
                <div>
                  {pentest.top_vulnerable_targets.slice(0, 5).map(({ target, findings }, i) => (
                    <div
                      key={target}
                      className="flex items-center justify-between px-5 py-3"
                      style={{ borderBottom: i < 4 ? "1px solid var(--border)" : undefined }}
                    >
                      <span className="text-sm font-mono truncate max-w-[200px]" style={{ color: "var(--text-muted)" }}>
                        {target}
                      </span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full ml-3 shrink-0"
                        style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                      >
                        {findings} finding{findings !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
