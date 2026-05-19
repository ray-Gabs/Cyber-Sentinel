import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { ROUTES } from "@/lib/constants";
import { AuthShell } from "@/components/layout/AuthShell";
import { Btn, Icon } from "@/components/ui";

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
  const navigate = useNavigate();

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

  const USERNAME_RE = /^[A-Za-z0-9_.-]+$/;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedUsername = username.trim();
    const trimmedEmail    = email.trim().toLowerCase();

    if (!USERNAME_RE.test(trimmedUsername)) {
      setError("Username may only contain letters, numbers, underscores, dots, and hyphens.");
      return;
    }
    if (!passwordsMatch) { setError("Passwords do not match."); return; }
    setError("");
    setLoading(true);
    try {
      await register({ username: trimmedUsername, email: trimmedEmail, password });
      navigate("/login", { state: { registered: true } });
    } catch (err: unknown) {
      const httpErr = err as { response?: { data?: { detail?: string | { msg: string }[] } }; request?: unknown };
      if (!httpErr?.response && httpErr?.request) {
        setError("Unable to reach the server. Check your connection and try again.");
      } else {
        const detail = httpErr?.response?.data?.detail;
        setError(
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((d) => d.msg).join(", ")
              : "Registration failed. Try a different username or email.",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Create account" sub="Fill in the details below to get started.">
      <form onSubmit={handleSubmit}>

        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "10px 14px", marginBottom: 16, borderRadius: "var(--r-md)",
            background: "oklch(from var(--sev-critical) l c h / 0.10)",
            border: "1px solid oklch(from var(--sev-critical) l c h / 0.25)",
            color: "var(--sev-critical)", fontSize: 13,
          }}>
            <Icon name="alert" size={14} />
            {error}
          </div>
        )}

        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Username</label>
          <input
            className="input"
            placeholder="e.g. jdoe"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            maxLength={32}
            required
          />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Email</label>
          <div style={{ position: "relative" }}>
            <Icon name="mail" size={14} style={{ position: "absolute", left: 11, top: 10, color: "var(--text-4)" }} />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              type="email"
              placeholder="you@its.ac.id"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label className="field-label">Password</label>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              placeholder="Min 8 characters"
              style={{ paddingRight: 36 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: 8, top: 7, background: "none", border: 0,
                color: "var(--text-3)", cursor: "pointer", padding: 4 }}>
              <Icon name={showPassword ? "eyeOff" : "eye"} size={14} />
            </button>
          </div>
          {password.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{
                    flex: 1, height: 3, borderRadius: 2,
                    background: i <= strength.level ? strength.color : "var(--surface-2)",
                    transition: "background 200ms",
                  }} />
                ))}
              </div>
              <div className="mono" style={{ fontSize: 10, color: strength.color, marginTop: 6, letterSpacing: "0.04em" }}>
                {strength.label.toUpperCase()}
              </div>
            </>
          )}
        </div>

        <div style={{ marginBottom: 18 }}>
          <div className="between" style={{ marginBottom: 6 }}>
            <label className="field-label" style={{ margin: 0 }}>Confirm password</label>
            {confirmTouched && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11,
                color: passwordsMatch ? "var(--sev-low)" : "var(--sev-critical)" }}>
                <Icon name={passwordsMatch ? "check" : "x"} size={11} />
                {passwordsMatch ? "Match" : "No match"}
              </span>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Re-enter password"
              style={{
                paddingRight: 36,
                ...(confirmTouched ? {
                  borderColor: passwordsMatch
                    ? "oklch(from var(--sev-low) l c h / 0.5)"
                    : "oklch(from var(--sev-critical) l c h / 0.5)",
                } : {}),
              }}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
            <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              style={{ position: "absolute", right: 8, top: 7, background: "none", border: 0,
                color: "var(--text-3)", cursor: "pointer", padding: 4 }}>
              <Icon name={showConfirmPassword ? "eyeOff" : "eye"} size={14} />
            </button>
          </div>
        </div>

        <Btn
          variant="primary"
          size="lg"
          type="submit"
          disabled={loading || (confirmTouched && !passwordsMatch)}
          iconRight={loading ? undefined : "arrowR"}
          style={{ width: "100%" }}
        >
          {loading ? "Creating account…" : "Create account"}
        </Btn>

        <p style={{ textAlign: "center", marginTop: 22, fontSize: 12, color: "var(--text-3)" }}>
          Already have an account?{" "}
          <Link to={ROUTES.LOGIN} style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
