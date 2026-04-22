/**
 * Landing.tsx — Public marketing page for Cyber Sentinel.
 * Dark-only, standalone (no AppLayout shell).
 * Static terminal block — no async typing animation.
 * Scroll-in animation via IntersectionObserver only.
 */
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";

// Standalone color constants — no CSS vars dependency (Landing is outside AppLayout)
const C = {
  bg:          "#0A0A0F",
  surface:     "#111118",
  surfacePlus: "#1A1A24",
  border:      "rgba(255,255,255,0.07)",
  borderSolid: "#1e2535",
  accent:      "#3B82F6",
  accentDim:   "rgba(59,130,246,0.10)",
  green:       "#22C55E",
  red:         "#EF4444",
  yellow:      "#F59E0B",
  text:        "#E2E8F0",
  muted:       "#475569",
  critical:    "#EF4444",
  high:        "#F97316",
  medium:      "#EAB308",
  low:         "#22C55E",
};

/** Animate direct children into view using IntersectionObserver. */
function useScrollIn(ref: React.RefObject<HTMLDivElement | null>) {
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
      c.style.transition = `opacity 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms, transform 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 80}ms`;
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

  const statsRef   = useRef<HTMLDivElement>(null);
  const pentestRef = useRef<HTMLDivElement>(null);
  const socRef     = useRef<HTMLDivElement>(null);
  const techRef    = useRef<HTMLDivElement>(null);

  useScrollIn(statsRef);
  useScrollIn(pentestRef);
  useScrollIn(socRef);
  useScrollIn(techRef);

  return (
    <div style={{ background: C.bg, color: C.text, minHeight: "100vh", fontFamily: "'Inter', 'DM Sans', sans-serif" }}>

      {/* ── Nav ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 clamp(16px, 4vw, 48px)", height: "56px",
        background: "rgba(10,10,15,0.92)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "15px", letterSpacing: "-0.02em" }}>
          <span style={{ color: C.accent }}>Cyber</span>
          <span style={{ color: C.text }}>Sentinel</span>
        </span>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <a href="#features" style={{ fontSize: "13px", color: C.muted, textDecoration: "none" }}>Features</a>
          <a href="#tech" style={{ fontSize: "13px", color: C.muted, textDecoration: "none" }}>Stack</a>
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
            background: C.accent, color: "#fff",
            textDecoration: "none", fontSize: "13px", fontWeight: 600,
          }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Pending registration banner ── */}
      {showPendingBanner && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px clamp(16px, 4vw, 48px)",
          background: "rgba(59,130,246,0.07)",
          borderBottom: `1px solid rgba(59,130,246,0.18)`,
          gap: "12px",
        }}>
          <p style={{ fontSize: "13px", color: C.text, margin: 0 }}>
            <span style={{ color: C.accent, fontWeight: 600 }}>Registration submitted.</span>
            {" "}Your account is pending admin approval — you will be notified once approved.
          </p>
          <button
            onClick={dismissBanner}
            aria-label="Dismiss"
            style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: "18px", lineHeight: 1, padding: "0 4px", flexShrink: 0 }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Hero ── */}
      <section className="landing-hero">
        {/* Left: copy */}
        <div>
          <div style={{
            display: "inline-flex", alignItems: "center",
            padding: "3px 12px", borderRadius: "9999px",
            border: `1px solid rgba(59,130,246,0.25)`,
            background: C.accentDim,
            marginBottom: "22px",
            fontSize: "10px", fontFamily: "'JetBrains Mono', monospace",
            color: C.accent, letterSpacing: "0.08em",
          }}>
            SMART CITY & CYBERSECURITY LAB · ITS
          </div>

          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "clamp(28px, 4vw, 46px)",
            fontWeight: 800, lineHeight: 1.12,
            letterSpacing: "-0.03em",
            margin: "0 0 18px",
            color: C.text,
          }}>
            Web Security<br />
            <span style={{ color: C.accent }}>Assessment</span><br />
            Platform
          </h1>

          <p style={{
            fontSize: "15px", color: C.muted, lineHeight: 1.7,
            margin: "0 0 32px", maxWidth: "400px",
          }}>
            Runs 20 security tools automatically against a target, correlates
            findings with live Wazuh SIEM alerts, and classifies every alert
            using AI triage.
          </p>

          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <Link to="/register" style={{
              display: "inline-flex", alignItems: "center", gap: "8px",
              padding: "10px 22px", borderRadius: "6px",
              background: C.accent, color: "#fff",
              textDecoration: "none", fontSize: "14px", fontWeight: 600,
            }}>
              Get started →
            </Link>
            <Link to="/login" style={{
              display: "inline-flex", alignItems: "center",
              padding: "10px 22px", borderRadius: "6px",
              border: `1px solid ${C.border}`,
              color: C.text, textDecoration: "none", fontSize: "14px",
            }}>
              Log in
            </Link>
          </div>
        </div>

        {/* Right: static terminal output */}
        <div style={{
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: "10px",
          overflow: "hidden",
        }}>
          {/* Chrome bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "10px 16px",
            borderBottom: `1px solid ${C.border}`,
            background: C.surfacePlus,
          }}>
            {(["#ef4444", "#f59e0b", "#22c55e"] as const).map((c, i) => (
              <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: c, opacity: 0.7 }} />
            ))}
            <span style={{ marginLeft: "10px", fontSize: "11px", color: C.muted, fontFamily: "'JetBrains Mono', monospace" }}>
              sentinel — scan
            </span>
          </div>
          {/* Terminal body — static */}
          <div style={{ padding: "16px 20px", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "14px" }}>
              <span style={{ color: C.accent, fontWeight: 600 }}>$</span>
              <span style={{ color: C.text }}>sentinel scan --target example.com --full</span>
            </div>
            <div style={{ color: C.muted, marginBottom: "10px" }}>Running 20 scanner modules in parallel...</div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${C.border}`, fontSize: "10px", color: C.muted, letterSpacing: "0.08em", marginBottom: "6px" }}>
              <span>FINDING</span><span>SEVERITY</span>
            </div>
            {[
              { label: "SQL Injection (POST /login)", sev: "CRITICAL", color: C.red },
              { label: "Reflected XSS (/search)",     sev: "HIGH",     color: C.high },
              { label: "SSL weak cipher (TLS 1.0)",   sev: "MEDIUM",   color: C.medium },
              { label: "Missing HSTS header",          sev: "LOW",      color: C.green },
              { label: "Directory listing exposed",    sev: "INFO",     color: C.muted },
            ].map(({ label, sev, color }) => (
              <div key={sev} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
                <span style={{ color: C.text, display: "flex", alignItems: "center", gap: "6px" }}><Check size={12} color={C.green} />{label}</span>
                <span style={{ color }}>{sev}</span>
              </div>
            ))}
            <div style={{ marginTop: "12px", paddingTop: "10px", borderTop: `1px solid ${C.border}`, color: C.accent }}>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><Check size={12} />Scan complete — 5 findings (1 critical) · CVE map + EPSS done</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats bar ── */}
      <section style={{ borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div
          ref={statsRef}
          className="landing-stats"
          style={{ maxWidth: "1100px", margin: "0 auto", background: C.borderSolid }}
        >
          {[
            { value: "20",  label: "Security tools automated" },
            { value: "17",  label: "OWASP Top 10:2025 checks" },
            { value: "8",   label: "Custom Wazuh SIEM rules"  },
            { value: "2",   label: "AI models (triage + report)" },
          ].map((stat) => (
            <div key={stat.label} style={{ background: C.surface, padding: "28px 24px", textAlign: "center" }}>
              <div style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "28px", fontWeight: 700,
                color: C.accent, marginBottom: "4px",
              }}>{stat.value}</div>
              <div style={{ fontSize: "12px", color: C.muted }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pentest features ── */}
      <section id="features" style={{ maxWidth: "1100px", margin: "0 auto", padding: "clamp(48px, 7vw, 80px) clamp(16px, 4vw, 48px)" }}>
        <div ref={pentestRef} className="landing-feature-row">
          {/* Left: description */}
          <div>
            <p style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: C.accent, letterSpacing: "0.12em", marginBottom: "8px" }}>
              PENTEST ENGINE
            </p>
            <h2 style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 700,
              color: C.text, margin: "0 0 14px", letterSpacing: "-0.02em",
            }}>
              Automated multi-tool<br />vulnerability scanning
            </h2>
            <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, margin: "0 0 22px" }}>
              Nmap, Nuclei, SSLyze, WhatWeb, and OWASP ZAP run in parallel via Celery.
              Results are deduplicated, mapped to CVEs via the NIST NVD API, and
              ranked by EPSS exploitability score. Gemini AI writes a plain-English
              remediation report.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {[
                "20 tools across 5 scanner categories",
                "17 OWASP Top 10:2025 checks covered",
                "CVE enrichment via NIST NVD + EPSS scoring",
                "AI-generated remediation report (PDF + HTML)",
                "Real-time progress via WebSocket",
              ].map((f) => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <Check size={13} color={C.green} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: "13px", color: C.muted }}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: scan output mockup */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "22px 24px" }}>
            <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: C.muted, marginBottom: "14px" }}>
              Active scan — example.com
            </div>
            {[
              { tool: "nmap",       status: "done",    findings: 3  },
              { tool: "nuclei",     status: "done",    findings: 12 },
              { tool: "sslyze",     status: "done",    findings: 2  },
              { tool: "whatweb",    status: "done",    findings: 5  },
              { tool: "owasp-zap",  status: "running", findings: null },
            ].map((t) => (
              <div key={t.tool} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "9px 0", borderBottom: `1px solid ${C.border}`,
              }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", color: C.text }}>
                  {t.tool}
                </span>
                <span style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: t.status === "running" ? C.accent : C.green }}>
                  {t.status === "running" ? "scanning..." : `${t.findings} findings`}
                </span>
              </div>
            ))}
            <div style={{ marginTop: "14px", fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: C.muted }}>
              CVE mapping → EPSS scoring → AI report generation
            </div>
          </div>
        </div>
      </section>

      {/* ── SOC features ── */}
      <section style={{
        background: C.surface,
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        padding: "clamp(48px, 7vw, 80px) clamp(16px, 4vw, 48px)",
      }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <div ref={socRef} className="landing-feature-row">

            {/* Left: alert feed mockup */}
            <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "22px 24px" }}>
              <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: C.muted, marginBottom: "14px" }}>
                Live alerts — last 5 minutes
              </div>
              {[
                { rule: "SQL injection attempt",  level: 12, agent: "web-01", verdict: "TRUE_POSITIVE"  },
                { rule: "Multiple auth failures", level: 8,  agent: "web-01", verdict: "TRUE_POSITIVE"  },
                { rule: "Port scan detected",     level: 7,  agent: "web-02", verdict: "TRUE_POSITIVE"  },
                { rule: "Config file accessed",   level: 5,  agent: "db-01",  verdict: "FALSE_POSITIVE" },
              ].map((a, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 0", borderBottom: `1px solid ${C.border}`,
                }}>
                  <div>
                    <div style={{ fontSize: "12px", color: C.text }}>{a.rule}</div>
                    <div style={{ fontSize: "10px", color: C.muted, fontFamily: "'JetBrains Mono', monospace", marginTop: "2px" }}>
                      {a.agent} · AI: {a.verdict}
                    </div>
                  </div>
                  <span style={{
                    padding: "2px 8px", borderRadius: "9999px",
                    fontSize: "10px", fontFamily: "'JetBrains Mono', monospace",
                    background: a.level >= 12 ? "rgba(239,68,68,0.15)" : a.level >= 8 ? "rgba(249,115,22,0.15)" : "rgba(234,179,8,0.15)",
                    color: a.level >= 12 ? C.red : a.level >= 8 ? C.high : C.medium,
                    border: `1px solid ${a.level >= 12 ? "rgba(239,68,68,0.4)" : a.level >= 8 ? "rgba(249,115,22,0.4)" : "rgba(234,179,8,0.4)"}`,
                  }}>
                    {a.level >= 12 ? "CRITICAL" : a.level >= 8 ? "HIGH" : "MEDIUM"}
                  </span>
                </div>
              ))}
            </div>

            {/* Right: description */}
            <div>
              <p style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: C.accent, letterSpacing: "0.12em", marginBottom: "8px" }}>
                SOC MONITOR
              </p>
              <h2 style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: "clamp(20px, 2.5vw, 26px)", fontWeight: 700,
                color: C.text, margin: "0 0 14px", letterSpacing: "-0.02em",
              }}>
                Real-time threat detection<br />with Wazuh SIEM
              </h2>
              <p style={{ fontSize: "14px", color: C.muted, lineHeight: 1.7, margin: "0 0 22px" }}>
                Wazuh agents stream security events to the dashboard over WebSocket.
                Every alert is classified by AI as TRUE_POSITIVE or FALSE_POSITIVE,
                suppressing noise so analysts focus on what matters.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {[
                  "8 custom Wazuh detection rules for web attack patterns",
                  "AI triage on every alert (Gemini 2.0 Flash)",
                  "TRUE_POSITIVE / FALSE_POSITIVE classification",
                  "MITRE ATT&CK tactic and technique tagging",
                  "Correlation with pentest findings from the same target",
                ].map((f) => (
                  <div key={f} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Check size={13} color={C.green} style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: "13px", color: C.muted }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tech stack ── */}
      <section id="tech" style={{ maxWidth: "1100px", margin: "0 auto", padding: "clamp(48px, 7vw, 80px) clamp(16px, 4vw, 48px)" }}>
        <p style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: C.accent, letterSpacing: "0.12em", marginBottom: "8px" }}>
          TECH STACK
        </p>
        <h2 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "clamp(18px, 2.2vw, 24px)", fontWeight: 700,
          color: C.text, margin: "0 0 32px", letterSpacing: "-0.02em",
        }}>
          Built on standard open-source tooling
        </h2>
        <div ref={techRef} style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
          {[
            "FastAPI", "Python 3.11", "React 18", "TypeScript",
            "MongoDB", "Redis", "Celery", "Wazuh",
            "Nmap", "Nuclei", "OWASP ZAP", "SSLyze",
            "WhatWeb", "Gemini 2.0 Flash", "NIST NVD API", "EPSS",
            "MITRE ATT&CK", "Docker", "Vite", "Tailwind CSS",
          ].map((t) => (
            <span key={t} style={{
              padding: "5px 12px", borderRadius: "4px",
              fontSize: "12px", fontFamily: "'JetBrains Mono', monospace",
              color: C.muted,
              background: C.surface,
              border: `1px solid ${C.border}`,
            }}>
              {t}
            </span>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid ${C.border}`,
        background: C.surface,
        padding: "clamp(48px, 7vw, 80px) clamp(16px, 4vw, 48px)",
        textAlign: "center",
      }}>
        <p style={{ fontSize: "10px", fontFamily: "'JetBrains Mono', monospace", color: C.accent, letterSpacing: "0.12em", marginBottom: "12px" }}>
          GET STARTED
        </p>
        <h2 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: "clamp(22px, 3vw, 32px)", fontWeight: 700,
          color: C.text, margin: "0 0 12px", letterSpacing: "-0.02em",
        }}>
          Run your first scan in minutes
        </h2>
        <p style={{ fontSize: "14px", color: C.muted, margin: "0 0 32px", maxWidth: "480px", marginLeft: "auto", marginRight: "auto", lineHeight: 1.7 }}>
          Register for an account. An admin approves access. Then submit a target
          URL and the pipeline handles the rest.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/register" style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "10px 24px", borderRadius: "6px",
            background: C.accent, color: "#fff",
            textDecoration: "none", fontSize: "14px", fontWeight: 600,
          }}>
            Request access →
          </Link>
          <Link to="/login" style={{
            display: "inline-flex", alignItems: "center",
            padding: "10px 24px", borderRadius: "6px",
            border: `1px solid ${C.border}`,
            color: C.text, textDecoration: "none", fontSize: "14px",
          }}>
            Log in
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ borderTop: `1px solid ${C.border}` }}>
        <div className="landing-footer-inner">
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: "14px" }}>
            <span style={{ color: C.accent }}>Cyber</span>
            <span style={{ color: C.text }}>Sentinel</span>
          </span>
          <span style={{ fontSize: "12px", color: C.muted }}>
            Internship project · Smart City & Cybersecurity Lab · ITS · San Miguel University
          </span>
          <div style={{ display: "flex", gap: "16px" }}>
            <Link to="/login"    style={{ fontSize: "12px", color: C.muted, textDecoration: "none" }}>Log in</Link>
            <Link to="/register" style={{ fontSize: "12px", color: C.muted, textDecoration: "none" }}>Register</Link>
          </div>
        </div>
      </footer>

    </div>
  );
}
