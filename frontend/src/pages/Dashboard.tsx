/**
 * Dashboard — unified SOC + Pentest overview.
 * Layout order: greeting → SOC section → Pentest section → recent activity.
 * SOC Platform is shown first to reflect the Wazuh-first posture of the platform.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getScans } from "@/services/scanService";
import { getAlertStats } from "@/services/alertService";
import { useWazuhConfig } from "@/hooks/useWazuhConfig";
import { TOOL_INFO, SCAN_TYPE_LABELS } from "@/lib/constants";
import StatusBadge from "@/components/common/StatusBadge";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { useAuth } from "@/hooks/useAuth";
import {
  Rocket, ShieldCheck, BarChart3, Link2,
  Activity, AlertTriangle, CheckCircle2,
  ChevronRight, TrendingUp, Radio, Crosshair,
  ShieldAlert, Users, Zap, Settings, Server,
  Eye, TriangleAlert, X, Info,
  Target, Sparkles, FileText,
} from "lucide-react";
import type { ScanSummary, AlertStats } from "@/types";
import { BorderGlow } from "@/components/ui/BorderGlow";
import { Threads } from "@/components/ui/reactbits/Threads";
import { GlareCard } from "@/components/ui/reactbits/GlareCard";
import { SpotlightCard } from "@/components/ui/reactbits/SpotlightCard";
import { RotatingText } from "@/components/ui/reactbits/RotatingText";
import { GlowStepper, getScanStepIndex, type GlowStep } from "@/components/ui/reactbits/GlowStepper";
import { AnimatedList } from "@/components/ui/reactbits/AnimatedList";

// ── Scan pipeline steps for GlowStepper ───────────────────────────────────
const PIPELINE_STEPS = (status: string, currentStage: string | null | undefined): GlowStep[] => {
  const idx = getScanStepIndex(status, currentStage);
  const toStatus = (stepIdx: number): import("@/components/ui/reactbits/GlowStepper").StepStatus => {
    if (status === "failed"    && stepIdx === idx) return "failed";
    if (status === "cancelled" && stepIdx === idx) return "failed";
    if (stepIdx < idx)  return "completed";
    if (stepIdx === idx) return status === "completed" ? "completed" : "active";
    return "pending";
  };
  return [
    { id: "recon",    label: "Recon",    icon: Target,       status: toStatus(0) },
    { id: "scan",     label: "Scan",     icon: Crosshair,    status: toStatus(1) },
    { id: "analysis", label: "Analysis", icon: Sparkles,     status: toStatus(2) },
    { id: "report",   label: "Report",   icon: FileText,     status: toStatus(3) },
  ];
};

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

// ── Section divider ────────────────────────────────────────────────────────
function SectionLabel({ label, accent, icon: Icon }: { label: string; accent: string; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2.5 mt-1">
      <Icon size={13} style={{ color: accent }} />
      <span
        className="text-[10px] font-bold uppercase tracking-[0.18em]"
        style={{ color: accent }}
      >
        {label}
      </span>
      <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
    </div>
  );
}

// ── Stat card ──────────────────────────────────────────────────────────────
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  iconBg: string;
  accent: string;
  pulse?: boolean;
  i: number;
}

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.06, duration: 0.3, ease: "easeOut" as const },
  }),
};

function StatCard({ label, value, icon: Icon, color, iconBg, accent, pulse = false, i }: StatCardProps) {
  return (
    <GlareCard intensity="low" className="rounded-xl">
    <motion.div
      className="card relative overflow-hidden"
      custom={i}
      variants={cardVariants}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      style={{ borderTop: `2px solid ${accent}` }}
    >
      <div
        className="absolute top-0 right-0 w-14 h-14 rounded-full blur-2xl opacity-20 pointer-events-none"
        style={{ backgroundColor: accent }}
      />
      <div className="flex items-start justify-between relative">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            {label}
          </p>
          <p
            className="text-3xl font-bold mt-2 tabular-nums"
            style={{ fontFamily: "Space Grotesk, sans-serif", color }}
          >
            {typeof value === "number" ? <CountUp value={value} /> : value}
          </p>
        </div>
        <div
          className="relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
          style={{ backgroundColor: iconBg }}
        >
          {pulse && (
            <span
              className="absolute inset-0 rounded-xl animate-ping opacity-25"
              style={{ backgroundColor: accent }}
            />
          )}
          <Icon size={17} style={{ color }} />
        </div>
      </div>
    </motion.div>
    </GlareCard>
  );
}

// ── Scan card ──────────────────────────────────────────────────────────────
interface ScanCardColors {
  border: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}

function getScanColors(scan: ScanSummary): ScanCardColors {
  if (scan.status === "running" || scan.status === "pending")
    return { border: "var(--sev-info)", badgeBg: "rgba(59,130,246,0.12)", badgeText: "var(--sev-info-text)", badgeBorder: "rgba(59,130,246,0.25)" };
  if (scan.status === "failed")
    return { border: "var(--sev-critical)", badgeBg: "rgba(239,68,68,0.12)", badgeText: "var(--sev-critical-text)", badgeBorder: "rgba(239,68,68,0.25)" };
  if (scan.risk_score == null)
    return { border: "var(--border-muted)", badgeBg: "var(--bg-muted)", badgeText: "var(--text-muted)", badgeBorder: "var(--border-muted)" };
  if (scan.risk_score >= 7)
    return { border: "var(--sev-critical)", badgeBg: "rgba(239,68,68,0.12)", badgeText: "var(--sev-critical-text)", badgeBorder: "rgba(239,68,68,0.25)" };
  if (scan.risk_score >= 4)
    return { border: "var(--sev-high)", badgeBg: "rgba(249,115,22,0.12)", badgeText: "var(--sev-high-text)", badgeBorder: "rgba(249,115,22,0.3)" };
  return { border: "var(--sev-low)", badgeBg: "rgba(34,197,94,0.12)", badgeText: "var(--sev-low-text)", badgeBorder: "rgba(34,197,94,0.25)" };
}

function getDomain(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return url.split("/")[0];
  }
}

function ScanGridCard({ scan }: { scan: ScanSummary }) {
  const navigate = useNavigate();
  const colors = getScanColors(scan);
  const isActive = scan.status === "running" || scan.status === "pending";

  return (
    <motion.div
      className="scan-grid-card"
      onClick={() => navigate(`/scans/${scan.id}`)}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.15 }}
      style={{ borderTop: `2px solid ${colors.border}` }}
    >
      {isActive && (
        <div className="w-full h-0.5" style={{ backgroundColor: "var(--border)" }}>
          <motion.div
            className="h-full"
            style={{ backgroundColor: colors.border }}
            initial={{ width: 0 }}
            animate={{ width: `${scan.progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      )}
      <div className="px-3 pt-3 pb-2.5 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-1.5">
          <StatusBadge value={scan.status} variant="status" />
          {isActive ? (
            <span className="text-xs font-bold tabular-nums" style={{ color: "var(--sev-info-text)", fontFamily: "JetBrains Mono, monospace" }}>
              {scan.progress}%
            </span>
          ) : scan.risk_score != null ? (
            <span
              className="text-xs font-bold px-1.5 py-0.5 rounded tabular-nums"
              style={{ backgroundColor: colors.badgeBg, color: colors.badgeText, border: `1px solid ${colors.badgeBorder}`, fontFamily: "JetBrains Mono, monospace" }}
            >
              {scan.risk_score.toFixed(1)}
            </span>
          ) : null}
        </div>
        <p className="text-xs font-semibold truncate" style={{ color: "var(--text-base)", fontFamily: "JetBrains Mono, monospace" }} title={scan.target}>
          {getDomain(scan.target)}
        </p>
        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-muted)" }}>
          <span>{scan.finding_count} findings</span>
          <span className="w-0.5 h-0.5 rounded-full" style={{ backgroundColor: "var(--text-subtle)" }} />
          <span className="truncate">{SCAN_TYPE_LABELS[scan.scan_type] || scan.scan_type}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Quick actions ──────────────────────────────────────────────────────────
interface QuickAction {
  to: string;
  icon: React.ElementType;
  label: string;
  accent: string;
  ringGradient: string;
}

// SOC actions listed first
const quickActions: QuickAction[] = [
  {
    to: "/alerts",
    icon: ShieldAlert,
    label: "SOC Alerts",
    accent: "#EF4444",
    ringGradient: "linear-gradient(135deg, #EF4444, #F87171)",
  },
  {
    to: "/analytics",
    icon: BarChart3,
    label: "Analytics",
    accent: "#A855F7",
    ringGradient: "linear-gradient(135deg, #A855F7, #C084FC)",
  },
  {
    to: "/scans/new",
    icon: Rocket,
    label: "New Scan",
    accent: "#3B82F6",
    ringGradient: "linear-gradient(135deg, #3B82F6, #60A5FA)",
  },
  {
    to: "/correlations",
    icon: Link2,
    label: "Correlate",
    accent: "#22C55E",
    ringGradient: "linear-gradient(135deg, #22C55E, #4ADE80)",
  },
];

// ── Main component ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user } = useAuth();
  const { isConfigured: wazuhConfigured } = useWazuhConfig();
  const location = useLocation();
  const roleBlocked = (location.state as { roleBlocked?: boolean; requiredRole?: string } | null)?.roleBlocked ?? false;
  const requiredRole = (location.state as { roleBlocked?: boolean; requiredRole?: string } | null)?.requiredRole ?? "analyst";
  const [roleBannerDismissed, setRoleBannerDismissed] = useState(false);
  const [wazuhBannerDismissed, setWazuhBannerDismissed] = useState(
    () => localStorage.getItem("wazuh_banner_dismissed") === "true"
  );

  const [scans, setScans]           = useState<ScanSummary[]>([]);
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null);
  const [alertError, setAlertError] = useState(false);
  const [loading, setLoading]       = useState(true);

  const fetchData = useCallback(async () => {
    const [scanData, statsData] = await Promise.allSettled([
      getScans(1, 50),
      getAlertStats(),
    ]);
    if (scanData.status  === "fulfilled") setScans(scanData.value);
    if (statsData.status === "fulfilled") {
      setAlertStats(statsData.value);
      setAlertError(false);
    } else {
      setAlertError(true);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Pentest derived stats ──
  const activeScans    = scans.filter((s) => s.status === "running" || s.status === "pending");
  const completedScans = scans.filter((s) => s.status === "completed");
  const totalFindings  = scans.reduce((sum, s) => sum + (s.finding_count || 0), 0);
  const highRiskCount  = scans.filter((s) => (s.risk_score ?? 0) >= 7).length;

  // ── Severity bar ──
  const sevCritical = completedScans.filter((s) => (s.risk_score ?? 0) >= 8).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevHigh     = completedScans.filter((s) => (s.risk_score ?? 0) >= 6 && (s.risk_score ?? 0) < 8).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevMedium   = completedScans.filter((s) => (s.risk_score ?? 0) >= 4 && (s.risk_score ?? 0) < 6).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevLow      = completedScans.filter((s) => (s.risk_score ?? 0) < 4 && (s.finding_count || 0) > 0).reduce((n, s) => n + (s.finding_count || 0), 0);
  const sevInfo     = completedScans.filter((s) => !s.risk_score && (s.finding_count || 0) === 0).length;

  // ── SOC derived stats ──
  const socTotal     = alertStats?.total ?? 0;
  const socEscalated = alertStats?.by_action?.["ESCALATE"] ?? 0;
  const socTP        = alertStats?.by_verdict?.["TRUE_POSITIVE"] ?? 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading security telemetry...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 relative">
      {/* ── Threads texture — ambient background only ───────── */}
      <Threads count={10} opacity={0.05} className="fixed inset-0 z-0 pointer-events-none" />

      {/* ── Role-blocked notice ──────────────────────────────── */}
      {roleBlocked && !roleBannerDismissed && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="flex items-start gap-3 rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.25)",
            color: "var(--sev-medium-text)",
          }}
        >
          <TriangleAlert size={15} className="shrink-0 mt-0.5" />
          <span className="flex-1">
            Your account has <strong>Viewer</strong> access — you cannot create scans.
            Ask an admin to promote you to <strong>{requiredRole}</strong> to unlock this feature.
          </span>
          <button
            onClick={() => setRoleBannerDismissed(true)}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}

      {/* ── Wazuh agent setup prompt ─────────────────────────── */}
      {user?.role === "analyst" && !user?.wazuh_agent_name && !wazuhBannerDismissed && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.05 }}
          className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: "var(--accent-dim)",
            border: "1px solid rgba(59,130,246,0.25)",
            color: "var(--sev-info-text)",
          }}
        >
          <Info size={14} className="shrink-0" />
          <span className="flex-1">
            Link your Wazuh agent to enable personalized SOC alerts.{" "}
            <Link
              to="/settings"
              className="font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
              style={{ color: "var(--accent)" }}
            >
              Open Settings →
            </Link>
          </span>
          <button
            onClick={() => {
              localStorage.setItem("wazuh_banner_dismissed", "true");
              setWazuhBannerDismissed(true);
            }}
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X size={14} />
          </button>
        </motion.div>
      )}

      {/* ── Greeting header ───────────────────────────────────── */}
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
            <RotatingText
              texts={[getGreeting(), "Security Monitor", "Threat Overview", "SOC Dashboard"]}
              interval={4000}
              className="inline-block"
            />,{" "}
            <span style={{ color: "var(--accent)" }}>{user?.username ?? "operator"}</span>
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            {socTotal > 0
              ? `${socTotal.toLocaleString()} alerts monitored · ${socEscalated} escalated`
              : "SOC platform ready"}
            {activeScans.length > 0 && ` · ${activeScans.length} scan${activeScans.length !== 1 ? "s" : ""} running`}
          </p>
        </div>

        <div
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium shrink-0"
          style={{ backgroundColor: "var(--color-success-dim)", color: "var(--sev-low-text)", border: "1px solid var(--color-success-border)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Platform Online
        </div>
      </motion.div>

      {/* ════════════════════════════════════════════════════════
          SOC PLATFORM SECTION
      ════════════════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.05, duration: 0.2 }}>
        <SectionLabel label="SOC Platform" accent="#EF4444" icon={ShieldAlert} />
      </motion.div>

      {/* SOC stat cards */}
      <motion.div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      >
        <StatCard label="Total Alerts"   value={socTotal}     icon={ShieldAlert}    color={socTotal > 0 ? "var(--sev-critical-text)" : "var(--text-muted)"} iconBg={socTotal > 0 ? "rgba(239,68,68,0.12)" : "var(--bg-muted)"} accent={socTotal > 0 ? "#EF4444" : "var(--border-muted)"} i={0} />
        <StatCard label="True Positives" value={socTP}        icon={TriangleAlert}  color={socTP > 0 ? "var(--sev-high-text)" : "var(--text-muted)"}      iconBg={socTP > 0 ? "rgba(249,115,22,0.12)" : "var(--bg-muted)"}  accent={socTP > 0 ? "#F97316" : "var(--border-muted)"}   i={1} />
        <StatCard label="Escalated"      value={socEscalated} icon={Zap}            color={socEscalated > 0 ? "var(--sev-medium-text)" : "var(--text-muted)"} iconBg={socEscalated > 0 ? "rgba(234,179,8,0.12)" : "var(--bg-muted)"} accent={socEscalated > 0 ? "#EAB308" : "var(--border-muted)"} i={2} />
        <StatCard label="Monitored"      value={alertStats?.by_action?.["MONITOR"] ?? 0} icon={Eye} color="var(--color-purple-text)" iconBg="var(--color-purple-dim)" accent="#A855F7" i={3} />
      </motion.div>

      {/* SOC overview card — always visible */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18, duration: 0.3 }}
        className="card"
        style={alertStats && alertStats.total > 0 ? {} : {
          border: "1px dashed var(--border)",
          backgroundColor: "var(--bg-muted)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.18)" }}
            >
              <TrendingUp size={15} style={{ color: "#ef4444" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Wazuh Alert Overview</h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Real-time SIEM telemetry</p>
            </div>
          </div>
          <Link
            to="/alerts"
            className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
            style={{ color: "#ef4444" }}
          >
            View alerts <ChevronRight size={11} />
          </Link>
        </div>

        {alertStats && alertStats.total > 0 ? (
          <div className="space-y-4">
            {/* Top metrics row */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Total Alerts",    value: alertStats.total.toLocaleString(), color: "var(--text-base)" },
                { label: "True Positives",  value: socTP,        color: "var(--sev-critical)"  },
                { label: "Escalated",       value: socEscalated, color: "#f59e0b"               },
                { label: "False Positives", value: alertStats.by_verdict?.["FALSE_POSITIVE"] ?? 0, color: "var(--sev-low-text)" },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-xl p-3" style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}>
                  <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-muted)" }}>{label}</p>
                  <p className="text-2xl font-bold mt-1 tabular-nums" style={{ fontFamily: "Space Grotesk, sans-serif", color }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Top agents + top rules */}
            {(alertStats.top_agents?.length > 0 || alertStats.top_rules?.length > 0) && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Top agents */}
                {alertStats.top_agents?.length > 0 && (
                  <div className="rounded-xl p-3.5" style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <Users size={12} style={{ color: "var(--text-subtle)" }} />
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>Top Agents</span>
                    </div>
                    <div className="space-y-2">
                      {alertStats.top_agents.slice(0, 3).map((agent) => (
                        <div key={agent._id} className="flex items-center justify-between">
                          <span className="text-xs font-mono truncate" style={{ color: "var(--text-base)" }}>{agent._id || "unknown"}</span>
                          <span
                            className="text-xs font-bold tabular-nums ml-2 px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#f87171", fontFamily: "JetBrains Mono, monospace" }}
                          >
                            {agent.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top rules */}
                {alertStats.top_rules?.length > 0 && (
                  <div className="rounded-xl p-3.5" style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldCheck size={12} style={{ color: "var(--text-subtle)" }} />
                      <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>Top Rules</span>
                    </div>
                    <div className="space-y-2">
                      {alertStats.top_rules.slice(0, 3).map((rule) => (
                        <div key={rule._id} className="flex items-center justify-between gap-2">
                          <span className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{rule.desc || rule._id}</span>
                          <span
                            className="text-xs font-bold tabular-nums shrink-0 px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "rgba(249,115,22,0.1)", color: "#fb923c", fontFamily: "JetBrains Mono, monospace" }}
                          >
                            {rule.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Empty state — always visible */
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div
              className="flex items-center justify-center w-12 h-12 rounded-2xl"
              style={{ backgroundColor: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}
            >
              <ShieldAlert size={22} style={{ color: "rgba(239,68,68,0.4)" }} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                {alertError ? "Unable to reach Wazuh backend" : "No alerts ingested yet"}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
                {!wazuhConfigured
                  ? "Configure your Wazuh connection in Settings to start receiving alerts"
                  : "Waiting for Wazuh to forward events"}
              </p>
            </div>
            {!wazuhConfigured && (
              <Link
                to="/settings"
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
              >
                <Server size={12} /> Configure Wazuh
              </Link>
            )}
          </div>
        )}
      </motion.div>

      {/* ════════════════════════════════════════════════════════
          PENTEST ENGINE SECTION
      ════════════════════════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.22, duration: 0.2 }}>
        <SectionLabel label="Pentest Engine" accent="#F59E0B" icon={Crosshair} />
      </motion.div>

      {/* Pentest stat cards */}
      <motion.div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
      >
        <StatCard label="Active Scans"   value={activeScans.length}   icon={Radio}         color={activeScans.length > 0 ? "var(--sev-info-text)" : "var(--text-muted)"}     iconBg={activeScans.length > 0 ? "rgba(59,130,246,0.15)" : "var(--bg-muted)"}    accent={activeScans.length > 0 ? "#3B82F6" : "var(--border-muted)"} pulse={activeScans.length > 0} i={0} />
        <StatCard label="Completed"      value={completedScans.length} icon={CheckCircle2}  color="var(--sev-low-text)"       iconBg="var(--color-success-dim)"   accent="#22C55E" i={1} />
        <StatCard label="Total Findings" value={totalFindings}          icon={Activity}      color="var(--color-purple-text)"  iconBg="var(--color-purple-dim)"    accent="#A855F7" i={2} />
        <StatCard label="High Risk"      value={highRiskCount}          icon={AlertTriangle} color={highRiskCount > 0 ? "var(--sev-critical-text)" : "var(--text-muted)"} iconBg={highRiskCount > 0 ? "rgba(239,68,68,0.12)" : "var(--bg-muted)"} accent={highRiskCount > 0 ? "#EF4444" : "var(--border-muted)"} i={3} />
      </motion.div>

      {/* Active scans live feed */}
      <AnimatePresence>
        {activeScans.length > 0 && (
          <motion.div
            key="live-scans"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ delay: 0.28, duration: 0.3 }}
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
            <AnimatedList
              items={activeScans}
              keyExtractor={(scan) => scan.id}
              className="space-y-2.5"
              renderItem={(scan) => (
                <Link to={`/scans/${scan.id}`} className="block group">
                  <div className="rounded-xl p-4 transition-colors" style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-sm font-semibold truncate" style={{ color: "var(--text-base)", fontFamily: "JetBrains Mono, monospace", fontSize: "0.8rem" }}>
                          {scan.target}
                        </span>
                        <StatusBadge value={scan.status} variant="status" />
                      </div>
                      <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "var(--accent)", fontFamily: "JetBrains Mono, monospace" }}>
                        {scan.progress}%
                      </span>
                    </div>
                    <div className="w-full h-1.5 rounded-full overflow-hidden mb-3" style={{ backgroundColor: "var(--border)" }}>
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: "var(--accent)" }}
                        initial={{ width: 0 }}
                        animate={{ width: `${scan.progress}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <GlowStepper steps={PIPELINE_STEPS(scan.status, scan.current_stage)} />
                    {scan.current_stage && TOOL_INFO[scan.current_stage] && (
                      <p className="text-[11px] mt-2 flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
                        <span style={{ color: "var(--text-subtle)" }}>→</span>
                        {TOOL_INFO[scan.current_stage].label}
                      </p>
                    )}
                  </div>
                </Link>
              )}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Severity distribution */}
      {totalFindings > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="card"
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ backgroundColor: "rgba(245,158,11,0.1)" }}>
              <Activity size={15} style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <h2 className="text-sm font-semibold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
                Finding Severity Distribution
              </h2>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Across all completed scans</p>
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

      {/* ── Bottom: Recent scans + Quick actions ──────────────── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* Recent scans */}
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
            <Link to="/scans" className="flex items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70" style={{ color: "var(--accent)" }}>
              View all <ChevronRight size={11} />
            </Link>
          </div>

          {scans.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "var(--bg-muted)" }}>
                <Crosshair size={22} style={{ color: "var(--text-subtle)" }} />
              </div>
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>No scans yet</p>
              <Link to="/scans/new" className="btn-primary text-xs">Launch first scan</Link>
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
              initial="hidden"
              animate="show"
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.07 } } }}
            >
              {scans.slice(0, 6).map((scan, i) => (
                <motion.div key={scan.id} custom={i} variants={cardVariants}>
                  <ScanGridCard scan={scan} />
                </motion.div>
              ))}
              {scans.length > 6 && (
                <Link to="/scans">
                  <div className="scan-grid-card flex items-center justify-center" style={{ minHeight: "106px" }}>
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

        {/* Quick actions */}
        <SpotlightCard className="rounded-xl">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.3 }}
          className="card"
        >
          <h2 className="text-sm font-semibold mb-5" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 gap-1">
            {quickActions.map(({ to, icon: Icon, label, accent, ringGradient }) => (
              <Link key={to} to={to} className="action-highlight">
                <div
                  className="action-highlight-ring"
                  style={{ background: ringGradient, boxShadow: `0 4px 16px ${accent}30` }}
                >
                  <Icon size={20} style={{ color: "#fff" }} />
                </div>
                <span className="text-[11px] font-semibold text-center" style={{ color: "var(--text-muted)" }}>
                  {label}
                </span>
              </Link>
            ))}
          </div>

          {/* Settings shortcut at bottom */}
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <Link
              to="/settings"
              className="flex items-center justify-between group rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--bg-muted)]"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ backgroundColor: "rgba(148,163,184,0.12)" }}>
                  <Settings size={13} style={{ color: "var(--text-subtle)" }} />
                </div>
                <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Wazuh Settings</span>
              </div>
              {wazuhConfigured ? (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#4ade80" }}>
                  Connected
                </span>
              ) : (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#f87171" }}>
                  Not set
                </span>
              )}
            </Link>
          </div>
        </motion.div>
        </SpotlightCard>
      </div>

    </div>
  );
}
