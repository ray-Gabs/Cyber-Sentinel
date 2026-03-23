/**
 * Register page — form for creating a new account.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { Shield, UserPlus, AlertCircle, Sun, Moon } from "lucide-react";
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

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register({ username, email, password });
      navigate(ROUTES.DASHBOARD);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Registration failed. Try a different username.";
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

      {/* ── Central radial glow ── */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full blur-[120px] pointer-events-none"
        style={{ backgroundColor: isDark ? "rgba(59,130,246,0.06)" : "rgba(37,99,235,0.06)" }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" as const }}
      />

      {/* ── Vignette ── */}
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

      {/* ── Register card ── */}
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
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" as const }}
          >
            <div
              className="absolute inset-0 rounded-2xl rotate-6 opacity-50"
              style={{ backgroundColor: "var(--accent-dim)" }}
            />
            <div
              className="absolute inset-0 rounded-2xl -rotate-6 opacity-30"
              style={{ backgroundColor: "var(--accent-dim)" }}
            />
            <div
              className="relative rounded-2xl w-full h-full flex items-center justify-center border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--accent)",
                borderWidth: "1.5px",
                boxShadow: "0 0 24px var(--accent-glow)",
              }}
            >
              <Shield size={28} style={{ color: "var(--accent)" }} />
            </div>
          </motion.div>

          <h1
            className="mt-5 text-3xl font-bold tracking-tight"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
          >
            Cyber Sentinel
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
            Create your account
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
              Register
            </h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Fill in the details below to get started
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
            <input
              id="username"
              type="text"
              className="input"
              placeholder="Choose a username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label htmlFor="email" className="label">Email</label>
            <input
              id="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="Min 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating account...
              </>
            ) : (
              <>
                <UserPlus size={15} />
                Create account
              </>
            )}
          </button>

          <p className="text-center text-xs pt-1" style={{ color: "var(--text-muted)" }}>
            Already have an account?{" "}
            <Link
              to={ROUTES.LOGIN}
              className="hover:underline transition-opacity hover:opacity-80"
              style={{ color: "var(--accent)" }}
            >
              Sign in
            </Link>
          </p>
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
