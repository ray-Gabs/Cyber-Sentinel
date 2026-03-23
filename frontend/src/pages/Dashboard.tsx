/**
 * Dashboard — security posture overview with animated stat cards,
 * live scan monitoring, SOC telemetry, and quick actions.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { getScans } from "@/services/scanService";
import { getAlertStats } from "@/services/alertService";
import { TOOL_INFO, SCAN_TYPE_LABELS } from "@/lib/constants";
import StatusBadge from "@/components/common/StatusBadge";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import ToolIcon from "@/components/common/ToolIcon";
import {
  Rocket, ShieldCheck, BarChart3, Link2,
  Activity, AlertTriangle, CheckCircle2, Crosshair,
  ChevronRight, TrendingUp, Radio,
} from "lucide-react";
import type { ScanSummary, AlertStats } from "@/types";

// ── Animated count-up number ───────────────────────────────────────────────
function CountUp({ value }: { value: number }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 80, damping: 20 });
  const [display, setDisplay] = useState(0);

  useEffect(() => { motionVal.set(value); }, [value, motionVal]);
  useEffect(() => spring.on("change", (v) => setDisplay(Math.round(v))), [spring]);

  return <span>{display}</span>;
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.35, ease: "easeOut" as const },
  }),
};

const statCards = (
  activeScans: number,
  completedScans: number,
  totalFindings: number,
  criticalFindings: number,
) => [
  {
    label: "Active Scans",
    value: activeScans,
    icon: Radio,
    color: activeScans > 0 ? "var(--accent)" : "var(--text-muted)",
    iconBg: activeScans > 0 ? "rgba(14,165,233,0.12)" : "var(--bg-muted)",
    accent: activeScans > 0 ? "var(--accent)" : "var(--border-muted)",
    pulse: activeScans > 0,
  },
  {
    label: "Completed Scans",
    value: completedScans,
    icon: CheckCircle2,
    color: "var(--text-base)",
    iconBg: "rgba(34,197,94,0.1)",
    accent: "#22c55e",
    pulse: false,
  },
  {
    label: "Total Findings",
    value: totalFindings,
    icon: Activity,
    color: "var(--text-base)",
    iconBg: "rgba(168,85,247,0.1)",
    accent: "#a855f7",
    pulse: false,
  },
  {
    label: "High-Risk Targets",
    value: criticalFindings,
    icon: AlertTriangle,
    color: criticalFindings > 0 ? "var(--sev-critical)" : "var(--text-muted)",
    iconBg: criticalFindings > 0 ? "rgba(239,68,68,0.12)" : "var(--bg-muted)",
    accent: criticalFindings > 0 ? "var(--sev-critical)" : "var(--border-muted)",
    pulse: false,
  },
];

const quickActions = [
  {
    to: "/scans/new",
    icon: Rocket,
    label: "New Scan",
    desc: "Launch a penetration test",
    accent: "var(--accent)",
    accentBg: "var(--accent-dim)",
  },
  {
    to: "/alerts",
    icon: ShieldCheck,
    label: "Alert Feed",
    desc: "Wazuh SIEM alerts & AI verdicts",
    accent: "#f59e0b",
    accentBg: "rgba(245,158,11,0.1)",
  },
  {
    to: "/analytics",
    icon: BarChart3,
    label: "Analytics",
    desc: "Trends and statistics",
    accent: "#a855f7",
    accentBg: "rgba(168,85,247,0.1)",
  },
  {
    to: "/correlations",
    icon: Link2,
    label: "Correlation",
    desc: "Link findings to SOC alerts",
    accent: "#22c55e",
    accentBg: "rgba(34,197,94,0.1)",
  },
];

export default function Dashboard() {
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const [scanData, statsData] = await Promise.allSettled([
        getScans(1, 50),
        getAlertStats(),
      ]);
      if (scanData.status === "fulfilled") setScans(scanData.value);
      if (statsData.status === "fulfilled") setAlertStats(statsData.value);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeScans  = scans.filter((s) => s.status === "running" || s.status === "pending");
  const completedScans = scans.filter((s) => s.status === "completed");
  const totalFindings  = scans.reduce((sum, s) => sum + (s.finding_count || 0), 0);
  const criticalFindings = scans.reduce(
    (sum, s) => sum + (s.risk_score && s.risk_score >= 7 ? 1 : 0), 0
  );

  // Severity buckets — derived from completed scans using risk_score bands
  // Each bucket accumulates the finding_count of scans that fall in its band
  const sevCritical = completedScans
    .filter((s) => s.risk_score != null && s.risk_score >= 8)
    .reduce((sum, s) => sum + (s.finding_count || 0), 0);
  const sevHigh = completedScans
    .filter((s) => s.risk_score != null && s.risk_score >= 6 && s.risk_score < 8)
    .reduce((sum, s) => sum + (s.finding_count || 0), 0);
  const sevMedium = completedScans
    .filter((s) => s.risk_score != null && s.risk_score >= 4 && s.risk_score < 6)
    .reduce((sum, s) => sum + (s.finding_count || 0), 0);
  const sevLow = completedScans
    .filter((s) => s.risk_score != null && s.risk_score < 4 && (s.finding_count || 0) > 0)
    .reduce((sum, s) => sum + (s.finding_count || 0), 0);
  const sevInfo = completedScans
    .filter((s) => !s.risk_score && (s.finding_count || 0) === 0)
    .length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading security telemetry...</p>
      </div>
    );
  }

  const cards = statCards(activeScans.length, completedScans.length, totalFindings, criticalFindings);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
            Security Dashboard
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Real-time overview of your security posture
          </p>
        </div>
        <div
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
          style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Platform Online
        </div>
      </motion.div>

      {/* Stat cards */}
      <motion.div
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {cards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              className="card relative overflow-hidden"
              custom={i}
              variants={cardVariants}
              whileHover={{ y: -3, transition: { duration: 0.15 } }}
              style={{ borderTop: `2px solid ${stat.accent}` }}
            >
              {/* Subtle background glow */}
              <div
                className="absolute top-0 right-0 w-20 h-20 rounded-full blur-2xl opacity-30 pointer-events-none"
                style={{ backgroundColor: stat.accent }}
              />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    {stat.label}
                  </p>
                  <p
                    className="text-3xl font-bold mt-2 tabular-nums"
                    style={{ fontFamily: "Syne, sans-serif", color: stat.color }}
                  >
                    <CountUp value={stat.value} />
                  </p>
                </div>
                <div
                  className="relative flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  style={{ backgroundColor: stat.iconBg }}
                >
                  {stat.pulse && (
                    <span className="absolute inset-0 rounded-xl animate-ping opacity-30" style={{ backgroundColor: stat.accent }} />
                  )}
                  <Icon size={18} style={{ color: stat.color }} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* Severity distribution bar — only shown when there are completed scans with findings */}
      {totalFindings > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.35 }}
          className="card"
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ backgroundColor: "rgba(239,68,68,0.1)" }}
            >
              <Activity size={16} style={{ color: "var(--sev-critical)" }} />
            </div>
            <div>
              <h2
                className="text-sm font-semibold"
                style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
              >
                Severity Distribution
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Findings across all completed scans
              </p>
            </div>
          </div>

          {/* Stacked bar */}
          {(() => {
            const sevSegments = [
              { label: "Critical", count: sevCritical, color: "var(--sev-critical)" },
              { label: "High",     count: sevHigh,     color: "var(--sev-high)"     },
              { label: "Medium",   count: sevMedium,   color: "var(--sev-medium)"   },
              { label: "Low",      count: sevLow,      color: "var(--sev-low)"      },
              { label: "Info",     count: sevInfo,     color: "var(--sev-info)"     },
            ];
            const sevTotal = sevSegments.reduce((s, seg) => s + seg.count, 0) || 1;

            return (
              <>
                {/* Bar */}
                <div className="flex w-full h-3 rounded-full overflow-hidden gap-0.5 mb-4">
                  {sevSegments.map((seg) => {
                    const pct = (seg.count / sevTotal) * 100;
                    return pct > 0 ? (
                      <motion.div
                        key={seg.label}
                        title={`${seg.label}: ${seg.count}`}
                        initial={{ scaleX: 0, originX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
                        style={{
                          width: `${pct}%`,
                          backgroundColor: seg.color,
                          transformOrigin: "left",
                        }}
                      />
                    ) : null;
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {sevSegments.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: seg.color }}
                      />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                        {seg.label}
                      </span>
                      <span
                        className="text-xs font-semibold tabular-nums"
                        style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
                      >
                        {seg.count}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </motion.div>
      )}

      {/* SOC Alert strip — only shown when there's data */}
      {alertStats && alertStats.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.35 }}
          className="card"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>
              <TrendingUp size={16} style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>SOC Overview</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Wazuh alert telemetry</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Alerts", value: alertStats.total.toLocaleString(), color: "var(--text-base)" },
              { label: "True Positives", value: alertStats.by_verdict?.TRUE_POSITIVE ?? 0, color: "var(--sev-critical)" },
              { label: "Escalated", value: alertStats.by_action?.ESCALATE ?? 0, color: "var(--sev-high)" },
              { label: "False Positives", value: alertStats.by_verdict?.FALSE_POSITIVE ?? 0, color: "#4ade80" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-xl p-3"
                style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
              >
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{label}</p>
                <p className="text-2xl font-bold mt-1 tabular-nums" style={{ fontFamily: "Syne, sans-serif", color }}>{value}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Active scans — live progress */}
      {activeScans.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.35 }}
          className="card"
          style={{ borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent-dim), 0 4px 24px var(--accent-dim)" }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ backgroundColor: "var(--accent-dim)" }}
            >
              <Crosshair size={16} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Active Scans</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>{activeScans.length} scan{activeScans.length !== 1 ? "s" : ""} in progress</p>
            </div>
          </div>
          <div className="space-y-3">
            {activeScans.map((scan) => (
              <Link key={scan.id} to={`/scans/${scan.id}`} className="block group">
                <div
                  className="rounded-xl p-4 transition-colors"
                  style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-sm font-medium truncate" style={{ color: "var(--text-base)" }}>{scan.target}</span>
                      <StatusBadge value={scan.status} variant="status" />
                      <span className="text-xs hidden sm:block" style={{ color: "var(--text-muted)" }}>
                        {SCAN_TYPE_LABELS[scan.scan_type]}
                      </span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: "var(--accent)" }}>
                      {scan.progress}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: "var(--accent)" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${scan.progress}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  {scan.current_stage && TOOL_INFO[scan.current_stage] && (
                    <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                      <ToolIcon name={TOOL_INFO[scan.current_stage].icon} size={11} />
                      {TOOL_INFO[scan.current_stage].label}
                      <span style={{ color: "var(--text-subtle)" }}>— {TOOL_INFO[scan.current_stage].owasp}</span>
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* Bottom row: Recent scans + Quick actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent scans */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.35 }}
          className="card"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Recent Scans</h2>
            <Link
              to="/scans"
              className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--accent)" }}
            >
              View all <ChevronRight size={12} />
            </Link>
          </div>

          {scans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--bg-muted)" }}>
                <Crosshair size={22} style={{ color: "var(--text-subtle)" }} />
              </div>
              <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>No scans yet</p>
              <Link to="/scans/new" className="btn-primary text-xs">Launch first scan</Link>
            </div>
          ) : (
            <div className="space-y-1.5">
              {scans.slice(0, 8).map((scan) => (
                <Link
                  key={scan.id}
                  to={`/scans/${scan.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors group"
                  style={{ border: "1px solid transparent" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; (e.currentTarget as HTMLElement).style.borderColor = "transparent"; }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <StatusBadge value={scan.status} variant="status" />
                    <span className="text-sm truncate" style={{ color: "var(--text-base)" }}>{scan.target}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>{scan.finding_count} findings</span>
                    {scan.risk_score != null && (
                      <span
                        className="text-xs font-semibold tabular-nums"
                        style={{
                          color: scan.risk_score >= 7 ? "var(--sev-critical)" :
                                 scan.risk_score >= 4 ? "var(--sev-medium)" : "#4ade80",
                        }}
                      >
                        {scan.risk_score.toFixed(1)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.35 }}
          className="card"
        >
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text-base)" }}>Quick Actions</h2>
          <div className="space-y-2.5">
            {quickActions.map(({ to, icon: Icon, label, desc, accent, accentBg }) => (
              <Link
                key={to}
                to={to}
                className="flex items-center gap-3.5 rounded-xl p-3.5 transition-all group"
                style={{ border: "1px solid var(--border)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-muted)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-muted)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = ""; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
              >
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 transition-transform group-hover:scale-105"
                  style={{ backgroundColor: accentBg }}
                >
                  <Icon size={17} style={{ color: accent }} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>{label}</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{desc}</p>
                </div>
                <ChevronRight
                  size={14}
                  className="ml-auto shrink-0 transition-transform group-hover:translate-x-0.5"
                  style={{ color: "var(--text-subtle)" }}
                />
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
