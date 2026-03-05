import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ROUTES } from "@/lib/constants";
import { resetPassword } from "@/services/authService";
import { AuthShell } from "@/components/layout/AuthShell";
import { Btn, Icon } from "@/components/ui";

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword,    setShowPassword]    = useState(false);
  const [error,           setError]           = useState("");
  const [success,         setSuccess]         = useState(false);
  const [loading,         setLoading]         = useState(false);

  const confirmTouched = confirmPassword.length > 0;
  const passwordsMatch = password === confirmPassword;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    if (!token) { setError("Invalid reset link. Please request a new one."); return; }
    setLoading(true);
    try {
      await resetPassword(token, password);
      setSuccess(true);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Failed to reset password. The link may have expired.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="New password" sub="Choose a strong password for your account.">
      {success ? (
        <div>
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px 14px", marginBottom: 20, borderRadius: "var(--r-md)",
            background: "oklch(from var(--sev-low) l c h / 0.12)",
            border: "1px solid oklch(from var(--sev-low) l c h / 0.3)",
            color: "var(--sev-low)", fontSize: 13,
          }}>
            <Icon name="check" size={14} />
            Password reset — you can now sign in.
          </div>
          <Link to={ROUTES.LOGIN}>
            <Btn variant="primary" size="lg" style={{ width: "100%" }}>Sign in</Btn>
          </Link>
        </div>
      ) : (
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
            <label className="field-label">New password</label>
            <div style={{ position: "relative" }}>
              <Icon name="lock" size={14} style={{ position: "absolute", left: 11, top: 10, color: "var(--text-4)" }} />
              <input
                className="input"
                type={showPassword ? "text" : "password"}
                style={{ paddingLeft: 32, paddingRight: 36 }}
                placeholder="Min 8 characters"
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
            <input
              className="input"
              type="password"
              placeholder="Re-enter password"
              style={confirmTouched ? {
                borderColor: passwordsMatch
                  ? "oklch(from var(--sev-low) l c h / 0.5)"
                  : "oklch(from var(--sev-critical) l c h / 0.5)",
              } : undefined}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>

          <Btn variant="primary" size="lg" type="submit"
            disabled={loading || (confirmTouched && !passwordsMatch)}
            iconRight={loading ? undefined : "arrowR"}
            style={{ width: "100%" }}>
            {loading ? "Saving…" : "Set new password"}
          </Btn>

          <p style={{ textAlign: "center", marginTop: 22, fontSize: 12, color: "var(--text-3)" }}>
            <Link to={ROUTES.LOGIN} style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
              ← Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
