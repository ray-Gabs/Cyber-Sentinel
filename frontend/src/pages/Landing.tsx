/**
 * Landing.tsx — Public marketing page for Cyber Sentinel.
 * Dark-only, standalone (no AppLayout shell).
 * Animated terminal uses safe DOM methods (no innerHTML).
 */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

// Brief's canonical dark palette — standalone, no CSS vars dependency
const C = {
  bg: "#080c10",
  surface: "#111620",
  border: "rgba(255,255,255,0.07)",
  borderSolid: "#1a2030",
  accent: "#00d4ff",
  accentDim: "rgba(0,212,255,0.10)",
  accentGlow: "rgba(0,212,255,0.22)",
  text: "#e2e8f0",
  muted: "#64748b",
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#22c55e",
};

interface TerminalFinding {
  label: string;
  severity: string;
}

const TERMINAL_FINDINGS: TerminalFinding[] = [
  { label: "SQL Injection", severity: "CRITICAL" },
  { label: "XSS Reflected", severity: "HIGH" },
  { label: "SSL Weak Cipher", severity: "MEDIUM" },
  { label: "Missing HSTS", severity: "LOW" },
  { label: "Directory Listing", severity: "INFO" },
];

const SEV_COLOR: Record<string, string> = {
  CRITICAL: C.critical,
  HIGH: C.high,
  MEDIUM: C.medium,
  LOW: C.low,
  INFO: C.muted,
};

/** Animate children into view using IntersectionObserver (no framer-motion). */
function useScrollIn(ref: React.RefObject<HTMLDivElement>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const target = entry.target as HTMLElement;
            target.style.opacity = "1";
            target.style.transform = "translateY(0)";
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    Array.from(el.children).forEach((child, i) => {
      const c = child as HTMLElement;
      c.style.opacity = "0";
      c.style.transform = "translateY(20px)";
      c.style.transition = `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms`;
      observer.observe(c);
    });

    return () => observer.disconnect();
  }, [ref]);
}

