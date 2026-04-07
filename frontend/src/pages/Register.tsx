/**
 * Register — full-screen parallax auth.
 * Same atmospheric background as Login.
 * Glassy form card with confirm password, strength indicator.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/providers/ThemeProvider";
import {
  ShieldCheck, UserPlus, AlertCircle, Eye, EyeOff,
  Lock, Mail, User, Sun, Moon, Check, X,
} from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { DottedBackground } from "@/components/ui/DottedBackground";
import { AnimatedGridPattern } from "@/components/ui/AnimatedGridPattern";
import { cn } from "@/lib/utils";

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] as const } },
};

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

function getPasswordStrength(pwd: string): { level: number; label: string; color: string } {
  if (!pwd) return { level: 0, label: "", color: "" };
  let score = 0;
  if (pwd.length >= 8)           score++;
  if (pwd.length >= 12)          score++;
  if (/[A-Z]/.test(pwd))         score++;
  if (/[0-9]/.test(pwd))         score++;
  if (/[^A-Za-z0-9]/.test(pwd))  score++;
  if (score <= 1) return { level: 1, label: "Weak",   color: "var(--sev-critical)" };
  if (score <= 2) return { level: 2, label: "Fair",   color: "var(--sev-medium)"   };
  if (score <= 3) return { level: 3, label: "Good",   color: "#84cc16"             };
  return              { level: 4, label: "Strong", color: "var(--sev-low)"      };
}

export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  const [username,            setUsername]            = useState("");
  const [email,               setEmail]               = useState("");
  const [password,            setPassword]            = useState("");
  const [confirmPassword,     setConfirmPassword]     = useState("");
  const [showPassword,        setShowPassword]        = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error,               setError]               = useState("");
  const [loading,             setLoading]             = useState(false);

  const strength       = getPasswordStrength(password);
  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = password === confirmPassword;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!passwordsMatch) { setError("Passwords do not match."); return; }
    setError("");
    setLoading(true);
    try {
      await register({ username, email, password });
      navigate(ROUTES.LOGIN, { state: { registered: true } });
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Registration failed. Try a different username.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ backgroundColor: isDark ? "#06091A" : "var(--bg-base)" }}
    >
      {/* ── Dark mode background layers ───────────────────────────── */}
      {isDark && (
        <>
          <DottedBackground isDark className="opacity-60" />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{ color: "rgba(59,130,246,0.16)" }}
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
              background: "radial-gradient(ellipse 65% 55% at 50% 50%, rgba(59,130,246,0.09) 0%, transparent 65%)",
            }}
          />

          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 35%, rgba(2,8,23,0.82) 100%)",
            }}
          />
        </>
      )}

      {/* ── Light mode gradient background ────────────────────────── */}
      {!isDark && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(160deg, #f0f4ff 0%, #e8efff 40%, #f5f0ff 100%)",
          }}
        />
      )}

      {/* ── Theme toggle ─────────────────────────────────────────── */}
      <button
        onClick={toggleTheme}
        className="absolute top-5 right-5 btn-ghost rounded-full p-2 z-20"
        title={isDark ? "Light mode" : "Dark mode"}
      >
        {isDark
          ? <Sun  size={15} style={{ color: "rgba(96,120,152,0.9)" }} />
          : <Moon size={15} style={{ color: "rgba(96,120,152,0.9)" }} />
        }
      </button>

      {/* ── Main content ─────────────────────────────────────────── */}
      <motion.div
        className="relative z-10 w-full max-w-[420px] px-5 py-10 flex flex-col items-center"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {/* Logo + wordmark above card */}
        <motion.div className="text-center mb-7" variants={itemVariants}>
          <motion.div
            className="flex justify-center mb-4"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{
                background: "linear-gradient(135deg, rgba(59,130,246,0.35) 0%, rgba(168,85,247,0.22) 100%)",
                border: "1px solid rgba(59,130,246,0.45)",
                boxShadow: "0 0 40px rgba(59,130,246,0.28), 0 0 12px rgba(59,130,246,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <ShieldCheck size={28} style={{ color: "#93c5fd" }} />
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
            style={{ color: "#60a5fa", opacity: 0.65 }}
          >
            v1.0 · ITS Lab
          </p>
        </motion.div>

        {/* ── Glass card ───────────────────────────────────────────── */}
        <motion.div
          variants={itemVariants}
          className="w-full rounded-2xl p-7 space-y-4"
          style={{
            backgroundColor: isDark ? "rgba(6,9,26,0.82)" : "var(--bg-card)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            border: "1px solid rgba(59,130,246,0.18)",
            boxShadow: isDark
              ? "0 0 0 1px rgba(59,130,246,0.06), 0 32px 72px rgba(0,0,0,0.70), 0 0 80px rgba(59,130,246,0.05)"
              : "0 0 0 1px rgba(59,130,246,0.10), 0 8px 32px rgba(0,0,0,0.08)",
          }}
        >
          {/* Heading */}
          <div>
            <h2
              className="text-xl font-bold"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.015em" }}
            >
              Create account
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              Fill in the details below to get started
            </p>
          </div>

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

            {/* Username */}
            <div>
              <label htmlFor="username" className="label">Username</label>
              <div className="relative">
                <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-subtle)" }} />
                <input
                  id="username" type="text" className="input pl-9"
                  placeholder="Choose a username"
                  value={username} onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username" required
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="label">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-subtle)" }} />
                <input
                  id="email" type="email" className="input pl-9"
                  placeholder="you@example.com"
                  value={email} onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email" required
                />
              </div>
            </div>

            {/* Password + strength */}
            <div>
              <label htmlFor="password" className="label">Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-subtle)" }} />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="input pl-9 pr-10"
                  placeholder="Min 8 characters"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password" required minLength={8}
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
              {password.length > 0 && (
                <div className="mt-2">
                  <div className="flex gap-1 mb-1">
                    {[1, 2, 3, 4].map((level) => (
                      <div
                        key={level}
                        className="h-1 flex-1 rounded-full transition-all duration-300"
                        style={{ backgroundColor: level <= strength.level ? strength.color : "var(--border-muted)" }}
                      />
                    ))}
                  </div>
                  <p className="text-[11px] font-medium" style={{ color: strength.color }}>
                    {strength.label}
                  </p>
                </div>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="confirm-password" className="label" style={{ marginBottom: 0 }}>
                  Confirm Password
                </label>
                {confirmTouched && (
                  <span className="flex items-center gap-1 text-[11px] font-medium">
                    {passwordsMatch
                      ? <><Check size={11} style={{ color: "var(--sev-low)" }} /><span style={{ color: "var(--sev-low-text)" }}>Match</span></>
                      : <><X     size={11} style={{ color: "var(--sev-critical)" }} /><span style={{ color: "var(--sev-critical-text)" }}>No match</span></>
                    }
                  </span>
                )}
              </div>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-subtle)" }} />
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  className="input pl-9 pr-10"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  style={confirmTouched ? {
                    borderColor: passwordsMatch ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)",
                    boxShadow:   passwordsMatch
                      ? "0 0 0 3px rgba(34,197,94,0.07)"
                      : "0 0 0 3px rgba(239,68,68,0.07)",
                  } : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "var(--text-subtle)" }}
                  tabIndex={-1}
                >
                  {showConfirmPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || (confirmTouched && !passwordsMatch)}
              className="btn-primary w-full"
            >
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
                  <UserPlus size={14} />
                  Create account
                </>
              )}
            </button>
          </form>

          {/* Link to login */}
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
        </motion.div>

        {/* Footer */}
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
