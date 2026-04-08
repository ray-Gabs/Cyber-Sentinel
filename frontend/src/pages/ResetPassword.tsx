/**
 * ResetPassword page — user sets a new password using the token from the reset email.
 */
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { useTheme } from "@/providers/ThemeProvider";
import { Shield, Lock, Eye, EyeOff, AlertCircle, CheckCircle, Sun, Moon } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { resetPassword } from "@/services/authService";
import { DottedBackground } from "@/components/ui/DottedBackground";

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const { isDark, toggleTheme } = useTheme();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!token) {
      setError("Invalid reset link. Please request a new one.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Failed to reset password. The link may have expired.";
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

      {/* ── Content ── */}
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
            Reset Password
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
            Choose a new password for your account.
          </p>
        </motion.div>

        {success ? (
          <motion.div
            className="card space-y-4"
            variants={itemVariants}
            style={{
              boxShadow: isDark
                ? "0 0 0 1px rgba(59,130,246,0.08), 0 32px 64px rgba(0,0,0,0.6)"
                : "0 0 0 1px rgba(37,99,235,0.08), 0 8px 32px rgba(0,0,0,0.08)",
            }}
          >
            <div
              className="flex items-center gap-3 rounded-lg px-4 py-4 text-sm"
              style={{
                backgroundColor: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.2)",
                color: "#4ade80",
              }}
            >
              <CheckCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Password updated!</p>
                <p className="text-xs mt-1 opacity-70">
                  Your password has been reset successfully. You can now sign in with your new password.
                </p>
              </div>
            </div>
            <Link to={ROUTES.LOGIN} className="btn-primary w-full">
              Sign in
            </Link>
          </motion.div>
        ) : (
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
                Set new password
              </h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                Must be at least 8 characters
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

            {!token && (
              <div
                className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm"
                style={{
                  backgroundColor: "rgba(234,179,8,0.1)",
                  border: "1px solid rgba(234,179,8,0.2)",
                  color: "#facc15",
                }}
              >
                <AlertCircle size={14} className="shrink-0" />
                No reset token found. Please use the link from your email or request a new one.
              </div>
            )}

            <div>
              <label htmlFor="password" className="label">New Password</label>
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
                  placeholder="Min 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
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

            <div>
              <label htmlFor="confirmPassword" className="label">Confirm Password</label>
              <div className="relative">
                <Lock
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--text-subtle)" }}
                />
                <input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  className="input pl-10"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <button type="submit" disabled={loading || !token} className="btn-primary w-full mt-2">
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Updating...
                </>
              ) : (
                "Reset Password"
              )}
            </button>

            <p className="text-center text-xs pt-1" style={{ color: "var(--text-muted)" }}>
              <Link
                to={ROUTES.LOGIN}
                className="hover:underline transition-opacity hover:opacity-80"
                style={{ color: "var(--accent)" }}
              >
                Back to Sign in
              </Link>
            </p>
          </motion.form>
        )}

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
