/**
 * Dashboard — security posture overview.
 * Layout: greeting header → stat cards → scan grid + quick actions.
 * Visual direction: GitHub data-density × Instagram visual polish.
 */
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { getScans } from "@/services/scanService";
import { getAlertStats } from "@/services/alertService";
import { TOOL_INFO, SCAN_TYPE_LABELS } from "@/lib/constants";
import StatusBadge from "@/components/common/StatusBadge";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useAuth } from "@/hooks/useAuth";
import {
  Rocket, ShieldCheck, BarChart3, Link2,
  Activity, AlertTriangle, CheckCircle2,
  ChevronRight, TrendingUp, Radio, Crosshair,
  ExternalLink,
} from "lucide-react";
import type { ScanSummary, AlertStats } from "@/types";

// ── Time-based greeting ────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Animated count-up ─────────────────────────────────────────────────────
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 600;
    const steps = 24;
    const step = value / steps;
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= value) { setDisplay(value); clearInterval(timer); }
      else setDisplay(Math.round(current));
    }, duration / steps);
    return () => clearInterval(timer);
  }, [value]);

  return <span>{display}</span>;
}

// ── Risk gradient for scan card thumbnail ─────────────────────────────────
function getScanGradient(scan: ScanSummary): string {
  if (scan.status === "running" || scan.status === "pending")
    return "linear-gradient(135deg, rgba(59,130,246,0.5) 0%, rgba(147,197,253,0.15) 100%)";
  if (scan.status === "failed")
    return "linear-gradient(135deg, rgba(239,68,68,0.4) 0%, rgba(239,68,68,0.1) 100%)";
  if (scan.risk_score == null)
    return "linear-gradient(135deg, rgba(71,85,105,0.35) 0%, rgba(71,85,105,0.1) 100%)";
  if (scan.risk_score >= 7)
    return "linear-gradient(135deg, rgba(239,68,68,0.55) 0%, rgba(249,115,22,0.25) 100%)";
  if (scan.risk_score >= 4)
    return "linear-gradient(135deg, rgba(234,179,8,0.5) 0%, rgba(234,179,8,0.15) 100%)";
  return "linear-gradient(135deg, rgba(34,197,94,0.4) 0%, rgba(34,197,94,0.1) 100%)";
}

function getRiskColor(score: number | null | undefined, status: string): string {
  if (status === "running" || status === "pending") return "var(--sev-info-text)";
  if (status === "failed") return "var(--sev-critical-text)";
  if (score == null) return "var(--text-subtle)";
  if (score >= 7) return "var(--sev-critical-text)";
  if (score >= 4) return "var(--sev-medium-text)";
  return "var(--sev-low-text)";
}

function getDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return url.split("/")[0];
  }
}

