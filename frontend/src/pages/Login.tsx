/**
 * Login — full-screen parallax auth.
 * DottedBackground + AnimatedGridPattern cover the entire viewport.
 * Cyber Sentinel logo floats above a glassy form card centered in the scene.
 */
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { getMe } from "@/services/authService";
import {
  ShieldCheck, LogIn, AlertCircle, Eye, EyeOff,
  Lock, User, CheckCircle2,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { DottedBackground } from "@/components/ui/DottedBackground";
import { AnimatedGridPattern } from "@/components/ui/AnimatedGridPattern";
import { Beams } from "@/components/ui/reactbits/Beams";
import { cn } from "@/lib/utils";

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

export default function Login() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  const justRegistered = (location.state as { registered?: boolean } | null)?.registered ?? false;

  const [identifier,   setIdentifier]   = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ identifier, password });
      // Redirect based on role — fetch me after token is stored
      try {
        const me = await getMe();
        navigate(me.role === "admin" ? "/admin" : ROUTES.DASHBOARD, { replace: true });
      } catch {
        navigate(ROUTES.DASHBOARD, { replace: true });
      }
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string }; status?: number } })?.response?.data?.detail ?? "";
      const httpStatus =
        (err as { response?: { status?: number } })?.response?.status;
      if (httpStatus === 403 && detail.toLowerCase().includes("pending")) {
        setError("Your account is pending admin approval.");
      } else if (httpStatus === 403 && detail.toLowerCase().includes("suspended")) {
        setError("Your account has been suspended. Contact an administrator.");
      } else {
        setError(detail || "Login failed. Check your credentials.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      {/* ── Background layers ─────────────────────────────────────── */}
      <DottedBackground isDark={true} className="opacity-60" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ color: "rgba(0,212,255,0.12)" }}
      >
        <AnimatedGridPattern
          width={52}
          height={52}
          numSquares={24}
          maxOpacity={0.75}
          duration={4.5}
          repeatDelay={0.6}
          className={cn(
            "[mask-image:radial-gradient(ellipse_85%_85%_at_50%_50%,white,transparent)]",
            "stroke-current fill-current w-full h-full absolute inset-0",
          )}
        />
      </div>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(0,212,255,0.07) 0%, transparent 65%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 35%, rgba(8,12,16,0.82) 100%)",
        }}
      />
      <Beams count={5} opacity={0.8} className="z-[1]" />

      {/* ── Back to home ──────────────────────────────────────────── */}
      <Link
        to="/"
        className="absolute top-5 left-5 btn-ghost rounded-lg px-3 py-1.5 z-20 text-xs flex items-center gap-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        ← Home
      </Link>

      {/* ── Main content — centered, above all layers ────────────── */}
      <motion.div
        className="relative z-10 w-full max-w-[400px] px-5 py-10 flex flex-col items-center"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Logo + wordmark — floats on the parallax, above the card */}
        <motion.div className="text-center mb-7" variants={itemVariants}>
          <motion.div
            className="flex justify-center mb-4"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center relative"
              style={{
                background: "linear-gradient(135deg, rgba(0,212,255,0.25) 0%, rgba(168,85,247,0.18) 100%)",
                border: "1px solid rgba(0,212,255,0.35)",
                boxShadow: "0 0 40px rgba(0,212,255,0.20), 0 0 12px rgba(0,212,255,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <ShieldCheck size={28} style={{ color: "var(--accent)" }} />
            </div>
          </motion.div>

          <h1
            className="text-2xl font-bold tracking-tight"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.025em" }}
          >
            Cyber Sentinel
          </h1>
          <p
            className="text-[10px] uppercase tracking-[0.22em] font-semibold mt-1.5"
            style={{ color: "var(--accent)", opacity: 0.65 }}
          >
            v1.0 · ITS Lab
          </p>
        </motion.div>

        {/* ── Glass card ───────────────────────────────────────────── */}
        <motion.div
          variants={itemVariants}
          className="w-full rounded-2xl p-7 space-y-5"
          style={{
            backgroundColor: "rgba(14,21,32,0.85)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(0,212,255,0.14)",
            boxShadow: "0 0 0 1px rgba(0,212,255,0.05), 0 32px 72px rgba(0,0,0,0.70), 0 0 80px rgba(0,212,255,0.04)",
          }}
        >
          {/* Heading */}
          <div>
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.015em" }}
            >
              Welcome back
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              Sign in to access your dashboard
            </p>
          </div>

          {/* Registration success banner */}
          {justRegistered && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
              style={{
                backgroundColor: "rgba(34,197,94,0.08)",
                border: "1px solid rgba(34,197,94,0.22)",
                color: "#4ade80",
              }}
            >
              <CheckCircle2 size={14} className="shrink-0" />
              Account created — sign in to continue
            </motion.div>
          )}

          {/* Error */}
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
              style={{
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#f87171",
              }}
            >
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </motion.div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="label">Username or Email</label>
              <div className="relative">
                <User
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-subtle)" }}
                />
                <input
                  id="identifier"
                  type="text"
                  className="input pl-9"
                  placeholder="Enter your username or email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <Lock
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-subtle)" }}
                />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input pl-9 pr-10"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--text-subtle)" }}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn size={14} />
                  Sign in
                </>
              )}
            </button>
          </form>

          {/* Links */}
          <div className="flex items-center justify-between text-xs pt-1" style={{ color: "var(--text-muted)" }}>
            <Link
              to={ROUTES.FORGOT_PASSWORD}
              className="hover:underline transition-opacity hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              Forgot password?
            </Link>
            <Link
              to={ROUTES.REGISTER}
              className="hover:underline transition-opacity hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              Create account
            </Link>
          </div>
        </motion.div>

        {/* Footer below card */}
        <motion.p
          variants={itemVariants}
          className="text-[10px] uppercase tracking-[0.18em] font-medium mt-6"
          style={{ color: "var(--text-subtle)" }}
        >
          Smart City &amp; Cybersecurity Lab · ITS
        </motion.p>
      </motion.div>
    </div>
  );
}