export default function Landing() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showPendingBanner, setShowPendingBanner] = useState(
    searchParams.get("registered") === "pending"
  );

  function dismissBanner() {
    setShowPendingBanner(false);
    const next = new URLSearchParams(searchParams);
    next.delete("registered");
    setSearchParams(next, { replace: true });
  }

  const problemRef  = useRef<HTMLDivElement>(null);
  const pentestRef  = useRef<HTMLDivElement>(null);
  const socRef      = useRef<HTMLDivElement>(null);
  const statsRef    = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);

  useScrollIn(problemRef);
  useScrollIn(pentestRef);
  useScrollIn(socRef);
  useScrollIn(statsRef);

  // Animated terminal — all DOM manipulation uses safe createElement/textContent
  useEffect(() => {
    const el = terminalRef.current as HTMLDivElement;
    if (!el) return;

    let mounted = true;
    let activeTimeout = 0;

    function wait(ms: number): Promise<void> {
      return new Promise((r) => {
        activeTimeout = window.setTimeout(r, ms);
      });
    }

    /** Clear the terminal safely (no innerHTML) */
    function clearTerminal() {
      while (el.firstChild) el.removeChild(el.firstChild);
    }

    function makeSpan(text: string, color: string): HTMLSpanElement {
      const s = document.createElement("span");
      s.textContent = text;
      s.style.color = color;
      return s;
    }

    async function animate() {
      if (!mounted) return;

      clearTerminal();

      // — Command line —
      const cmdLine = document.createElement("div");
      cmdLine.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:14px;";
      const promptSpan = makeSpan("$ ", C.accent);
      promptSpan.style.fontFamily = "'IBM Plex Mono', monospace";
      promptSpan.style.fontWeight = "600";
      const cmdSpan = document.createElement("span");
      cmdSpan.style.cssText = `color:${C.text};font-family:'IBM Plex Mono',monospace;font-size:13px;`;
      cmdLine.appendChild(promptSpan);
      cmdLine.appendChild(cmdSpan);
      el.appendChild(cmdLine);

      const cmdText = "sentinel scan --target example.com --deep";
      for (let i = 0; i <= cmdText.length; i++) {
        if (!mounted) return;
        cmdSpan.textContent = cmdText.slice(0, i);
        await wait(30);
      }

      await wait(280);

      // — Status line —
      const statusLine = document.createElement("div");
      statusLine.style.cssText = `color:${C.muted};font-family:'IBM Plex Mono',monospace;font-size:12px;margin-bottom:10px;`;
      statusLine.textContent = "Running 5 scanner modules in parallel...";
      el.appendChild(statusLine);

      await wait(700);

      // — Findings table header —
      const header = document.createElement("div");
      header.style.cssText = [
        "display:flex",
        "justify-content:space-between",
        "padding:4px 0",
        `border-bottom:1px solid ${C.border}`,
        "margin-bottom:8px",
        "font-size:10px",
        `color:${C.muted}`,
        "font-family:'IBM Plex Mono',monospace",
        "letter-spacing:0.08em",
      ].join(";");
      header.appendChild(makeSpan("FINDING", C.muted));
      header.appendChild(makeSpan("SEVERITY", C.muted));
      el.appendChild(header);

      // — Findings rows —
      for (let i = 0; i < TERMINAL_FINDINGS.length; i++) {
        if (!mounted) return;
        await wait(280);

        const f = TERMINAL_FINDINGS[i];
        const row = document.createElement("div");
        row.style.cssText = [
          "display:flex",
          "justify-content:space-between",
          "align-items:center",
          "padding:4px 0",
          `border-bottom:1px solid ${C.border}`,
          "font-size:12px",
          "font-family:'IBM Plex Mono',monospace",
          "opacity:0",
          "transition:opacity 0.25s ease",
        ].join(";");

        const checkmark = makeSpan(`✓ ${f.label}`, C.text);
        const badge = makeSpan(f.severity, SEV_COLOR[f.severity] ?? C.muted);

        row.appendChild(checkmark);
        row.appendChild(badge);
        el.appendChild(row);

        // Fade in row
        requestAnimationFrame(() => { row.style.opacity = "1"; });
      }

      await wait(700);

      // — Summary line —
      const summary = document.createElement("div");
      summary.style.cssText = [
        "margin-top:12px",
        `padding-top:10px`,
        `border-top:1px solid ${C.border}`,
        `color:${C.accent}`,
        "font-family:'IBM Plex Mono',monospace",
        "font-size:12px",
        "opacity:0",
        "transition:opacity 0.4s ease",
      ].join(";");
      summary.textContent = "✓ Scan complete — 5 findings detected (1 critical)";
      el.appendChild(summary);
      requestAnimationFrame(() => { summary.style.opacity = "1"; });

      await wait(4500);
      if (mounted) animate();
    }

    animate();
    return () => {
      mounted = false;
      clearTimeout(activeTimeout);
    };
  }, []);

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'Inter', 'DM Sans', sans-serif" }}>

      {/* ── Nav ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 clamp(16px, 4vw, 48px)", height: "56px",
        background: "rgba(8,12,16,0.90)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "15px", letterSpacing: "-0.02em" }}>
          <span style={{ color: C.accent }}>Cyber</span>
          <span style={{ color: C.text }}>Sentinel</span>
        </span>
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <Link to="/login" style={{
            padding: "6px 16px", borderRadius: "6px",
            border: `1px solid ${C.border}`,
            color: C.text, textDecoration: "none",
            fontSize: "13px", fontWeight: 500,
          }}>
            Log in
          </Link>
          <Link to="/register" style={{
            padding: "6px 16px", borderRadius: "6px",
            background: C.accent, color: C.bg,
            textDecoration: "none", fontSize: "13px", fontWeight: 600,
          }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Pending registration banner ── */}
      {showPendingBanner && (
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px clamp(16px, 4vw, 48px)",
          background: "rgba(0,212,255,0.07)",
          borderBottom: `1px solid rgba(0,212,255,0.18)`,
          gap: "12px",
        }}>
          <p style={{ fontSize: "13px", color: C.text, margin: 0 }}>
            <span style={{ color: C.accent, fontWeight: 600 }}>Registration submitted.</span>
            {" "}Your account is pending admin approval — you'll be notified once approved.
          </p>
          <button
            onClick={dismissBanner}
            aria-label="Dismiss"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.muted,
              fontSize: "18px",
              lineHeight: 1,
              padding: "0 4px",
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}


      {/* ── Hero ── */}
      <section className="landing-hero">
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center",
            padding: "3px 12px", borderRadius: "9999px",
            border: `1px solid ${C.accentGlow}`,
            background: C.accentDim,
            marginBottom: "22px",
            fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace",
            color: C.accent, letterSpacing: "0.08em",
          }}>
            SMART CITY & CYBERSECURITY LAB · ITS
          </div>

          <h1 style={{
            fontFamily: "'Sora', sans-serif",
            fontSize: "clamp(30px, 4vw, 46px)",
            fontWeight: 800, lineHeight: 1.12,
            letterSpacing: "-0.03em",
            margin: "0 0 18px",
          }}>
            AI-Powered<br />
            <span style={{ color: C.accent }}>Web Security</span><br />
            Assessment Platform
          </h1>

          <p style={{
            fontSize: "15px", color: C.muted, lineHeight: 1.7,
            margin: "0 0 32px", maxWidth: "400px",
          }}>
            Automated pentest scanning and real-time SOC monitoring,
            unified in one platform for security operations teams.
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <Link to="/register" style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "10px 22px", borderRadius: "6px",
              background: C.accent, color: C.bg,
              textDecoration: "none", fontSize: "14px", fontWeight: 600,
              boxShadow: `0 0 24px ${C.accentGlow}`,
            }}>
              Start scanning →
            </Link>
            <Link to="/login" style={{
              display: "inline-flex", alignItems: "center",
              padding: "10px 22px", borderRadius: "6px",
              border: `1px solid ${C.border}`,
              color: C.text, textDecoration: "none", fontSize: "14px",
            }}>
              Sign in
            </Link>
          </div>
        </div>

        {/* Terminal widget */}
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: "10px",
          overflow: "hidden",
          boxShadow: `0 0 48px rgba(0,212,255,0.07)`,
        }}>
          {/* Chrome bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 16px",
            borderBottom: `1px solid ${C.border}`,
            background: "rgba(255,255,255,0.025)",
          }}>
            {(["#ef4444", "#f59e0b", "#22c55e"] as const).map((c, i) => (
              <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c, opacity: 0.75 }} />
            ))}
            <span style={{ marginLeft: "10px", fontSize: "11px", color: C.muted, fontFamily: "'IBM Plex Mono', monospace" }}>
              sentinel — scan
            </span>
          </div>
          {/* Terminal body */}
          <div
            ref={terminalRef}
            style={{ padding: "16px 20px", minHeight: "220px" }}
          />
        </div>
      </section>

      {/* ── Problem ── */}
      <section style={{
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "clamp(40px, 7vw, 72px) clamp(16px, 4vw, 48px)",
      }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <p style={{
            textAlign: "center", fontSize: "10px",
            fontFamily: "'IBM Plex Mono', monospace",
            color: C.accent, letterSpacing: "0.12em",
            marginBottom: "10px",
          }}>
            THE PROBLEM
          </p>
          <h2 style={{
            textAlign: "center",
            fontFamily: "'Sora', sans-serif",
            fontSize: "clamp(22px, 2.8vw, 30px)",
            fontWeight: 700, letterSpacing: "-0.02em",
            color: C.text, margin: "0 0 52px",
          }}>
            Security ops is scattered across too many tools
          </h2>

          <div ref={problemRef} className="landing-problem-grid">
            {[
              {
                icon: "⚡",
                title: "Manual pentesting",
                desc: "Running Nmap, Nuclei, and ZAP separately, then manually correlating results takes hours.",
              },
              {
                icon: "🔔",
                title: "Alert fatigue",
                desc: "Wazuh produces hundreds of raw alerts. No triage means critical events get buried.",
              },
              {
                icon: "🔗",
                title: "No correlation",
                desc: "Pentest findings and SOC alerts exist in silos. Attackers exploit the blind spot.",
              },
            ].map((card) => (
              <div key={card.title} style={{
                background: C.bg,
                border: `1px solid ${C.border}`,
                borderRadius: "8px",
                padding: "28px 24px",
              }}>
                <div style={{ fontSize: "22px", marginBottom: "12px" }}>{card.icon}</div>
                <h3 style={{
                  fontFamily: "'Sora', sans-serif",
                  fontSize: "15px", fontWeight: 600,
                  color: C.text, margin: "0 0 8px",
                }}>{card.title}</h3>
                <p style={{ fontSize: "13px", color: C.muted, margin: 0, lineHeight: 1.65 }}>
                  {card.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pentest module ── */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "clamp(48px, 7vw, 80px) clamp(16px, 4vw, 48px)" }}>
        <div ref={pentestRef} className="landing-feature-row">
          <div>
            <p style={{
              fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace",
              color: C.accent, letterSpacing: "0.12em", marginBottom: "8px",
            }}>PENTEST ENGINE</p>
            <h2 style={{
              fontFamily: "'Sora', sans-serif",
              fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 700,
              color: C.text, margin: "0 0 14px", letterSpacing: "-0.02em",
            }}>
              Automated multi-tool<br />vulnerability scanning
            </h2>
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, margin: "0 0 22px" }}>
              Nmap, Nuclei, SSLyze, WhatWeb, and OWASP ZAP run in parallel.
              Results are aggregated, CVE-mapped, and EPSS-ranked.
              Gemini AI generates a plain-English remediation report.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                "Parallel scanner execution",
                "CVE mapping via NIST NVD",
                "AI-generated report narrative",
                "PDF + HTML export",
              ].map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ color: C.accent, fontSize: "13px", fontWeight: 700 }}>✓</span>
                  <span style={{ fontSize: "13px", color: C.muted }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: "8px", padding: "22px 24px",
          }}>
            <div style={{
              fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace",
              color: C.muted, marginBottom: "14px",
            }}>
              Active scan — example.com
            </div>
            {[
              { tool: "nmap",    status: "done",    findings: 3 },
              { tool: "nuclei",  status: "done",    findings: 12 },
              { tool: "sslyze",  status: "done",    findings: 2 },
              { tool: "whatweb", status: "done",    findings: 5 },
              { tool: "zap",     status: "running", findings: null },
            ].map((t) => (
              <div key={t.tool} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "9px 0", borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: "12px", color: C.text }}>
                  {t.tool}
                </span>
                <span style={{
                  fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace",
                  color: t.status === "running" ? C.accent : C.low,
                }}>
                  {t.status === "running" ? "scanning..." : `${t.findings} findings`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SOC module ── */}
      <section style={{
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "clamp(48px, 7vw, 80px) clamp(16px, 4vw, 48px)",
      }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div ref={socRef} className="landing-feature-row">

            {/* Alert mockup — left */}
            <div style={{
              background: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: "8px", padding: "22px 24px",
            }}>
              <div style={{
                fontSize: "11px", fontFamily: "'IBM Plex Mono', monospace",
                color: C.muted, marginBottom: "14px",
              }}>
                Live alerts — last 5 minutes
              </div>
              {[
                { rule: "SQL injection attempt",  level: 12, agent: "web-01" },
                { rule: "Multiple auth failures", level: 8,  agent: "web-01" },
                { rule: "Port scan detected",     level: 7,  agent: "web-02" },
                { rule: "Config file accessed",   level: 5,  agent: "db-01"  },
              ].map((a, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 0", borderBottom: `1px solid ${C.border}`,
                }}>
                  <div>
                    <div style={{ fontSize: "12px", color: C.text }}>{a.rule}</div>
                    <div style={{
                      fontSize: "10px", color: C.muted,
                      fontFamily: "'IBM Plex Mono', monospace", marginTop: "2px",
                    }}>{a.agent}</div>
                  </div>
                  <span style={{
                    padding: "2px 8px", borderRadius: "9999px",
                    fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace",
                    background: a.level >= 12 ? "rgba(239,68,68,0.15)"
                      : a.level >= 8 ? "rgba(249,115,22,0.15)"
                      : "rgba(234,179,8,0.15)",
                    color: a.level >= 12 ? C.critical : a.level >= 8 ? C.high : C.medium,
                    border: `1px solid ${
                      a.level >= 12 ? "rgba(239,68,68,0.4)"
                      : a.level >= 8 ? "rgba(249,115,22,0.4)"
                      : "rgba(234,179,8,0.4)"
                    }`,
                  }}>
                    {a.level >= 12 ? "CRITICAL" : a.level >= 8 ? "HIGH" : "MEDIUM"}
                  </span>
                </div>
              ))}
            </div>

            {/* Text — right */}
            <div>
              <p style={{
                fontSize: "10px", fontFamily: "'IBM Plex Mono', monospace",
                color: C.accent, letterSpacing: "0.12em", marginBottom: "8px",
              }}>SOC MONITOR</p>
              <h2 style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 700,
                color: C.text, margin: "0 0 14px", letterSpacing: "-0.02em",
              }}>
                Real-time threat detection<br />via Wazuh SIEM
              </h2>
              <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, margin: "0 0 22px" }}>
                Wazuh agents stream security events to your dashboard in real-time.
                AI triages every alert, suppresses false positives, and flags
                exactly what needs attention.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  "AI-powered alert triage",
                  "False positive suppression",
                  "MITRE ATT&CK tagging",
                  "Correlation with pentest findings",
                ].map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ color: C.accent, fontSize: "13px", fontWeight: 700 }}>✓</span>
                    <span style={{ fontSize: "13px", color: C.muted }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section style={{ maxWidth: "1100px", margin: "0 auto", padding: "clamp(40px, 6vw, 60px) clamp(16px, 4vw, 48px)" }}>
        <div
          ref={statsRef}
          className="landing-stats"
          style={{ background: C.border, border: `1px solid ${C.border}` }}
        >
          {[
            { value: "5+",       label: "Security scanners"  },
            { value: "100+",     label: "Nuclei templates"   },
            { value: "Real-time",label: "Alert streaming"    },
            { value: "AI",       label: "Triage & reporting" },
          ].map((stat) => (
            <div key={stat.label} style={{ background: C.surface, padding: "32px 24px", textAlign: "center" }}>
              <div style={{
                fontFamily: "'Sora', sans-serif",
                fontSize: "26px", fontWeight: 700,
                color: C.accent, marginBottom: "4px",
              }}>{stat.value}</div>
              <div style={{ fontSize: "12px", color: C.muted }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="landing-footer-inner">
        <span style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700, fontSize: "14px" }}>
          <span style={{ color: C.accent }}>Cyber</span>
          <span style={{ color: C.text }}>Sentinel</span>
        </span>
        <span style={{ fontSize: "12px", color: C.muted }}>
          Built at Smart City & Cybersecurity Lab · ITS
        </span>
        <div style={{ display: "flex", gap: "12px" }}>
          <Link to="/login"    style={{ fontSize: "12px", color: C.muted, textDecoration: "none" }}>Log in</Link>
          <Link to="/register" style={{ fontSize: "12px", color: C.muted, textDecoration: "none" }}>Register</Link>
        </div>
        </div>
      </footer>

    </div>
  );
}