// ── Scan grid card ─────────────────────────────────────────────────────────
function ScanGridCard({ scan }: { scan: ScanSummary }) {
  const navigate = useNavigate();
  const riskColor = getRiskColor(scan.risk_score, scan.status);
  const isActive = scan.status === "running" || scan.status === "pending";

  return (
    <motion.div
      className="scan-grid-card"
      onClick={() => navigate(`/scans/${scan.id}`)}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.15 }}
    >
      {/* Thumbnail gradient */}
      <div
        className="relative flex items-center justify-between px-3 py-2.5"
        style={{ background: getScanGradient(scan), minHeight: "52px" }}
      >
        <StatusBadge value={scan.status} variant="status" />

        {isActive ? (
          <div className="flex items-center gap-1.5">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--sev-info-text)" }}
            />
            <span
              className="text-xs font-semibold tabular-nums"
              style={{ color: "var(--sev-info-text)", fontFamily: "JetBrains Mono, monospace" }}
            >
              {scan.progress}%
            </span>
          </div>
        ) : scan.risk_score != null ? (
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: riskColor, fontFamily: "JetBrains Mono, monospace" }}
          >
            {scan.risk_score.toFixed(1)}
          </span>
        ) : null}
      </div>

      {/* Progress bar for running scans */}
      {isActive && (
        <div className="w-full h-0.5" style={{ backgroundColor: "var(--border)" }}>
          <motion.div
            className="h-full"
            style={{ backgroundColor: "#3B82F6" }}
            initial={{ width: 0 }}
            animate={{ width: `${scan.progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}

      {/* Card body */}
      <div className="px-3 py-2.5 flex flex-col gap-1">
        <p
          className="text-xs font-semibold truncate"
          style={{ color: "var(--text-base)", fontFamily: "JetBrains Mono, monospace" }}
          title={scan.target}
        >
          {getDomain(scan.target)}
        </p>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>{scan.finding_count} findings</span>
            <span className="w-0.5 h-0.5 rounded-full" style={{ backgroundColor: "var(--text-subtle)" }} />
            <span>{SCAN_TYPE_LABELS[scan.scan_type] || scan.scan_type}</span>
          </div>
          <ExternalLink size={10} style={{ color: "var(--text-subtle)", flexShrink: 0 }} />
        </div>
      </div>
    </motion.div>
  );
}

// ── Quick action highlight (Instagram story highlight) ─────────────────────
interface QuickAction {
  to: string;
  icon: React.ElementType;
  label: string;
  accent: string;
  ringGradient: string;
}

const quickActions: QuickAction[] = [
  {
    to: "/scans/new",
    icon: Rocket,
    label: "New Scan",
    accent: "#3B82F6",
    ringGradient: "linear-gradient(135deg, #3B82F6, #60A5FA)",
  },
  {
    to: "/alerts",
    icon: ShieldCheck,
    label: "Alerts",
    accent: "#F59E0B",
    ringGradient: "linear-gradient(135deg, #F59E0B, #FCD34D)",
  },
  {
    to: "/analytics",
    icon: BarChart3,
    label: "Analytics",
    accent: "#A855F7",
    ringGradient: "linear-gradient(135deg, #A855F7, #C084FC)",
  },
  {
    to: "/correlations",
    icon: Link2,
    label: "Correlate",
    accent: "#22C55E",
    ringGradient: "linear-gradient(135deg, #22C55E, #4ADE80)",
  },
];

// ── Animations ─────────────────────────────────────────────────────────────
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

// ── Stat cards config ──────────────────────────────────────────────────────
const statCards = (active: number, completed: number, findings: number, highRisk: number) => [
  {
    label: "Active Scans",
    value: active,
    icon: Radio,
    color: active > 0 ? "var(--sev-info-text)" : "var(--text-muted)",
    iconBg: active > 0 ? "rgba(59,130,246,0.15)" : "var(--bg-muted)",
    accent: active > 0 ? "#3B82F6" : "var(--border-muted)",
    pulse: active > 0,
  },
  {
    label: "Completed",
    value: completed,
    icon: CheckCircle2,
    color: "var(--sev-low-text)",
    iconBg: "var(--color-success-dim)",
    accent: "#22C55E",
    pulse: false,
  },
  {
    label: "Total Findings",
    value: findings,
    icon: Activity,
    color: "var(--color-purple-text)",
    iconBg: "var(--color-purple-dim)",
    accent: "#A855F7",
    pulse: false,
  },
  {
    label: "High Risk",
    value: highRisk,
    icon: AlertTriangle,
    color: highRisk > 0 ? "var(--sev-critical-text)" : "var(--text-muted)",
    iconBg: highRisk > 0 ? "rgba(239,68,68,0.12)" : "var(--bg-muted)",
    accent: highRisk > 0 ? "#EF4444" : "var(--border-muted)",
    pulse: false,
  },
];

// ── Component ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const [scans, setScans]           = useState<ScanSummary[]>([]);
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null);
  const [loading, setLoading]       = useState(true);

  const fetchData = async () => {
    try {
      const [scanData, statsData] = await Promise.allSettled([
        getScans(1, 50),
        getAlertStats(),
      ]);
      if (scanData.status  === "fulfilled") setScans(scanData.value);
      if (statsData.status === "fulfilled") setAlertStats(statsData.value);
    } catch { /* silently ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const activeScans      = scans.filter((s) => s.status === "running" || s.status === "pending");
  const completedScans   = scans.filter((s) => s.status === "completed");
  const totalFindings    = scans.reduce((sum, s) => sum + (s.finding_count || 0), 0);
  const highRiskCount    = scans.filter((s) => (s.risk_score ?? 0) >= 7).length;

  // Severity for the bar
  const sevCritical = completedScans.filter((s) => (s.risk_score ?? 0) >= 8).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevHigh     = completedScans.filter((s) => (s.risk_score ?? 0) >= 6 && (s.risk_score ?? 0) < 8).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevMedium   = completedScans.filter((s) => (s.risk_score ?? 0) >= 4 && (s.risk_score ?? 0) < 6).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevLow      = completedScans.filter((s) => (s.risk_score ?? 0) < 4 && (s.finding_count || 0) > 0).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevInfo     = completedScans.filter((s) => !s.risk_score && (s.finding_count || 0) === 0).length;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading security telemetry...</p>
      </div>
    );
  }

  const cards = statCards(activeScans.length, completedScans.length, totalFindings, highRiskCount);

  return (
    <div className="space-y-6">

      {/* ── Greeting header ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-center justify-between gap-4"
      >
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.02em" }}
          >
            {getGreeting()},{" "}
            <span style={{ color: "var(--accent)" }}>{user?.username ?? "operator"}</span>
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {scans.length === 0
              ? "Platform ready — no scans yet"
              : `${activeScans.length > 0 ? `${activeScans.length} scan${activeScans.length !== 1 ? "s" : ""} running · ` : ""}${totalFindings} findings across ${completedScans.length} scans`
            }
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shrink-0"
          style={{ backgroundColor: "var(--color-success-dim)", color: "var(--sev-low-text)", border: "1px solid var(--color-success-border)" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Platform Online
        </div>
      </motion.div>

      {/* ── Stat cards ───────────────────────────────────────── */}
      <motion.div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
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
              {/* Background glow */}
              <div
                className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-20 pointer-events-none"
                style={{ backgroundColor: stat.accent }}
              />

              <div className="flex items-start justify-between relative">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
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
                  className="relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
                  style={{ backgroundColor: stat.iconBg }}
                >
                  {stat.pulse && (
                    <span
                      className="absolute inset-0 rounded-xl animate-ping opacity-25"
                      style={{ backgroundColor: stat.accent }}
                    />
                  )}
                  <Icon size={17} style={{ color: stat.color }} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Severity distribution ─────────────────────────────── */}
      {totalFindings > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.3 }}
          className="card"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: "rgba(239,68,68,0.1)" }}>
              <Activity size={15} style={{ color: "var(--sev-critical)" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
                Severity Distribution
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Findings across all completed scans</p>
            </div>
          </div>

          {(() => {
            const segs = [
              { label: "Critical", count: sevCritical, color: "var(--sev-critical)" },
              { label: "High",     count: sevHigh,     color: "var(--sev-high)"     },
              { label: "Medium",   count: sevMedium,   color: "var(--sev-medium)"   },
              { label: "Low",      count: sevLow,      color: "var(--sev-low)"      },
              { label: "Info",     count: sevInfo,     color: "var(--sev-info)"     },
            ];
            const total = segs.reduce((n, s) => n + s.count, 0) || 1;
            return (
              <>
                <div className="flex w-full h-2.5 rounded-full overflow-hidden gap-0.5 mb-3">
                  {segs.map((seg) => {
                    const pct = (seg.count / total) * 100;
                    return pct > 0 ? (
                      <motion.div
                        key={seg.label}
                        title={`${seg.label}: ${seg.count}`}
                        initial={{ scaleX: 0, originX: 0 }}
                        animate={{ scaleX: 1 }}
                        transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 }}
                        style={{ width: `${pct}%`, backgroundColor: seg.color, transformOrigin: "left" }}
                      />
                    ) : null;
                  })}
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                  {segs.map((seg) => (
                    <div key={seg.label} className="flex items-center gap-1.5">
                      <span className="activity-dot" style={{ backgroundColor: seg.color }} />
                      <span className="text-xs" style={{ color: "var(--text-muted)" }}>{seg.label}</span>
                      <span className="text-xs font-semibold tabular-nums" style={{ fontFamily: "JetBrains Mono, monospace", color: "var(--text-base)" }}>
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

      {/* ── SOC overview ──────────────────────────────────────── */}
      {alertStats && alertStats.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="card"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: "rgba(245,158,11,0.12)" }}>
              <TrendingUp size={15} style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>SOC Overview</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Wazuh alert telemetry</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total Alerts",    value: alertStats.total.toLocaleString(), color: "var(--text-base)" },
              { label: "True Positives",  value: alertStats.by_verdict?.TRUE_POSITIVE  ?? 0, color: "var(--sev-critical)" },
              { label: "Escalated",       value: alertStats.by_action?.ESCALATE         ?? 0, color: "var(--sev-high)"     },
              { label: "False Positives", value: alertStats.by_verdict?.FALSE_POSITIVE  ?? 0, color: "var(--sev-low-text)" },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="rounded-xl p-3"
                style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
              >
                <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>{label}</p>
                <p className="text-2xl font-bold mt-1 tabular-nums" style={{ fontFamily: "Syne, sans-serif", color }}>{value}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Active scans live feed ─────────────────────────────── */}
      {activeScans.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
          className="card"
          style={{
            borderColor: "rgba(59,130,246,0.35)",
            boxShadow: "0 0 0 1px rgba(59,130,246,0.08), 0 4px 24px rgba(59,130,246,0.06)",
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: "var(--accent-dim)" }}>
              <span className="absolute inset-0 rounded-lg animate-ping opacity-20" style={{ backgroundColor: "var(--accent)" }} />
              <Crosshair size={15} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Live Scans</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {activeScans.length} scan{activeScans.length !== 1 ? "s" : ""} in progress
              </p>
            </div>
          </div>
          <div className="space-y-2.5">
            {activeScans.map((scan) => (
              <Link key={scan.id} to={`/scans/${scan.id}`} className="block group">
                <div
                  className="rounded-xl p-4 transition-colors"
                  style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="text-sm font-semibold truncate"
                        style={{ color: "var(--text-base)", fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem" }}
                      >
                        {scan.target}
                      </span>
                      <StatusBadge value={scan.status} variant="status" />
                    </div>
                    <span
                      className="text-sm font-bold tabular-nums shrink-0"
                      style={{ color: "var(--accent)", fontFamily: "JetBrains Mono, monospace" }}
                    >
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
                    <p className="text-[11px] mt-1.5 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                      <span style={{ color: "var(--text-subtle)" }}>→</span>
                      {TOOL_INFO[scan.current_stage].label}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Bottom: Scan grid + Quick actions ─────────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Recent scans as Instagram-style grid */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.3 }}
          className="card lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
              Recent Scans
            </h2>
            <Link
              to="/scans"
              className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--accent)" }}
            >
              View all <ChevronRight size={11} />
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
            <motion.div
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
              variants={containerVariants}
              initial="hidden"
              animate="show"
            >
              {scans.slice(0, 6).map((scan, i) => (
                <motion.div
                  key={scan.id}
                  custom={i}
                  variants={cardVariants}
                >
                  <ScanGridCard scan={scan} />
                </motion.div>
              ))}

              {/* "+ More" card when there are more scans */}
              {scans.length > 6 && (
                <Link to="/scans">
                  <div
                    className="scan-grid-card flex items-center justify-center"
                    style={{ minHeight: "106px" }}
                  >
                    <div className="text-center">
                      <p className="text-xl font-bold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-muted)" }}>
                        +{scans.length - 6}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>more scans</p>
                    </div>
                  </div>
                </Link>
              )}
            </motion.div>
          )}
        </motion.div>

        {/* Quick actions (Instagram story highlight style) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.3 }}
          className="card"
        >
          <h2
            className="text-sm font-semibold mb-5"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
          >
            Quick Actions
          </h2>

          <div className="grid grid-cols-2 gap-1">
            {quickActions.map(({ to, icon: Icon, label, accent, ringGradient }) => (
              <Link key={to} to={to} className="action-highlight">
                <div
                  className="action-highlight-ring"
                  style={{
                    background: ringGradient,
                    boxShadow: `0 4px 16px ${accent}30`,
                  }}
                >
                  <Icon size={20} style={{ color: "#fff" }} />
                </div>
                <span className="text-[11px] font-semibold text-center" style={{ color: "var(--text-muted)" }}>
                  {label}
                </span>
              </Link>
            ))}
          </div>

          {/* Platform status summary */}
          <div
            className="mt-5 pt-4 space-y-2.5"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-subtle)" }}>
              Platform Status
            </p>
            {[
              { label: "Scanner Engine", ok: true },
              { label: "Celery Worker",  ok: true },
              { label: "MongoDB",        ok: true },
              { label: "Wazuh Agent",    ok: false },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: ok ? "var(--sev-low)" : "var(--sev-critical)" }}
                  />
                  <span className="text-[10px] font-medium" style={{ color: ok ? "var(--sev-low-text)" : "var(--sev-critical-text)" }}>
                    {ok ? "Online" : "Offline"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
