import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/lib/constants";
import { Btn, Badge, Icon } from "@/components/ui";

export default function Landing() {
  const navigate = useNavigate();
  const goSignIn     = () => navigate(ROUTES.LOGIN);
  const goGetStarted = () => navigate(ROUTES.REGISTER);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", position: "relative", overflow: "hidden" }}>
      {/* Nav */}
      <header style={{
        height: 56, padding: "0 32px",
        display: "flex", alignItems: "center",
        borderBottom: "1px solid var(--border)",
        position: "sticky", top: 0,
        background: "oklch(from var(--bg) l c h / 0.7)",
        backdropFilter: "blur(16px)",
        zIndex: 10,
      }}>
        <div className="row" style={{ gap: 10 }}>
          <div className="sb-brand-mark" style={{ width: 26, height: 26 }} />
          <div style={{ fontWeight: 600, letterSpacing: "-0.01em", fontSize: 14 }}>Cyber Sentinel</div>
        </div>
        <div style={{ flex: 1 }} />
        <nav className="row" style={{ gap: 24, fontSize: 13, color: "var(--text-2)", marginRight: 20 }}>
          <a href="https://github.com/ray-Gabs/Cyber-Sentinel/wiki"
             target="_blank" rel="noopener noreferrer"
             style={{ color: "inherit", textDecoration: "none" }}>Docs</a>
          <a href="https://github.com/ray-Gabs/Cyber-Sentinel"
             target="_blank" rel="noopener noreferrer"
             style={{ color: "inherit", textDecoration: "none" }}>GitHub</a>
        </nav>
        <div className="row" style={{ gap: 8 }}>
          <Btn variant="primary" size="sm" iconRight="arrowR" onClick={goSignIn}>Log in</Btn>
        </div>
      </header>

      {/* Hero */}
      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "64px 32px 40px", position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 40, alignItems: "center" }}>
          <div>
            <div className="row" style={{ gap: 8, marginBottom: 24 }}>
              <Badge tone="accent" dot>SMART CITY & CYBERSECURITY LAB · ITS</Badge>
              <Badge>v1.0 · OPEN BETA</Badge>
            </div>
            <h1 style={{ fontSize: "clamp(44px, 6vw, 78px)", fontWeight: 600, letterSpacing: "-0.04em",
              lineHeight: 0.95, margin: 0 }}>
              Pentest. Monitor.<br />
              <span style={{ color: "var(--accent)" }}>Triage. Sleep.</span>
            </h1>
            <p style={{ color: "var(--text-3)", fontSize: 17, lineHeight: 1.55, margin: "24px 0 0", maxWidth: 520 }}>
              A single console where 20 scanners stress-test your web targets,{" "}
              <b style={{ color: "var(--text)" }}>Wazuh streams every alert live</b>,
              and AI explains what to do — for every web project on campus.
            </p>
            <div className="row" style={{ gap: 10, marginTop: 32 }}>
              <Btn variant="primary" size="lg" iconRight="arrowR" onClick={goGetStarted}>Get started — it's free</Btn>
            </div>
            <div className="row" style={{ gap: 16, marginTop: 28, fontSize: 12, color: "var(--text-3)", flexWrap: "wrap" }}>
              <span className="row" style={{ gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sev-low)",
                  boxShadow: "0 0 6px var(--sev-low)" }} />
                Wazuh 4.7 ready
              </span>
              <span style={{ color: "var(--text-4)" }}>·</span>
              <span>OWASP Top 10 · 2025</span>
              <span style={{ color: "var(--text-4)" }}>·</span>
              <span>Self-hosted</span>
              <span style={{ color: "var(--text-4)" }}>·</span>
              <span>MITRE ATT&amp;CK v14</span>
            </div>
          </div>

          {/* Hero widgets */}
          <div style={{ position: "relative", height: 520 }}>
            <FloatingTerminal />
            <FloatingFindings />
            <FloatingAlert />
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section style={{ borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--bg-2)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "20px 32px" }}>
          <div className="row" style={{ gap: 40, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="eyebrow">DEPLOYED ACROSS · ITS · SURABAYA</div>
            <div className="row" style={{ gap: 40, fontSize: 12, color: "var(--text-4)", fontFamily: "var(--font-mono)" }}>
              {["ITS LAB", "SMART CITY", "FAC. CS", "FAC. ENG", "RESEARCH OPS"].map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Three pillars */}
      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "96px 32px 64px" }}>
        <div className="between" style={{ alignItems: "flex-end", marginBottom: 56, flexWrap: "wrap", gap: 20 }}>
          <div style={{ maxWidth: 600 }}>
            <div className="eyebrow">THE PLATFORM</div>
            <h2 style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em", margin: "12px 0 0", lineHeight: 1.05 }}>
              Three engines.<br />One console.
            </h2>
          </div>
          <p style={{ color: "var(--text-3)", fontSize: 15, lineHeight: 1.6, maxWidth: 380, margin: 0 }}>
            Built for analysts who got tired of jumping between Burp, Wazuh, ZAP, spreadsheets, and Slack.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            { num: "01", tag: "PENTEST", title: "Automated multi-tool scanning",
              body: "Nmap, Nuclei, SSLyze, WhatWeb, OWASP ZAP and 15 more run in parallel via a queue. Quick, Standard, Full, or Custom.",
              points: ["20 scanner modules", "CVE + EPSS scoring", "PDF + JSON export"],
              icon: "scan", accent: "var(--accent)" },
            { num: "02", tag: "SOC", title: "Wazuh-native SIEM monitoring",
              body: "Live alert stream from your Wazuh manager. Custom regex rules, per-project agent groups, MITRE ATT&CK overlay.",
              points: ["Real-time WebSocket", "Per-project tenancy", "Custom rules engine"],
              icon: "shield", accent: "var(--accent-2)" },
            { num: "03", tag: "INTELLIGENCE", title: "AI triage + correlation",
              body: "Every alert classified. Every pentest finding mapped to SIEM events. Threat summaries written for humans.",
              points: ["Verdict + reason", "Find ⇄ Alert bridge", "MITRE auto-tag"],
              icon: "brain", accent: "var(--sev-low)" },
          ].map((p, i) => (
            <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 16, padding: 28, position: "relative", overflow: "hidden", minHeight: 360 }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: p.accent }} />
              <div className="between" style={{ marginBottom: 32 }}>
                <span className="mono" style={{ fontSize: 12, color: p.accent, fontWeight: 600 }}>
                  {p.num} · {p.tag}
                </span>
                <div style={{ width: 32, height: 32, borderRadius: 8,
                  background: `oklch(from ${p.accent} l c h / 0.14)`,
                  color: p.accent, display: "grid", placeItems: "center" }}>
                  <Icon name={p.icon} size={16} />
                </div>
              </div>
              <h3 style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, lineHeight: 1.2 }}>
                {p.title}
              </h3>
              <p style={{ color: "var(--text-3)", fontSize: 14, lineHeight: 1.6, margin: "14px 0 0" }}>{p.body}</p>
              <div style={{ position: "absolute", bottom: 28, left: 28, right: 28, display: "grid", gap: 8 }}>
                {p.points.map((pt, j) => (
                  <div key={j} className="row" style={{ gap: 8, fontSize: 12, color: "var(--text-2)" }}>
                    <Icon name="check" size={12} style={{ color: p.accent }} />{pt}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Workflow strip */}
      <section style={{ background: "var(--bg-2)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", padding: "64px 32px" }}>
          <div className="eyebrow">HOW IT FLOWS</div>
          <h2 style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.025em", margin: "12px 0 40px", maxWidth: 720 }}>
            From <span style={{ color: "var(--accent)" }}>scan command</span> to{" "}
            <span style={{ color: "var(--accent-2)" }}>actioned incident</span> in minutes, not hours.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 0, position: "relative" }}>
            {[
              { n: "01", l: "Add target",   d: "Pair an agent + URL" },
              { n: "02", l: "Launch scan",  d: "20 tools in parallel" },
              { n: "03", l: "SIEM ingests", d: "Live alerts stream in" },
              { n: "04", l: "AI triages",   d: "Verdict + reason" },
              { n: "05", l: "You decide",   d: "Escalate or dismiss" },
            ].map((s, i, arr) => (
              <div key={i} style={{ position: "relative", paddingRight: i < arr.length - 1 ? 16 : 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface)",
                  border: "1px solid var(--border)", display: "grid", placeItems: "center", marginBottom: 14,
                  fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent)", fontWeight: 600 }}>
                  {s.n}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{s.l}</div>
                <div style={{ fontSize: 12, color: "var(--text-3)" }}>{s.d}</div>
                {i < arr.length - 1 && (
                  <Icon name="arrowR" size={14} style={{ position: "absolute", right: 0, top: 11, color: "var(--text-4)" }} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "96px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1,
          background: "var(--border)", border: "1px solid var(--border)", borderRadius: 16, overflow: "hidden" }}>
          {[
            { v: "20",     l: "Security tools",      d: "running in parallel" },
            { v: "4.2s",   l: "AI triage latency",   d: "per alert · haiku-4.5" },
            { v: "42,938", l: "Alerts ingested",      d: "in last 30 days" },
            { v: "10/10",  l: "OWASP Top 10 · 2025", d: "category coverage" },
          ].map((s, i) => (
            <div key={i} style={{ padding: "40px 28px", background: "var(--surface)" }}>
              <div className="num" style={{ fontSize: 56, fontWeight: 500, letterSpacing: "-0.04em",
                color: "var(--accent)", lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginTop: 14 }}>{s.l}</div>
              <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 1320, margin: "0 auto", padding: "32px 32px 96px" }}>
        <div style={{
          background: "var(--surface)",
          border: "1px solid oklch(from var(--accent) l c h / 0.2)",
          borderRadius: 24, padding: "64px 56px", textAlign: "center",
          position: "relative", overflow: "hidden",
        }}>
          <div className="eyebrow" style={{ color: "var(--accent)" }}>START SCANNING TODAY</div>
          <h2 style={{ fontSize: 48, fontWeight: 600, letterSpacing: "-0.03em", margin: "14px 0 0", lineHeight: 1.05 }}>
            Bring your web project.<br />We'll do the rest.
          </h2>
          <p style={{ color: "var(--text-2)", fontSize: 15, lineHeight: 1.6, margin: "16px auto 0", maxWidth: 480 }}>
            Connect a Wazuh agent, point us at a URL — get 24/7 monitoring + on-demand pentest with AI-explained findings.
          </p>
          <div className="row" style={{ gap: 10, marginTop: 32, justifyContent: "center" }}>
            <Btn variant="primary" size="lg" iconRight="arrowR" onClick={goGetStarted}>Create account</Btn>
            <Btn size="lg" onClick={goSignIn}>Sign in</Btn>
          </div>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid var(--border)", padding: "28px 32px", background: "var(--bg-2)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", alignItems: "center",
          justifyContent: "space-between", fontSize: 12, color: "var(--text-3)", flexWrap: "wrap", gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <div className="sb-brand-mark" style={{ width: 22, height: 22 }} />
            <span>Cyber Sentinel · Smart City &amp; Cybersecurity Lab · ITS</span>
          </div>
          <div className="row" style={{ gap: 20 }}>
            <span className="mono">v1.0.0</span>
            <a href="https://github.com/ray-Gabs/Cyber-Sentinel/wiki"
               target="_blank" rel="noopener noreferrer"
               style={{ color: "inherit", textDecoration: "none" }}>Docs</a>
            <a href="https://github.com/ray-Gabs/Cyber-Sentinel"
               target="_blank" rel="noopener noreferrer"
               style={{ color: "inherit", textDecoration: "none" }}>GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FloatingTerminal() {
  return (
    <div style={{ position: "absolute", top: 0, right: 0, width: "92%",
      background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 14, overflow: "hidden",
      boxShadow: "0 30px 80px -30px oklch(0 0 0 / 0.5), 0 1px 0 0 oklch(1 0 0 / 0.04) inset", zIndex: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
        borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff5f57" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#febc2e" }} />
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: "#28c840" }} />
        <div style={{ flex: 1, textAlign: "center", fontSize: 11, color: "var(--text-3)", fontFamily: "var(--font-mono)" }}>
          sentinel — scan
        </div>
      </div>
      <div style={{ padding: "14px 18px", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.7 }}>
        <div><span style={{ color: "var(--accent)" }}>$</span> sentinel scan{" "}
          <span style={{ color: "var(--text-3)" }}>--target example.com --full</span></div>
        <div style={{ color: "var(--text-3)" }}>Running 20 scanner modules in parallel…</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 4, margin: "10px 0",
          borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)", padding: "8px 0" }}>
          {([
            ["✓ SQL Injection (POST /login)", "CRITICAL", "critical"],
            ["✓ Reflected XSS (/search)",      "HIGH",     "high"],
            ["✓ SSL weak cipher (TLS 1.0)",    "MEDIUM",   "medium"],
            ["✓ Missing HSTS header",           "LOW",      "low"],
          ] as [string, string, string][]).map(([t, sev, tone], i) => (
            <div key={i} style={{ display: "contents" }}>
              <div style={{ color: "var(--text-2)" }}>{t}</div>
              <div style={{ color: `var(--sev-${tone})`, textAlign: "right" }}>{sev}</div>
            </div>
          ))}
        </div>
        <div style={{ color: "var(--accent)" }}>5 findings · CVE map + EPSS</div>
      </div>
    </div>
  );
}

function FloatingFindings() {
  return (
    <div style={{ position: "absolute", top: 220, left: -10, width: "70%",
      background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: 14,
      boxShadow: "0 30px 80px -30px oklch(0 0 0 / 0.6)", zIndex: 3, transform: "rotate(-2deg)" }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="row" style={{ gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sev-low)",
            boxShadow: "0 0 6px var(--sev-low)" }} />
          <span className="eyebrow">LIVE · WAZUH</span>
        </div>
        <span className="num" style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>42,938</span>
      </div>
      {([
        ["SQLi attempt — /login", "critical", "2m"],
        ["XSS — /search?q=",     "high",     "6m"],
        ["SSH brute force ×5",   "medium",   "12m"],
      ] as [string, string, string][]).map(([t, sev, time], i) => (
        <div key={i} className="row" style={{ padding: "7px 0",
          borderBottom: i < 2 ? "1px solid var(--border)" : undefined, gap: 8 }}>
          <span style={{ width: 3, height: 18, borderRadius: 2, background: `var(--sev-${sev})` }} />
          <span style={{ fontSize: 12, flex: 1 }}>{t}</span>
          <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>{time}</span>
        </div>
      ))}
    </div>
  );
}

function FloatingAlert() {
  return (
    <div style={{ position: "absolute", bottom: 0, right: 20, width: "80%",
      background: "var(--accent-soft)", border: "1px solid oklch(from var(--accent) l c h / 0.4)",
      borderRadius: 12, padding: 14, boxShadow: "0 20px 60px -20px oklch(0 0 0 / 0.5)",
      zIndex: 4, transform: "rotate(1.5deg)" }}>
      <div className="row" style={{ gap: 6, marginBottom: 8 }}>
        <Icon name="brain" size={13} style={{ color: "var(--accent)" }} />
        <span className="eyebrow" style={{ color: "var(--accent)" }}>AI TRIAGE · 4.2s</span>
        <Badge tone="critical" dot>TRUE POSITIVE</Badge>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--text)" }}>
        Active SQLi probe from <span className="mono">45.33.18.205</span>. Payload matches scan #4-291.{" "}
        <b style={{ color: "var(--accent)" }}>Recommend WAF rule + patch.</b>
      </div>
    </div>
  );
}
