// ============================================================
// frontend/src/pages/PrivacyPolicy.tsx — Privacy Policy
// SMU ITS Smart City & Cybersecurity Lab — Cyber Sentinel
// ============================================================

import { useNavigate } from "react-router-dom";

const SECTION_STYLE: React.CSSProperties = {
  marginBottom: 36,
};

const H2_STYLE: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: "var(--text-1)",
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: "1px solid var(--border)",
  fontFamily: "var(--font-display)",
};

const P_STYLE: React.CSSProperties = {
  color: "var(--text-2)",
  fontSize: 14,
  lineHeight: 1.75,
  marginBottom: 10,
};

const UL_STYLE: React.CSSProperties = {
  color: "var(--text-2)",
  fontSize: 14,
  lineHeight: 1.75,
  paddingLeft: 20,
  marginBottom: 10,
};

export default function PrivacyPolicy() {
  const navigate = useNavigate();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text-1)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Top nav */}
      <div
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "16px 32px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--bg-2)",
        }}
      >
        <div className="sb-brand-mark" style={{ width: 28, height: 28 }} />
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          Cyber Sentinel
        </span>
        <span
          style={{
            color: "var(--border)",
            marginLeft: 4,
            marginRight: 4,
          }}
        >
          /
        </span>
        <span style={{ color: "var(--text-3)", fontSize: 14 }}>
          Privacy Policy
        </span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--text-2)",
            cursor: "pointer",
            fontSize: 13,
            padding: "6px 14px",
          }}
        >
          Back
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          padding: "48px 32px 80px",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 6,
          }}
        >
          Privacy Policy
        </h1>
        <p
          style={{
            color: "var(--text-3)",
            fontSize: 13,
            marginBottom: 40,
          }}
        >
          Cyber Sentinel — Smart City &amp; Cybersecurity Lab, Informatics and
          Technology School (ITS).{" "}
          <strong style={{ color: "var(--text-2)" }}>
            Effective: May 2026. Last updated: May 2026.
          </strong>
        </p>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>1. Who This Policy Covers</h2>
          <p style={P_STYLE}>
            Cyber Sentinel is an internal security assessment platform operated
            by the Smart City &amp; Cybersecurity Lab at the Informatics and
            Technology School (ITS). Access is restricted to authorized lab
            members, instructors, and invited researchers.
          </p>
          <p style={P_STYLE}>
            This policy explains what data we collect when you use Cyber
            Sentinel, why we collect it, and how it is protected.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>2. Data We Collect</h2>
          <p style={P_STYLE}>
            We collect only the data necessary to operate the platform:
          </p>
          <ul style={UL_STYLE}>
            <li>
              <strong>Account data</strong> — username, email address, and
              bcrypt-hashed password (plain-text passwords are never stored or
              logged).
            </li>
            <li>
              <strong>Scan targets</strong> — URLs, IP addresses, or hostnames
              you submit for security assessment.
            </li>
            <li>
              <strong>Scan findings</strong> — vulnerability reports, severity
              ratings, CVE references, and AI-generated summaries produced by
              each assessment.
            </li>
            <li>
              <strong>Exported reports</strong> — PDF or HTML reports generated
              from scan findings.
            </li>
            <li>
              <strong>Session data</strong> — short-lived JWT access tokens and
              Redis-cached rate-limit counters (cleared automatically, never
              persisted beyond the session window).
            </li>
            <li>
              <strong>Audit logs</strong> — timestamped records of login events,
              role changes, and administrative actions (no sensitive credential
              data is included).
            </li>
            <li>
              <strong>SOC alerts</strong> — Wazuh security events forwarded from
              linked agents.
            </li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>3. Why We Collect It</h2>
          <ul style={UL_STYLE}>
            <li>
              <strong>Authentication</strong> — to verify your identity and
              enforce role-based access control.
            </li>
            <li>
              <strong>Security assessment</strong> — to run automated
              vulnerability scans against targets you have explicit authorization
              to test.
            </li>
            <li>
              <strong>Reporting</strong> — to generate findings summaries and
              exportable reports for lab documentation and research.
            </li>
            <li>
              <strong>Security operations</strong> — to ingest and triage Wazuh
              alerts for monitored systems.
            </li>
            <li>
              <strong>Platform security</strong> — rate-limit abuse, audit
              suspicious authentication events, and maintain an audit trail for
              administrative actions.
            </li>
          </ul>
          <p style={P_STYLE}>
            We do not collect data for advertising, sell or share data with
            third-party analytics providers, or use data for any purpose outside
            of authorized lab operations.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>4. Authorized Use Requirement</h2>
          <p style={P_STYLE}>
            All security scans must target systems for which you hold explicit
            written authorization. Scanning unauthorized systems using this
            platform is prohibited under ITS lab policy and applicable law. Scan
            targets are validated server-side and logged; misuse is detectable
            and may result in access revocation.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>5. Data Retention</h2>
          <ul style={UL_STYLE}>
            <li>
              <strong>Scan records and findings</strong> — retained for the
              duration of the academic term or project period, then reviewed for
              deletion by a lab administrator.
            </li>
            <li>
              <strong>Audit logs</strong> — retained for up to 12 months for
              security review purposes.
            </li>
            <li>
              <strong>Account data</strong> — retained while your account is
              active. Deleted upon written request to the lab administrator.
            </li>
            <li>
              <strong>Session tokens and rate-limit keys</strong> — expire
              automatically (access tokens: 60 minutes; lockout keys: 15
              minutes).
            </li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>6. Access Control</h2>
          <p style={P_STYLE}>
            Access to your data is governed by role-based permissions:
          </p>
          <ul style={UL_STYLE}>
            <li>
              <strong>Analyst</strong> — can view and manage their own scans and
              findings.
            </li>
            <li>
              <strong>Viewer</strong> — read-only access to shared scan
              summaries.
            </li>
            <li>
              <strong>Admin</strong> — lab instructors and system operators who
              can access all data for platform management and research oversight.
            </li>
          </ul>
          <p style={P_STYLE}>
            Admins are bound by ITS lab policy to access individual account data
            only when operationally necessary.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>7. Security Measures</h2>
          <ul style={UL_STYLE}>
            <li>Passwords hashed with bcrypt (cost factor 12).</li>
            <li>
              All API communication over TLS; HSTS enforced for browser
              sessions.
            </li>
            <li>
              JWT tokens short-lived (60 minutes) and bound to
              HttpOnly/Secure/SameSite=Strict cookies where applicable.
            </li>
            <li>
              Rate limiting on all public endpoints; account lockout after 5
              consecutive failed login attempts (15-minute cooldown).
            </li>
            <li>
              Content Security Policy (CSP) headers to mitigate XSS in report
              previews.
            </li>
            <li>
              Internal services (MongoDB, Redis) are not exposed to the public
              network.
            </li>
            <li>All failed authentication attempts are audit-logged.</li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>8. Third-Party Services</h2>
          <p style={P_STYLE}>
            Cyber Sentinel may send scan data to the following external APIs
            when enriching findings:
          </p>
          <ul style={UL_STYLE}>
            <li>
              <strong>NIST NVD API</strong> — CVE database lookups (sends CVE
              IDs only, no user or target data).
            </li>
            <li>
              <strong>FIRST EPSS API</strong> — exploitability probability
              scoring (sends CVE IDs only).
            </li>
            <li>
              <strong>AI providers (Claude / Groq / Gemini / OpenAI)</strong> —
              finding summaries and remediation narratives. Only anonymized
              finding text is sent; no usernames, emails, or account data.
            </li>
            <li>
              <strong>VirusTotal / AbuseIPDB</strong> (when configured) — threat
              intelligence enrichment for IP addresses found in alerts.
            </li>
          </ul>
          <p style={P_STYLE}>
            Each third-party service is governed by its own privacy policy. If
            you have concerns about specific enrichment services, contact the lab
            administrator to disable them.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>9. Your Rights</h2>
          <p style={P_STYLE}>
            As a platform user, you may:
          </p>
          <ul style={UL_STYLE}>
            <li>
              Request a summary of data stored under your account (contact the
              lab administrator).
            </li>
            <li>
              Request deletion of your account and associated scan data.
            </li>
            <li>
              Export your own scan reports from the platform at any time.
            </li>
          </ul>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>10. Policy Updates</h2>
          <p style={P_STYLE}>
            This policy may be updated as the platform evolves. Material changes
            will be communicated to registered users by email or via the
            platform notification system. Continued use of Cyber Sentinel after
            a policy update constitutes acceptance of the revised terms.
          </p>
        </div>

        <div style={SECTION_STYLE}>
          <h2 style={H2_STYLE}>11. Contact</h2>
          <p style={P_STYLE}>
            For questions, data requests, or concerns about this policy, contact
            the Smart City &amp; Cybersecurity Lab administrator at ITS.
          </p>
          <p style={P_STYLE}>
            For security vulnerability reports, contact the platform
            maintainers through the official lab channels.
          </p>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border)",
            paddingTop: 24,
            marginTop: 12,
          }}
        >
          <p style={{ color: "var(--text-3)", fontSize: 12 }}>
            Cyber Sentinel &nbsp;&middot;&nbsp; Smart City &amp; Cybersecurity
            Lab &nbsp;&middot;&nbsp; ITS &nbsp;&middot;&nbsp; v1.0.6
          </p>
        </div>
      </div>
    </div>
  );
}
