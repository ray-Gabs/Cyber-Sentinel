/**
 * Login page — animated cybersecurity-themed sign-in.
 * Background: DottedBackground canvas wave.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { ShieldCheck, LogIn, AlertCircle, Eye, EyeOff, Lock, User, Sun, Moon } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { DottedBackground } from "@/components/ui/DottedBackground";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ username, password });
      navigate(ROUTES.DASHBOARD);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        "Login failed. Check your credentials.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      {/* ── Dotted wave background ── */}
      <DottedBackground isDark={isDark} className="opacity-100" />

      {/* ── Central radial glow — gives depth behind the card ── */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none"
        style={{ backgroundColor: isDark ? "rgba(59,130,246,0.06)" : "rgba(37,99,235,0.06)" }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* ── Vignette — fades edges so card pops ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? "radial-gradient(ellipse 60% 60% at 50% 50%, transparent 40%, rgba(2,8,23,0.75) 100%)"
            : "radial-gradient(ellipse 60% 60% at 50% 50%, transparent 40%, rgba(242,246,255,0.75) 100%)",
        }}
      />

      {/* ── Theme toggle ── */}
      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 btn-ghost rounded-full p-2 z-10"
        title={isDark ? "Light mode" : "Dark mode"}
      >
        {isDark
          ? <Sun  size={16} style={{ color: "var(--text-muted)" }} />
          : <Moon size={16} style={{ color: "var(--text-muted)" }} />
        }
      </button>

      {/* ── Login card ── */}
      <motion.div
        className="relative w-full max-w-md z-10"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Logo */}
        <motion.div className="text-center mb-8" variants={itemVariants}>
          <motion.div
            className="relative mx-auto w-16 h-16 flex items-center justify-center"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            {/* Layered halo rings */}
            <div
              className="absolute inset-0 rounded-2xl rotate-6 opacity-50"
              style={{ backgroundColor: "var(--accent-dim)" }}
            />
            <div
              className="absolute inset-0 rounded-2xl -rotate-6 opacity-30"
              style={{ backgroundColor: "var(--accent-dim)" }}
            />
            {/* Icon container */}
            <div
              className="relative rounded-2xl w-full h-full flex items-center justify-center border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--accent)",
                borderWidth: "1.5px",
                boxShadow: "0 0 24px var(--accent-glow)",
              }}
            >
              <ShieldCheck size={28} style={{ color: "var(--accent)" }} />
            </div>
          </motion.div>

          <h1
            className="mt-5 text-3xl font-bold tracking-tight"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
          >
            Cyber Sentinel
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
            AI-Powered Pentesting &amp; SOC Platform
          </p>
        </motion.div>

        {/* Form card */}
        <motion.form
          onSubmit={handleSubmit}
          className="card space-y-5"
          variants={itemVariants}
          style={{
            boxShadow: isDark
              ? "0 0 0 1px rgba(59,130,246,0.08), 0 32px 64px rgba(0,0,0,0.6)"
              : "0 0 0 1px rgba(37,99,235,0.08), 0 8px 32px rgba(0,0,0,0.08)",
          }}
        >
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
            >
              Welcome back
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Sign in to access your dashboard
            </p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
              style={{
                backgroundColor: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.2)",
                color: "#f87171",
              }}
            >
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </motion.div>
          )}

          <div>
            <label htmlFor="username" className="label">Username</label>
            <div className="relative">
              <User
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-subtle)" }}
              />
              <input
                id="username"
                type="text"
                className="input pl-10"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <div className="relative">
              <Lock
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "var(--text-subtle)" }}
              />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="input pl-10 pr-10"
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
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
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
                <LogIn size={15} />
                Sign in
              </>
            )}
          </button>

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
        </motion.form>

        <motion.p
          variants={itemVariants}
          className="mt-6 text-center text-xs"
          style={{ color: "var(--text-subtle)" }}
        >
          Cyber Sentinel v1.0 &mdash; ITS Cybersecurity Lab
        </motion.p>
      </motion.div>
    </div>
  );
}
