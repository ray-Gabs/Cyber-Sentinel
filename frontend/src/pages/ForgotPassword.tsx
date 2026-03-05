import { useState } from "react";
import { Link } from "react-router-dom";
import { ROUTES } from "@/lib/constants";
import { forgotPassword } from "@/services/authService";
import { AuthShell } from "@/components/layout/AuthShell";
import { Btn, Icon } from "@/components/ui";

export default function ForgotPassword() {
  const [email,   setEmail]   = useState("");
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await forgotPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      setError(
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Something went wrong. Try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title="Reset password" sub="Enter your email and we'll send a reset link.">
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
            Reset link sent — check your inbox.
          </div>
          <Link to={ROUTES.LOGIN}>
            <Btn size="lg" icon="arrowL" style={{ width: "100%" }}>Back to sign in</Btn>
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

          <div style={{ marginBottom: 18 }}>
            <label className="field-label">Email address</label>
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

          <Btn variant="primary" size="lg" type="submit" disabled={loading}
            iconRight={loading ? undefined : "arrowR"} style={{ width: "100%" }}>
            {loading ? "Sending…" : "Send reset link"}
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
