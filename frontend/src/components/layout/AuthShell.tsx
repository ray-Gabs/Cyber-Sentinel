import { Link } from "react-router-dom";

interface AuthShellProps {
  title: string;
  sub?: string;
  children: React.ReactNode;
}

export function AuthShell({ title, sub, children }: AuthShellProps) {
  return (
    <div style={{ minHeight: "100vh", position: "relative", display: "flex" }}>
      <div className="auth-bg" />

      {/* Left brand rail */}
      <div
        style={{
          position: "relative", zIndex: 1,
          flex: 1, padding: "40px 56px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          borderRight: "1px solid var(--border)",
        }}
      >
        <div className="row" style={{ gap: 12 }}>
          <div className="sb-brand-mark" style={{ width: 32, height: 32 }} />
          <div>
            <div style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>Cyber Sentinel</div>
            <div className="mono" style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.1em" }}>
              V1.0 · ITS LAB
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 480 }}>
          <div className="eyebrow" style={{ marginBottom: 14 }}>
            SMART CITY & CYBERSECURITY LAB · ITS
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-0.025em", lineHeight: 1.1, margin: 0 }}>
            Continuous web security<br />
            <span style={{ color: "var(--accent)" }}>for every project.</span>
          </h1>
          <p style={{ color: "var(--text-3)", fontSize: 14, lineHeight: 1.6, marginTop: 18 }}>
            Automated pentest with 20 scanner modules. Live Wazuh SIEM correlation.
            AI triage that classifies every alert and explains why.
          </p>
          <div
            style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              marginTop: 36, border: "1px solid var(--border)",
              borderRadius: 12, overflow: "hidden",
            }}
          >
            {[
              { v: "20", l: "Scanners" },
              { v: "17", l: "OWASP·25" },
              { v: "8",  l: "SIEM rules" },
              { v: "2",  l: "AI models" },
            ].map((s, i) => (
              <div
                key={i}
                style={{
                  padding: "16px 14px",
                  borderRight: i < 3 ? "1px solid var(--border)" : "none",
                  background: "var(--surface)",
                }}
              >
                <div className="num" style={{ fontSize: 22, fontWeight: 600 }}>{s.v}</div>
                <div className="eyebrow" style={{ marginTop: 4 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mono" style={{ fontSize: 10, color: "var(--text-4)", letterSpacing: "0.08em" }}>
          © 2025 INSTITUT TEKNOLOGI SEPULUH NOPEMBER
        </div>
      </div>

      {/* Right form panel */}
      <div
        style={{
          position: "relative", zIndex: 1, width: 480, padding: "40px 48px",
          display: "flex", flexDirection: "column", justifyContent: "center",
          background: "var(--bg)",
        }}
      >
        <Link
          to="/"
          style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            fontSize: 12, color: "var(--text-3)", textDecoration: "none",
            marginBottom: 24,
          }}
        >
          &#8592; Back to home
        </Link>
        <div style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", margin: 0 }}>{title}</h2>
          {sub && <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>{sub}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
