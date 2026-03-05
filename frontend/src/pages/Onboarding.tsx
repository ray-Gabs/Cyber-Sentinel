/**
 * Onboarding.tsx — First-time setup screen for new non-demo users.
 * Shows when: is_demo === false AND no onboarding_complete in localStorage.
 * Auto-fetches the user's forwarder token so they can copy it immediately.
 * Route: /onboarding
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getWazuhToken, type WazuhTokenInfo } from "@/services/alertService";
import { Check, Copy, Key, Terminal, Wifi, LayoutDashboard } from "lucide-react";

const STORAGE_KEY = "onboarding_complete";

export default function Onboarding() {
  const navigate           = useNavigate();
  const { user, loading }  = useAuth();
  const [checking, setChecking]     = useState(true);
  const [tokenInfo, setTokenInfo]   = useState<WazuhTokenInfo | null>(null);
  const [copied, setCopied]         = useState<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || user.is_demo) {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (localStorage.getItem(STORAGE_KEY)) {
      navigate("/dashboard", { replace: true });
      return;
    }
    setChecking(false);
    getWazuhToken().then(setTokenInfo).catch(() => {});
  }, [user, loading, navigate]);

  function copyText(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function complete() {
    localStorage.setItem(STORAGE_KEY, "true");
    navigate("/projects", { replace: true });
  }

  function skip() {
    localStorage.setItem(STORAGE_KEY, "true");
    navigate("/dashboard", { replace: true });
  }

  if (loading || checking) return null;

  const forwarderBlock = tokenInfo
    ? [
        `export CYBER_SENTINEL_URL=http://<your-server-ip>:8000`,
        `export WAZUH_WEBHOOK_TOKEN=${tokenInfo.token}`,
        `export TENANT_GROUP=tenant_${user?.username ?? "myproject"}`,
        `export MIN_LEVEL=3`,
        `python3 wazuh_forwarder.py`,
      ].join("\n")
    : "Loading your token…";

  const steps = [
    {
      icon: Key,
      color: "#a855f7",
      title: "Your forwarder token",
      description: "This token is unique to your account. The Wazuh forwarder uses it to send your alerts — and only your alerts — to Cyber Sentinel.",
      content: tokenInfo ? (
        <div className="mt-2 space-y-2">
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
          >
            <span
              className="flex-1 text-xs font-mono truncate"
              style={{ color: "var(--text-base)" }}
            >
              {tokenInfo.token}
            </span>
            <button
              onClick={() => copyText(tokenInfo.token, "token")}
              className="shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors"
              style={{
                backgroundColor: copied === "token" ? "rgba(34,197,94,0.15)" : "var(--bg-surface)",
                color: copied === "token" ? "#4ade80" : "var(--text-muted)",
                border: "1px solid var(--border)",
              }}
            >
              <Copy size={11} />
              {copied === "token" ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
            You can rotate this token anytime in <strong style={{ color: "var(--text-muted)" }}>Settings → Forwarder Token</strong>.
          </p>
        </div>
      ) : (
        <div className="mt-2 h-9 rounded-lg animate-pulse" style={{ backgroundColor: "var(--bg-muted)" }} />
      ),
    },
    {
      icon: Terminal,
      color: "#00d4ff",
      title: "Run the forwarder on your Wazuh manager",
      description: "On the server where your Wazuh Manager is installed, run these commands. The forwarder tails Wazuh alerts and sends them to your account.",
      content: (
        <div className="mt-2 relative">
          <pre
            className="text-[11px] font-mono rounded-lg px-4 py-3 leading-relaxed overflow-x-auto"
            style={{
              backgroundColor: "var(--bg-muted)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            {forwarderBlock}
          </pre>
          <button
            onClick={() => copyText(forwarderBlock, "block")}
            className="absolute top-2 right-2 flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-colors"
            style={{
              backgroundColor: copied === "block" ? "rgba(34,197,94,0.15)" : "var(--bg-surface)",
              color: copied === "block" ? "#4ade80" : "var(--text-muted)",
              border: "1px solid var(--border)",
            }}
          >
            <Copy size={10} />
            {copied === "block" ? "Copied!" : "Copy all"}
          </button>
          <p className="text-[11px] mt-2" style={{ color: "var(--text-subtle)" }}>
            Replace <code style={{ color: "var(--accent)" }}>&lt;your-server-ip&gt;</code> with your Cyber Sentinel server's IP address.
          </p>
        </div>
      ),
    },
    {
      icon: Wifi,
      color: "#22C55E",
      title: "Connect your Wazuh agents",
      description: "Install the Wazuh agent on each target machine (e.g. DVWA, JuiceShop). Point them to your Wazuh Manager. Alerts flow automatically once the agent connects.",
      content: null,
    },
    {
      icon: LayoutDashboard,
      color: "#F59E0B",
      title: "Your SOC dashboard activates",
      description: "Once the forwarder is running and an agent sends its first alert, it appears in your Alerts feed — triaged by AI with severity, verdict, and MITRE mapping.",
      content: null,
    },
  ];

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
      <div
        style={{
          width: "600px",
          maxWidth: "92vw",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "40px 48px",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "8px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "50%",
              background: "var(--accent-dim)",
              border: "1px solid var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "16px",
            }}
          >
            <Check size={22} color="var(--accent)" strokeWidth={2.5} />
          </div>
          <h1
            style={{
              fontFamily: "Syne, sans-serif",
              fontSize: "22px",
              fontWeight: 700,
              color: "var(--text-base)",
              margin: 0,
              textAlign: "center",
            }}
          >
            Welcome, {user?.username}.
          </h1>
          <p
            style={{
              fontSize: "14px",
              color: "var(--text-muted)",
              marginTop: "6px",
              textAlign: "center",
            }}
          >
            Your account is ready. Here's how to connect your Wazuh setup.
          </p>
        </div>

        <div style={{ borderTop: "1px solid var(--border)", margin: "24px 0" }} />

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {steps.map(({ icon: Icon, color, title, description, content }, i) => (
            <div key={i} style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: `${color}15`,
                  border: `1px solid ${color}30`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  marginTop: "2px",
                }}
              >
                <Icon size={15} color={color} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-base)", margin: 0 }}>
                  {title}
                </p>
                <p style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>
                  {description}
                </p>
                {content}
              </div>
            </div>
          ))}
        </div>

        {/* Buttons */}
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
