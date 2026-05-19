import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getMe } from "@/services/authService";
import { ROUTES } from "@/lib/constants";
import { AuthShell } from "@/components/layout/AuthShell";
import { Btn, Icon } from "@/components/ui";

export default function Login() {
  const { login }  = useAuth();
  const navigate   = useNavigate();
  const location   = useLocation();

  const justRegistered = (location.state as { registered?: boolean } | null)?.registered ?? false;

  const [identifier,   setIdentifier]   = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember,     setRemember]     = useState(false);
  const [error,        setError]        = useState("");
  const [loading,      setLoading]      = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login({ identifier, password });
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
        setError("Your account is pending admin approval. Please wait — an admin will activate your account.");
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
    <AuthShell title="Welcome back" sub="Sign in to access your dashboard.">
      <form onSubmit={handleSubmit}>

        {justRegistered && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 8,
            padding: "10px 14px", marginBottom: 16, borderRadius: "var(--r-md)",
            background: "oklch(from var(--sev-low) l c h / 0.12)",
            border: "1px solid oklch(from var(--sev-low) l c h / 0.3)",
            color: "var(--sev-low)", fontSize: 13,
          }}>
            <Icon name="check" size={14} style={{ marginTop: 1, flexShrink: 0 }} />
            <span>
              Account created! <strong>Your account is pending admin approval.</strong>{" "}
              An admin will review your request — you'll receive access once approved.
            </span>
          </div>
        )}

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
          <label className="field-label">Username or email</label>
          <div style={{ position: "relative" }}>
            <Icon name="user" size={14} style={{ position: "absolute", left: 11, top: 10, color: "var(--text-4)" }} />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Username or email"
              autoComplete="username"
              required
            />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div className="between" style={{ marginBottom: 6 }}>
            <label className="field-label" style={{ margin: 0 }}>Password</label>
            <Link to={ROUTES.FORGOT_PASSWORD} style={{ color: "var(--accent)", fontSize: 11, textDecoration: "none" }}>
              Forgot?
            </Link>
          </div>
          <div style={{ position: "relative" }}>
            <Icon name="lock" size={14} style={{ position: "absolute", left: 11, top: 10, color: "var(--text-4)" }} />
            <input
              className="input"
              type={showPassword ? "text" : "password"}
              style={{ paddingLeft: 32, paddingRight: 36 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={{ position: "absolute", right: 8, top: 7, background: "none", border: 0,
                color: "var(--text-3)", cursor: "pointer", padding: 4 }}
            >
              <Icon name={showPassword ? "eyeOff" : "eye"} size={14} />
            </button>
          </div>
        </div>

        <label className="row" style={{ gap: 8, fontSize: 12, color: "var(--text-2)", marginBottom: 18, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          Keep me signed in for 14 days
        </label>

        <Btn
          variant="primary"
          size="lg"
          type="submit"
          disabled={loading}
          iconRight={loading ? undefined : "arrowR"}
          style={{ width: "100%" }}
        >
          {loading ? "Signing in…" : "Sign in"}
        </Btn>

        <p style={{ textAlign: "center", marginTop: 22, fontSize: 12, color: "var(--text-3)" }}>
          Don't have an account?{" "}
          <Link to={ROUTES.REGISTER} style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
            Create account
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
