/**
 * Landing.tsx — Public hero page at "/"
 *
 * Aesthetic: Dark command-center. Minimal. Authoritative.
 * Reuses the same background layers from Login for visual coherence.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ShieldCheck, Radar, BrainCircuit, FileText,
  ArrowRight, Terminal, Activity,
} from "lucide-react";
import { DottedBackground } from "@/components/ui/DottedBackground";
import { AnimatedGridPattern } from "@/components/ui/AnimatedGridPattern";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const } },
});

const FEATURES = [
  {
    icon: Radar,
    title: "Automated Pentesting",
    body: "17-tool pipeline — Nmap, Nuclei, ZAP, SSLyze and more. OWASP Top 10:2025 coverage out of the box.",
    color: "#3b82f6",
  },
  {
    icon: Activity,
    title: "Real-Time SOC",
    body: "Wazuh agent integration with AI-powered alert triage, MITRE ATT&CK mapping, and per-student scoping.",
    color: "#22c55e",
  },
  {
    icon: BrainCircuit,
    title: "AI Analysis",
    body: "LLM-generated executive summaries, CVE enrichment with EPSS scoring, and automated remediation guidance.",
    color: "#a855f7",
  },
  {
    icon: FileText,
    title: "Export Reports",
    body: "One-click PDF and HTML reports. Scan diff comparison to track remediation progress across assessments.",
    color: "#f59e0b",
  },
] as const;

export default function Landing() {
  return (
    <div
      className="relative min-h-screen flex flex-col overflow-hidden"
      style={{ backgroundColor: "#06091A" }}
    >
      {/* ── Background layers ─────────────────────────────────────────── */}
      <DottedBackground isDark className="opacity-50" />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ color: "rgba(59,130,246,0.13)" }}
      >
        <AnimatedGridPattern
          width={56}
          height={56}
          numSquares={20}
          maxOpacity={0.65}
          duration={5}
          repeatDelay={0.8}
          className={cn(
            "[mask-image:radial-gradient(ellipse_80%_80%_at_50%_30%,white,transparent)]",
            "stroke-current fill-current w-full h-full absolute inset-0",
          )}
        />
      </div>

      {/* Radial blue glow — top-center */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(59,130,246,0.10) 0%, transparent 65%)",
        }}
      />

      {/* Edge vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 40%, rgba(2,8,23,0.8) 100%)",
        }}
      />

      {/* ── Nav bar ───────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-5 sm:px-8 md:px-12 py-5">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, rgba(59,130,246,0.3) 0%, rgba(168,85,247,0.2) 100%)",
              border: "1px solid rgba(59,130,246,0.4)",
            }}
          >
            <ShieldCheck size={16} style={{ color: "#93c5fd" }} />
          </div>
          <span
            className="text-base font-bold tracking-tight"
            style={{ fontFamily: "Syne, sans-serif", color: "#E4EEFF", letterSpacing: "-0.02em" }}
          >
            Cyber Sentinel
          </span>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to={ROUTES.LOGIN}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            style={{ color: "#94a3b8" }}
          >
            Sign in
          </Link>
          <Link
            to={ROUTES.REGISTER}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-all"
            style={{
              background: "rgba(59,130,246,0.15)",
              border: "1px solid rgba(59,130,246,0.3)",
              color: "#93c5fd",
            }}
          >
            Register
          </Link>
        </div>
      </nav>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-5 sm:px-8 md:px-12 py-16 sm:py-24 text-center">

        {/* Badge */}
        <motion.div {...fade(0.05)} className="mb-6">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.2em] font-semibold px-3 py-1.5 rounded-full"
            style={{
              background: "rgba(59,130,246,0.08)",
              border: "1px solid rgba(59,130,246,0.2)",
              color: "#60a5fa",
            }}
          >
            <Terminal size={10} />
            Smart City &amp; Cybersecurity Lab · ITS
          </span>
        </motion.div>

        {/* Headline */}
        <motion.h1
          {...fade(0.1)}
          className="text-4xl sm:text-5xl md:text-6xl font-bold max-w-3xl leading-[1.08] tracking-tight"
          style={{ fontFamily: "Syne, sans-serif", color: "#E4EEFF", letterSpacing: "-0.03em" }}
        >
          Unified Security
          <br />
          <span style={{ color: "#3b82f6" }}>Assessment Platform</span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          {...fade(0.18)}
          className="mt-5 text-base sm:text-lg max-w-xl leading-relaxed"
          style={{ color: "#64748b" }}
        >
          Automated pentesting, AI-powered SOC monitoring, and real-time
          threat analysis — purpose-built for web security education.
        </motion.p>

        {/* CTAs */}
        <motion.div {...fade(0.26)} className="flex flex-col sm:flex-row items-center gap-3 mt-9">
          <Link
            to={ROUTES.LOGIN}
            className="inline-flex items-center gap-2 text-sm font-semibold px-6 py-3 rounded-xl transition-all w-full sm:w-auto justify-center"
            style={{
              background: "linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)",
              color: "#fff",
              boxShadow: "0 0 24px rgba(59,130,246,0.35), 0 4px 12px rgba(0,0,0,0.4)",
            }}
          >
            Sign in to dashboard
            <ArrowRight size={14} />
          </Link>
          <Link
            to={ROUTES.REGISTER}
            className="inline-flex items-center gap-2 text-sm font-medium px-6 py-3 rounded-xl transition-all w-full sm:w-auto justify-center"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#94a3b8",
            }}
          >
            Create an account
          </Link>
        </motion.div>

        {/* ── Feature grid ────────────────────────────────────────────── */}
        <motion.div
          {...fade(0.34)}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-16 w-full max-w-5xl"
        >
          {FEATURES.map(({ icon: Icon, title, body, color }) => (
            <div
              key={title}
              className="rounded-xl p-5 text-left"
              style={{
                background: "rgba(6,9,26,0.7)",
                border: "1px solid rgba(255,255,255,0.06)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                style={{
                  background: `${color}14`,
                  border: `1px solid ${color}30`,
                }}
              >
                <Icon size={15} style={{ color }} />
              </div>
              <h3
                className="text-sm font-semibold mb-1.5"
                style={{ fontFamily: "Syne, sans-serif", color: "#c8d8f0" }}
              >
                {title}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "#475569" }}>
                {body}
              </p>
            </div>
          ))}
        </motion.div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer className="relative z-10 text-center py-6 px-5">
        <p
          className="text-[10px] uppercase tracking-[0.2em] font-medium"
          style={{ color: "#1e3a5f" }}
        >
          Smart City &amp; Cybersecurity Lab · ITS · v1.0
        </p>
      </footer>
    </div>
  );
}
