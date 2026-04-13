/**
 * Onboarding.tsx — First-time setup screen for new non-demo users.
 * Shows when: is_demo === false AND no onboarding_complete in localStorage.
 * Route: /onboarding
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "onboarding_complete";

export default function Onboarding() {
  const navigate        = useNavigate();
  const { user, loading } = useAuth();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (loading) return;

    // Demo users skip onboarding
    if (!user || (user as { is_demo?: boolean }).is_demo) {
      navigate("/dashboard", { replace: true });
      return;
    }
    // Already completed
    if (localStorage.getItem(STORAGE_KEY)) {
      navigate("/dashboard", { replace: true });
      return;
    }
    setChecking(false);
  }, [user, loading, navigate]);

  function complete() {
    localStorage.setItem(STORAGE_KEY, "true");
    navigate("/projects", { replace: true });
  }

  function skip() {
    localStorage.setItem(STORAGE_KEY, "true");
    navigate("/dashboard", { replace: true });
  }

  if (loading || checking) return null;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg-base)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        backgroundImage: `repeating-linear-gradient(
          45deg,
          rgba(255,255,255,0.015) 0px,
          rgba(255,255,255,0.015) 1px,
          transparent 1px,
          transparent 40px
        )`,
      }}
    >
      {/* Center card */}
      <div
        style={{
          width: "560px",
          maxWidth: "90vw",
          background: "var(--bg-surface)",
          border: "1px solid var(--border-muted)",
          borderRadius: "10px",
          padding: "40px 48px",
        }}
      >
        {/* Checkmark circle */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "8px" }}>
          <div
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              background: "var(--accent-dim)",
              border: "1px solid var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px",
            }}
          >
            <span style={{ color: "var(--accent)", fontSize: "18px", fontWeight: 700 }}>✓</span>
          </div>

          <h1
            style={{
              fontFamily: "Sora, Syne, sans-serif",
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--text-base)",
              margin: 0,
              textAlign: "center",
            }}
          >
            Your account is ready.
          </h1>
          <p
            style={{
              fontFamily: "IBM Plex Sans, sans-serif",
              fontSize: "14px",
              color: "var(--text-muted)",
              marginTop: "6px",
              textAlign: "center",
            }}
          >
            Set up SOC monitoring for your projects.
          </p>
        </div>

        {/* Divider */}
        <div style={{ borderTop: "1px solid var(--border)", margin: "24px 0" }} />

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {[
            { num: "1", text: "Create a project and enter your target URL" },
            { num: "2", text: "Download your Wazuh agent compose file" },
            {
              num: "3",
              text: "Run this command on your server:",
              code: "docker compose up -d",
            },
            { num: "4", text: "Your dashboard activates automatically once the agent connects" },
          ].map(({ num, text, code }) => (
            <div key={num} style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
              {/* Number circle */}
              <div
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: "11px",
                  color: "var(--text-muted)",
                }}
              >
                {num}
              </div>

              <div style={{ flex: 1 }}>
                <p style={{ fontFamily: "IBM Plex Sans, sans-serif", fontSize: "14px", color: "var(--text-base)", margin: 0 }}>
                  {text}
                </p>
                {code && (
                  <div
                    style={{
                      marginTop: "8px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      padding: "6px 12px",
                      fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
                      fontSize: "13px",
                      color: "var(--accent)",
                    }}
                  >
                    {code}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Button row */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "32px" }}>
          <button onClick={skip} className="btn-ghost" style={{ fontSize: "14px" }}>
            Skip for now
          </button>
          <button onClick={complete} className="btn-primary" style={{ fontSize: "14px" }}>
            Create My First Project →
          </button>
        </div>
      </div>
    </div>
  );
}
