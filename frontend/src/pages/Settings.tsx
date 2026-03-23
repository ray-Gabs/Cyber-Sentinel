/**
 * Settings — platform configuration, appearance, integrations, SIEM rules.
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getCustomRules, deployRules } from "@/services/alertService";
import { useTheme } from "@/contexts/ThemeContext";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import {
  Monitor, Sun, Moon, Shield, Cpu, Key, FileCode2,
  Upload, CheckCircle, AlertCircle, ChevronRight,
  Zap, Globe, Database, Bot,
} from "lucide-react";

// ── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "appearance", label: "Appearance",    icon: Monitor },
  { id: "platform",   label: "Platform",      icon: Cpu },
  { id: "integrations", label: "Integrations", icon: Key },
  { id: "siem",       label: "SIEM Rules",    icon: FileCode2 },
] as const;
type TabId = typeof TABS[number]["id"];

// ── Animation ─────────────────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
  exit:  { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

// ── Integration entries ───────────────────────────────────────────────────────
const integrations = [
  {
    group: "AI Providers",
    icon: Bot,
    accent: "#a855f7",
    accentBg: "rgba(168,85,247,0.1)",
    items: [
      { name: "Groq (Llama 3.3 70B)",  env: "GROQ_API_KEY",    note: "Default provider — free tier" },
      { name: "Claude (Anthropic)",      env: "CLAUDE_API_KEY",  note: "claude-sonnet-4-6" },
      { name: "OpenAI",                  env: "OPENAI_API_KEY",  note: "gpt-4o" },
      { name: "Gemini (Google)",         env: "GEMINI_API_KEY",  note: "gemini-2.0-flash" },
    ],
  },
  {
    group: "Threat Intelligence",
    icon: Globe,
    accent: "#f59e0b",
    accentBg: "rgba(245,158,11,0.1)",
    items: [
      { name: "Wazuh SIEM",   env: "WAZUH_API_URL",      note: "SOC platform" },
      { name: "NIST NVD",     env: "NVD_API_KEY",        note: "CVE lookups" },
      { name: "VirusTotal",   env: "VIRUSTOTAL_API_KEY",  note: "File & URL scanning" },
      { name: "AbuseIPDB",    env: "ABUSEIPDB_API_KEY",   note: "IP reputation" },
    ],
  },
  {
    group: "Security Tools",
    icon: Zap,
    accent: "#0ea5e9",
    accentBg: "rgba(14,165,233,0.1)",
    items: [
      { name: "OWASP ZAP",  env: "ZAP_API_KEY",   note: "Web app scanner" },
      { name: "Nmap",       env: "—",              note: "System install required" },
      { name: "Nuclei",     env: "—",              note: "System install required" },
      { name: "SSLyze",     env: "—",              note: "Bundled via Python" },
    ],
  },
];

const platformInfo = [
  { label: "Platform",       value: "Cyber Sentinel v1.0.0",          icon: Shield },
  { label: "Backend",        value: "FastAPI + Celery + MongoDB",       icon: Database },
  { label: "Security Tools", value: "Nmap · Nuclei · ZAP · SSLyze",   icon: Zap },
  { label: "SIEM",           value: "Wazuh 4.x",                       icon: Monitor },
];

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<TabId>("appearance");
  const [rulesXml, setRulesXml]     = useState("");
  const [loadingRules, setLoadingRules] = useState(false);
  const [deploying, setDeploying]   = useState(false);
  const [deployMsg, setDeployMsg]   = useState("");
  const [deployError, setDeployError] = useState(false);

  const handleLoadRules = async () => {
    setLoadingRules(true);
    try {
      const xml = await getCustomRules();
      setRulesXml(typeof xml === "string" ? xml : JSON.stringify(xml, null, 2));
    } catch {
      setRulesXml("Failed to load rules. Is the backend running?");
    } finally {
      setLoadingRules(false);
    }
  };

  const handleDeploy = async () => {
    setDeploying(true);
    setDeployMsg("");
    setDeployError(false);
    try {
      const result = await deployRules();
      setDeployMsg(result.message || "Rules deployed successfully");
    } catch {
      setDeployMsg("Failed to deploy rules. Check Wazuh connection.");
      setDeployError(true);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif", color: "var(--text-base)" }}>
          Settings
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
          Platform preferences, integrations, and SIEM configuration
        </p>
      </motion.div>

      {/* Tab bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
        className="flex gap-1 p-1 rounded-xl"
        style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
      >
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium flex-1 justify-center transition-all duration-150"
              style={{
                backgroundColor: active ? "var(--bg-card)" : "transparent",
                color: active ? "var(--text-base)" : "var(--text-muted)",
                boxShadow: active ? "0 1px 4px rgba(0,0,0,0.15)" : "none",
                border: active ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              <Icon size={14} style={{ color: active ? "var(--accent)" : "var(--text-subtle)" }} />
              <span className="hidden sm:block">{label}</span>
            </button>
          );
        })}
      </motion.div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {/* ── Appearance ──────────────────────────────────────────────────── */}
        {activeTab === "appearance" && (
          <motion.div key="appearance" variants={fadeUp} initial="hidden" animate="show" exit="exit" className="space-y-4">
            <div className="card">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl" style={{ backgroundColor: "var(--accent-dim)" }}>
                  <Monitor size={16} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Theme</h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Choose your preferred appearance</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: "dark",
                    label: "Dark Mode",
                    icon: Moon,
                    desc: "Deep dark cybersecurity aesthetic",
                    preview: ["#030712", "#0d1117", "#111827"],
                  },
                  {
                    id: "light",
                    label: "Light Mode",
                    icon: Sun,
                    desc: "Clean, bright professional look",
                    preview: ["#f0f4f8", "#e8eef4", "#ffffff"],
                  },
                ].map(({ id, label, icon: Icon, desc, preview }) => {
                  const active = theme === id;
                  return (
                    <button
                      key={id}
                      onClick={() => id !== theme && toggleTheme()}
                      className="flex flex-col gap-3 p-4 rounded-xl text-left transition-all duration-150"
                      style={{
                        backgroundColor: active ? "var(--accent-dim)" : "var(--bg-muted)",
                        border: active ? "1.5px solid var(--accent)" : "1px solid var(--border-muted)",
                      }}
                    >
                      {/* Color swatch preview */}
                      <div className="flex gap-1.5">
                        {preview.map((c) => (
                          <div key={c} className="h-6 flex-1 rounded-md" style={{ backgroundColor: c, border: "1px solid rgba(255,255,255,0.06)" }} />
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Icon size={15} style={{ color: active ? "var(--accent)" : "var(--text-muted)" }} />
                        <div>
                          <p className="text-sm font-semibold" style={{ color: active ? "var(--accent)" : "var(--text-base)" }}>
                            {label}
                          </p>
                          <p className="text-xs" style={{ color: "var(--text-muted)" }}>{desc}</p>
                        </div>
                      </div>
                      {active && (
                        <div
                          className="flex items-center gap-1.5 text-xs font-medium"
                          style={{ color: "var(--accent)" }}
                        >
                          <CheckCircle size={12} /> Active
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Typography info */}
            <div className="card">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl" style={{ backgroundColor: "var(--bg-muted)" }}>
                  <Monitor size={16} style={{ color: "var(--text-muted)" }} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Typography</h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Font stack in use</p>
                </div>
              </div>
              <div className="space-y-0 divide-y" style={{ borderColor: "var(--border)" }}>
                {[
                  { role: "Display / Headings", font: "Space Grotesk", sample: "Cyber Sentinel" },
                  { role: "Body / UI",           font: "Plus Jakarta Sans", sample: "Platform security interface" },
                  { role: "Monospace / Code",    font: "JetBrains Mono", sample: "GROQ_API_KEY=gsk_..." },
                ].map(({ role, font, sample }) => (
                  <div key={role} className="flex items-center justify-between py-3 gap-4">
                    <div className="min-w-0">
                      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{role}</p>
                      <p className="text-xs font-medium mt-0.5" style={{ color: "var(--text-base)" }}>{font}</p>
                    </div>
                    <p
                      className="text-sm shrink-0"
                      style={{
                        color: "var(--text-muted)",
                        fontFamily: font,
                      }}
                    >
                      {sample}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Platform ────────────────────────────────────────────────────── */}
        {activeTab === "platform" && (
          <motion.div key="platform" variants={fadeUp} initial="hidden" animate="show" exit="exit" className="space-y-4">
            <div className="card">
              <div className="flex items-center gap-3 mb-5">
                <div className="flex items-center justify-center w-9 h-9 rounded-xl" style={{ backgroundColor: "var(--accent-dim)" }}>
                  <Cpu size={16} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Platform Configuration</h2>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Current stack and runtime info</p>
                </div>
              </div>
              <div className="space-y-2">
                {platformInfo.map(({ label, value, icon: Icon }) => (
                  <div
                    key={label}
                    className="flex items-center gap-3 rounded-xl px-4 py-3"
                    style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
                  >
                    <div
                      className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                      style={{ backgroundColor: "var(--bg-card)" }}
                    >
                      <Icon size={14} style={{ color: "var(--text-muted)" }} />
                    </div>
                    <span className="text-sm flex-1" style={{ color: "var(--text-muted)" }}>{label}</span>
                    <span className="text-sm font-medium text-right" style={{ color: "var(--text-base)" }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="rounded-xl px-4 py-3 flex items-start gap-3"
              style={{ backgroundColor: "rgba(14,165,233,0.06)", border: "1px solid rgba(14,165,233,0.2)" }}
            >
              <AlertCircle size={15} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--accent)" }}>AI Provider</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Set <code className="font-mono px-1 rounded" style={{ backgroundColor: "var(--bg-muted)" }}>AI_PROVIDER</code> in
                  your <code className="font-mono px-1 rounded" style={{ backgroundColor: "var(--bg-muted)" }}>.env</code> to one of:{" "}
                  <span style={{ color: "var(--text-base)" }}>groq · claude · openai · gemini</span>
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Integrations ────────────────────────────────────────────────── */}
        {activeTab === "integrations" && (
          <motion.div key="integrations" variants={fadeUp} initial="hidden" animate="show" exit="exit" className="space-y-4">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              All API keys are configured via environment variables in the backend{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--bg-muted)" }}>.env</code> file.
            </p>
            {integrations.map(({ group, icon: GroupIcon, accent, accentBg, items }) => (
              <div key={group} className="card">
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="flex items-center justify-center w-9 h-9 rounded-xl"
                    style={{ backgroundColor: accentBg }}
                  >
                    <GroupIcon size={16} style={{ color: accent }} />
                  </div>
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>{group}</h2>
                </div>
                <div className="space-y-0 divide-y" style={{ borderColor: "var(--border)" }}>
                  {items.map(({ name, env, note }) => (
                    <div key={env} className="flex items-center gap-3 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium" style={{ color: "var(--text-base)" }}>{name}</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>{note}</p>
                      </div>
                      {env !== "—" ? (
                        <code
                          className="text-xs font-mono px-2 py-1 rounded-lg shrink-0"
                          style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-muted)", border: "1px solid var(--border)" }}
                        >
                          {env}
                        </code>
                      ) : (
                        <span
                          className="text-xs px-2 py-1 rounded-lg shrink-0"
                          style={{ backgroundColor: "rgba(34,197,94,0.08)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
                        >
                          Built-in
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        )}

        {/* ── SIEM Rules ──────────────────────────────────────────────────── */}
        {activeTab === "siem" && (
          <motion.div key="siem" variants={fadeUp} initial="hidden" animate="show" exit="exit" className="space-y-4">
            <div className="card">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div
                    className="flex items-center justify-center w-9 h-9 rounded-xl"
                    style={{ backgroundColor: "rgba(245,158,11,0.1)" }}
                  >
                    <FileCode2 size={16} style={{ color: "#f59e0b" }} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Custom SIEM Rules</h2>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>Wazuh custom rule management</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleLoadRules} disabled={loadingRules} className="btn-secondary text-xs gap-1.5">
                    {loadingRules ? <LoadingSpinner size="sm" /> : <FileCode2 size={13} />}
                    Load Rules
                  </button>
                  <button onClick={handleDeploy} disabled={deploying} className="btn-primary text-xs gap-1.5">
                    {deploying ? <LoadingSpinner size="sm" /> : <Upload size={13} />}
                    Deploy
                  </button>
                </div>
              </div>

              {/* Deploy status message */}
              {deployMsg && (
                <div
                  className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm mb-4"
                  style={{
                    backgroundColor: deployError ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
                    border: `1px solid ${deployError ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
                    color: deployError ? "#f87171" : "#4ade80",
                  }}
                >
                  {deployError
                    ? <AlertCircle size={14} className="shrink-0" />
                    : <CheckCircle size={14} className="shrink-0" />
                  }
                  {deployMsg}
                </div>
              )}

              {/* Info box */}
              <div
                className="rounded-xl px-4 py-3 mb-4 flex items-start gap-3"
                style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
              >
                <ChevronRight size={14} className="mt-0.5 shrink-0" style={{ color: "var(--text-subtle)" }} />
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Click <strong style={{ color: "var(--text-base)" }}>Load Rules</strong> to view the current custom rules from Wazuh.
                  Click <strong style={{ color: "var(--text-base)" }}>Deploy</strong> to push updated rules to the Wazuh manager.
                  Requires a running Wazuh instance configured in <code className="font-mono" style={{ color: "var(--accent)" }}>WAZUH_API_URL</code>.
                </p>
              </div>

              {/* Rules output */}
              {rulesXml && (
                <pre
                  className="text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap max-h-96 font-mono"
                  style={{
                    backgroundColor: "var(--bg-muted)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                    lineHeight: "1.7",
                  }}
                >
                  {rulesXml}
                </pre>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
