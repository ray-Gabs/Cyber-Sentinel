/**
 * Landing.tsx — Public hero page at "/"
 * Minimal, authoritative, dark/light adaptive.
 * React Bits-inspired: circular text, card swap, chroma grid.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuth } from "@/hooks/useAuth";
import {
  ShieldCheck, Radar, BrainCircuit, FileText,
  ArrowRight, Terminal, Activity, Sun, Moon,
  Zap, Lock, Globe, ChevronRight, Network,
} from "lucide-react";
import { DottedBackground } from "@/components/ui/DottedBackground";
import { AnimatedGridPattern } from "@/components/ui/AnimatedGridPattern";
import { FloatingParticles } from "@/components/ui/FloatingParticles";
import { LightRays } from "@/components/ui/LightRays";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

// ── Animation helpers ──────────────────────────────────────────────────────────
const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const } },
});

// ── Circular SVG Text ──────────────────────────────────────────────────────────
function CircularText({ text, radius = 52 }: { text: string; radius?: number }) {
  const chars = text.split("");
  const angleStep = 360 / chars.length;
  return (
    <svg
      width={radius * 2 + 24}
      height={radius * 2 + 24}
      viewBox={`0 0 ${radius * 2 + 24} ${radius * 2 + 24}`}
      className="absolute inset-0 w-full h-full"
      style={{ animation: "cs-spin 18s linear infinite" }}
    >
      <style>{`@keyframes cs-spin { to { transform: rotate(360deg); } }`}</style>
      {chars.map((char, i) => {
        const angle = (angleStep * i - 90) * (Math.PI / 180);
        const x = radius + 12 + radius * Math.cos(angle);
        const y = radius + 12 + radius * Math.sin(angle);
        return (
          <text
            key={i}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
            fontWeight="600"
            letterSpacing="0.05em"
            fill="rgba(59,130,246,0.55)"
            transform={`rotate(${angleStep * i}, ${x}, ${y})`}
          >
            {char}
          </text>
        );
      })}
    </svg>
  );
}

// ── Feature data ───────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Radar,
    title: "Automated Pentesting",
    body: "17-tool pipeline — Nmap, Nuclei, ZAP, SSLyze and more. OWASP Top 10:2025 coverage out of the box.",
    detail: "Scans run in parallel via Celery workers. Results stream live to your dashboard via WebSocket.",
    color: "#3b82f6",
    tag: "Intern A",
  },
  {
    icon: Activity,
    title: "Real-Time SOC",
    body: "Wazuh agent integration with AI-powered alert triage, MITRE ATT&CK mapping, and per-student scoping.",
    detail: "Alerts are enriched with VirusTotal + AbuseIPDB threat intel and correlated to pentest findings.",
    color: "#22c55e",
    tag: "Intern B",
  },
  {
    icon: BrainCircuit,
    title: "AI Analysis",
    body: "LLM-generated executive summaries, CVE enrichment with EPSS scoring, and automated remediation guidance.",
    detail: "Powered by Google Gemini 2.0 Flash. Migrating to Claude API for richer structured output.",
    color: "#a855f7",
    tag: "AI Layer",
  },
  {
    icon: FileText,
    title: "Export Reports",
    body: "One-click PDF and HTML reports. Scan diff comparison to track remediation progress across assessments.",
    detail: "Jinja2 templates + WeasyPrint for PDF. Structured reports match professional pentest standards.",
    color: "#f59e0b",
    tag: "Reports",
  },
] as const;

// ── Tool list ──────────────────────────────────────────────────────────────────
const TOOLS = [
  "Nmap", "Nuclei", "ZAP", "SSLyze", "WhatWeb",
  "NIST NVD", "FIRST EPSS", "Wazuh", "MITRE ATT&CK",
  "VirusTotal", "AbuseIPDB", "Metasploit",
];

// ── Stats ──────────────────────────────────────────────────────────────────────
const STATS = [
  { label: "Security Tools", value: "17+" },
  { label: "OWASP Coverage", value: "Top 10" },
  { label: "Alert Pipeline", value: "Real-time" },
  { label: "AI Models", value: "Gemini + Claude" },
];

// ── Card Swap Feature Card ─────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, body, detail, color, tag }: typeof FEATURES[number]) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div
      className="relative cursor-pointer"
      style={{ perspective: "1000px", minHeight: "200px" }}
      onMouseEnter={() => setFlipped(true)}
      onMouseLeave={() => setFlipped(false)}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformStyle: "preserve-3d", width: "100%", height: "100%", position: "relative", minHeight: "200px" }}
      >
        {/* Front */}
        <div
          className="absolute inset-0 rounded-xl p-5 text-left flex flex-col"
          style={{
            backfaceVisibility: "hidden",
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: `${color}14`, border: `1px solid ${color}28` }}
            >
              <Icon size={16} style={{ color }} />
            </div>
            <span
              className="text-[9px] uppercase tracking-widest font-semibold px-2 py-0.5 rounded-full"
              style={{ background: `${color}12`, color, border: `1px solid ${color}22` }}
            >
              {tag}
            </span>
          </div>
          <h3 className="text-sm font-semibold mb-1.5" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
            {title}
          </h3>
          <p className="text-xs leading-relaxed flex-1" style={{ color: "var(--text-muted)" }}>{body}</p>
          <div className="mt-3 flex items-center gap-1 text-[10px]" style={{ color }}>
            Hover to learn more <ChevronRight size={10} />
          </div>
        </div>

        {/* Back */}
        <div
          className="absolute inset-0 rounded-xl p-5 flex flex-col justify-center"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            backgroundColor: `${color}08`,
            border: `1px solid ${color}28`,
          }}
        >
          <Icon size={20} style={{ color, marginBottom: "10px" }} />
          <h3 className="text-sm font-bold mb-2" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
            {title}
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{detail}</p>
        </div>
      </motion.div>
    </div>
  );
}

