/**
 * Login page — animated cybersecurity-themed sign-in.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { ShieldCheck, LogIn, AlertCircle, Eye, EyeOff, Lock, User, Sun, Moon } from "lucide-react";
import { ROUTES } from "@/lib/constants";

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

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
      {/* Animated background grid */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: isDark
            ? "linear-gradient(rgba(14,165,233,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(14,165,233,0.06) 1px, transparent 1px)"
            : "linear-gradient(rgba(2,132,199,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(2,132,199,0.06) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Radial glow */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] rounded-full blur-3xl pointer-events-none"
        style={{ backgroundColor: isDark ? "rgba(14,165,233,0.04)" : "rgba(2,132,199,0.05)" }}
        animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Theme toggle in corner */}
      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 btn-ghost rounded-full p-2"
        title={isDark ? "Light mode" : "Dark mode"}
      >
        {isDark ? <Sun size={16} style={{ color: "var(--text-muted)" }} /> : <Moon size={16} style={{ color: "var(--text-muted)" }} />}
      </button>

      <motion.div
        className="relative w-full max-w-md"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Logo */}
        <motion.div className="text-center mb-8" variants={itemVariants}>
          <motion.div
            className="relative mx-auto w-16 h-16 flex items-center justify-center"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <div
              className="absolute inset-0 rounded-2xl rotate-6 opacity-60"
              style={{ backgroundColor: "var(--accent-dim)" }}
            />
            <div
              className="absolute inset-0 rounded-2xl -rotate-6 opacity-40"
              style={{ backgroundColor: "var(--accent-dim)" }}
            />
            <div
              className="relative rounded-2xl w-full h-full flex items-center justify-center border"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--accent)",
                borderWidth: "1.5px",
              }}
            >
              <ShieldCheck size={28} style={{ color: "var(--accent)" }} />
            </div>
          </motion.div>

          <h1
            className="mt-5 text-3xl font-bold tracking-tight"
            style={{ fontFamily: "Space Grotesk, sans-serif", color: "var(--text-base)" }}
          >
            Cyber Sentinel
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
            AI-Powered Pentesting &amp; SOC Platform
          </p>
        </motion.div>

        {/* Card */}
        <motion.form
          onSubmit={handleSubmit}
          className="card space-y-5"
          variants={itemVariants}
          style={{ boxShadow: isDark ? "0 25px 60px rgba(0,0,0,0.5)" : "0 8px 30px rgba(0,0,0,0.08)" }}
        >
          <div>
            <h2
              className="text-lg font-semibold"
              style={{ fontFamily: "Space Grotesk, sans-serif", color: "var(--text-base)" }}
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

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full mt-2"
          >
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