// ── Chroma tool grid ───────────────────────────────────────────────────────────
function ToolGrid() {
  const colors = ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#ef4444", "#06b6d4"];
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {TOOLS.map((tool, i) => (
        <motion.span
          key={tool}
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: i * 0.04, duration: 0.3 }}
          whileHover={{ scale: 1.05, y: -1 }}
          className="text-xs font-medium px-3 py-1.5 rounded-lg cursor-default"
          style={{
            backgroundColor: `${colors[i % colors.length]}10`,
            border: `1px solid ${colors[i % colors.length]}22`,
            color: `${colors[i % colors.length]}cc`,
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          {tool}
        </motion.span>
      ))}
    </div>
  );
}

// ── Mock dashboard preview ─────────────────────────────────────────────────────
function DashboardPreview({ isDark }: { isDark: boolean }) {
  const bars = [65, 85, 45, 92, 38, 71, 58];
  return (
    <div
      className="w-full rounded-2xl overflow-hidden"
      style={{
        backgroundColor: isDark ? "#06091A" : "#ffffff",
        border: `1px solid ${isDark ? "rgba(59,130,246,0.2)" : "rgba(59,130,246,0.15)"}`,
        boxShadow: isDark
          ? "0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(59,130,246,0.08)"
          : "0 24px 48px rgba(59,130,246,0.1), 0 4px 12px rgba(0,0,0,0.06)",
      }}
    >
      {/* Titlebar */}
      <div
        className="flex items-center gap-1.5 px-4 py-3"
        style={{ borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}
      >
        <div className="w-2.5 h-2.5 rounded-full bg-red-400 opacity-60" />
        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 opacity-60" />
        <div className="w-2.5 h-2.5 rounded-full bg-green-400 opacity-60" />
        <div className="flex-1 mx-3 h-4 rounded" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)" }} />
      </div>

      {/* Mock content */}
      <div className="p-4 space-y-3">
        {/* Stat row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Active Scans", val: "3", color: "#3b82f6" },
            { label: "Critical", val: "7", color: "#ef4444" },
            { label: "Alerts", val: "12", color: "#22c55e" },
          ].map((s) => (
            <div key={s.label} className="rounded-lg p-2.5"
              style={{ backgroundColor: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)", border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}` }}
            >
              <div className="text-[9px] mb-1" style={{ color: isDark ? "#607898" : "#6b7fa0" }}>{s.label}</div>
              <div className="text-base font-bold" style={{ color: s.color, fontFamily: "Syne, sans-serif" }}>{s.val}</div>
            </div>
          ))}
        </div>
        {/* Bar chart mock */}
        <div className="rounded-lg p-3" style={{ backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}>
          <div className="text-[9px] mb-2 font-medium" style={{ color: isDark ? "#607898" : "#6b7fa0" }}>Vulnerability Trend</div>
          <div className="flex items-end gap-1 h-12">
            {bars.map((h, i) => (
              <motion.div
                key={i}
                className="flex-1 rounded-sm"
                initial={{ height: 0 }}
                whileInView={{ height: `${h}%` }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  background: `rgba(59,130,246,${0.3 + (i % 3) * 0.15})`,
                  alignSelf: "flex-end",
                }}
              />
            ))}
          </div>
        </div>
        {/* Scan rows */}
        {[
          { target: "192.168.1.1", status: "Critical", color: "#ef4444" },
          { target: "10.0.0.5", status: "Medium", color: "#f59e0b" },
        ].map((row) => (
          <div key={row.target} className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ backgroundColor: isDark ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.02)", border: `1px solid ${isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}` }}
          >
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: row.color }} />
              <span className="text-[10px] font-mono" style={{ color: isDark ? "#607898" : "#6b7fa0" }}>{row.target}</span>
            </div>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ color: row.color, background: `${row.color}14` }}>{row.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Steps ──────────────────────────────────────────────────────────────────────
const STEPS = [
  { icon: Globe,       step: "01", title: "Submit Target",   body: "Enter a URL or IP. The engine validates scope and creates a scan record." },
  { icon: Zap,         step: "02", title: "Parallel Scan",   body: "17 tools run simultaneously via Celery workers. Results stream to your browser live." },
  { icon: BrainCircuit,step: "03", title: "AI Analysis",     body: "CVEs are enriched, EPSS scores calculated, and an LLM narrative is generated." },
  { icon: Lock,        step: "04", title: "Export Report",   body: "Download a professional PDF or HTML report. Track remediation with scan diffs." },
];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Landing() {
  const { isDark, toggleTheme } = useTheme();
  const { user } = useAuth();

  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: isDark ? "#06091A" : "#f0f6ff" }}
    >
      {/* ── Dark mode background ───────────────────────────────────── */}
      {isDark && (
        <>
          <DottedBackground isDark className="opacity-40" />
          <div className="absolute inset-0 pointer-events-none" style={{ color: "rgba(59,130,246,0.10)" }}>
            <AnimatedGridPattern
              width={56} height={56} numSquares={18} maxOpacity={0.55} duration={5} repeatDelay={0.8}
              className={cn("[mask-image:radial-gradient(ellipse_80%_60%_at_50%_20%,white,transparent)]",
                "stroke-current fill-current w-full h-full absolute inset-0")}
            />
          </div>
          <FloatingParticles count={12} color="rgba(59,130,246,0.20)" />
        </>
      )}

      {/* ── Light mode background ──────────────────────────────────── */}
      {!isDark && (
        <>
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: "linear-gradient(160deg, #f0f6ff 0%, #eaf1ff 50%, #f4f0ff 100%)" }}
          />
          <LightRays />
        </>
      )}

      {/* ── Nav ───────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-5 sm:px-8 md:px-12 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.28)" }}
          >
            <ShieldCheck size={16} style={{ color: "#3b82f6" }} />
          </div>
          <span className="text-base font-bold tracking-tight"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.02em" }}
          >
            Cyber Sentinel
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="btn-ghost p-2 rounded-lg" title={isDark ? "Light mode" : "Dark mode"}>
            {isDark
              ? <Sun  size={14} style={{ color: "var(--text-muted)" }} />
              : <Moon size={14} style={{ color: "var(--accent)" }} />
            }
          </button>
          {user ? (
            <Link to={ROUTES.DASHBOARD}
              className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg transition-all"
              style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#3b82f6" }}
            >
              Dashboard <ArrowRight size={12} />
            </Link>
          ) : (
            <>
              <Link to={ROUTES.LOGIN} className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                style={{ color: "var(--text-muted)" }}
              >Sign in</Link>
              <Link to={ROUTES.REGISTER}
                className="text-sm font-semibold px-4 py-2 rounded-lg transition-all"
                style={{ background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", color: "#3b82f6" }}
              >Register</Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-5 sm:px-8 md:px-12">

        <div className="w-full max-w-6xl flex flex-col items-center pt-12 sm:pt-20 pb-16">

          {/* Circular text badge */}
          <motion.div {...fade(0.04)} className="mb-8 relative w-28 h-28 flex items-center justify-center">
            <CircularText text="CYBER·SENTINEL·ITS·SMU·2026·" radius={48} />
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10"
              style={{ background: "rgba(59,130,246,0.10)", border: "1px solid rgba(59,130,246,0.25)" }}
            >
              <ShieldCheck size={22} style={{ color: "#3b82f6" }} />
            </div>
          </motion.div>

          {/* Badge */}
          <motion.div {...fade(0.08)} className="mb-5">
            <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] font-semibold px-3 py-1.5 rounded-full"
              style={{ background: "rgba(59,130,246,0.07)", border: "1px solid rgba(59,130,246,0.18)", color: "#3b82f6" }}
            >
              <Terminal size={9} /> Smart City &amp; Cybersecurity Lab · ITS
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1 {...fade(0.12)}
            className="text-4xl sm:text-5xl md:text-6xl font-bold max-w-3xl leading-[1.08] tracking-tight text-center"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.03em" }}
          >
            Unified Security
            <br />
            <span style={{ color: "#3b82f6" }}>Assessment Platform</span>
          </motion.h1>

          {/* Subtext */}
          <motion.p {...fade(0.18)}
            className="mt-5 text-base sm:text-lg max-w-xl leading-relaxed text-center"
            style={{ color: "var(--text-muted)" }}
          >
            Automated pentesting, AI-powered SOC monitoring, and real-time threat analysis
            — purpose-built for web security education at SMU ITS Lab.
          </motion.p>

          {/* CTAs */}
          <motion.div {...fade(0.24)} className="flex flex-col sm:flex-row items-center gap-3 mt-8">
            <Link to={user ? ROUTES.DASHBOARD : ROUTES.LOGIN}
              className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl transition-all w-full sm:w-auto justify-center"
              style={{ background: "#2563eb", color: "#fff" }}
            >
              {user ? "Open Dashboard" : "Sign in to dashboard"}
              <ArrowRight size={14} />
            </Link>
            {!user && (
              <Link to={ROUTES.REGISTER}
                className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl transition-all w-full sm:w-auto justify-center"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }}
              >
                Create an account
              </Link>
            )}
          </motion.div>

          {/* Stats strip */}
          <motion.div {...fade(0.3)}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-12 w-full max-w-2xl"
          >
            {STATS.map(({ label, value }) => (
              <div key={label} className="rounded-xl p-4 text-center"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="text-lg font-bold mb-0.5"
                  style={{ fontFamily: "Syne, sans-serif", color: "#3b82f6" }}
                >{value}</div>
                <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>{label}</div>
              </div>
            ))}
          </motion.div>

          {/* Dashboard preview */}
          <motion.div {...fade(0.36)} className="mt-14 w-full max-w-3xl">
            <div className="text-center mb-4">
              <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--text-subtle)" }}>
                Live Dashboard Preview
              </span>
            </div>
            <DashboardPreview isDark={isDark} />
          </motion.div>
        </div>

        {/* ── Feature cards (card swap) ──────────────────────────── */}
        <section className="w-full max-w-6xl pb-20">
          <motion.div {...fade(0.1)} className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
              What's inside
            </h2>
            <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
              Hover any card to see implementation details
            </p>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
              >
                <FeatureCard {...f} />
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── How it works ────────────────────────────────────────── */}
        <section className="w-full max-w-6xl pb-20">
          <motion.div
            initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
              How it works
            </h2>
          </motion.div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STEPS.map(({ icon: Icon, step, title, body }, i) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.09, duration: 0.4 }}
                className="rounded-xl p-5"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] font-bold" style={{ color: "#3b82f6", fontFamily: "JetBrains Mono, monospace" }}>{step}</span>
                  <div className="flex-1 h-px" style={{ background: "var(--border)" }} />
                  <Icon size={13} style={{ color: "var(--text-subtle)" }} />
                </div>
                <h3 className="text-sm font-semibold mb-1.5" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>{body}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── Security tools chroma grid ───────────────────────────── */}
        <section className="w-full max-w-4xl pb-20 text-center">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}>
            <h2 className="text-lg font-bold mb-2" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
              Integrated Security Tools
            </h2>
            <p className="text-xs mb-8" style={{ color: "var(--text-muted)" }}>
              17-tool pipeline running in parallel — all orchestrated automatically
            </p>
            <ToolGrid />
          </motion.div>
        </section>

        {/* ── Network pipeline section ─────────────────────────────── */}
        <section className="w-full max-w-4xl pb-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl p-8 text-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <Network size={28} style={{ color: "#3b82f6", margin: "0 auto 12px" }} />
            <h2 className="text-xl font-bold mb-3" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}>
              Correlation Engine
            </h2>
            <p className="text-sm leading-relaxed max-w-lg mx-auto" style={{ color: "var(--text-muted)" }}>
              Pentest findings from Intern A's pipeline are automatically cross-referenced with Intern B's
              Wazuh SOC alerts — linking CVEs to real attack telemetry for a complete threat picture.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 mt-6 text-xs font-mono" style={{ color: "var(--text-subtle)" }}>
              <span style={{ color: "#3b82f6" }}>Pentest Engine</span>
              <span>→</span>
              <span style={{ color: "#a855f7" }}>Correlation Engine</span>
              <span>→</span>
              <span style={{ color: "#22c55e" }}>SOC Dashboard</span>
            </div>
          </motion.div>
        </section>

      </main>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <footer className="relative z-10 text-center py-6 px-5 border-t" style={{ borderColor: "var(--border)" }}>
        <p className="text-[10px] uppercase tracking-[0.2em] font-medium" style={{ color: "var(--text-subtle)" }}>
          Smart City &amp; Cybersecurity Lab · ITS · San Miguel University · v1.0
        </p>
      </footer>
    </div>
  );
}
