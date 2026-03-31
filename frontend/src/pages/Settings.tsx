/**
 * Settings — Wazuh connection config (per-user) + SIEM rule management.
 * Wazuh connection is stored in localStorage keyed by user ID so each
 * student can point to their own Wazuh instance.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { getCustomRules, deployRules } from "@/services/alertService";
import { useWazuhConfig } from "@/hooks/useWazuhConfig";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import {
  FileCode2,
  Upload,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Terminal,
  RefreshCw,
  Server,
  Save,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";

export default function Settings() {
  // ── Wazuh connection config ──────────────────────────────────────
  const { config: wazuhCfg, save: saveWazuh, clear: clearWazuh, isConfigured } = useWazuhConfig();
  const [wazuhDraft, setWazuhDraft]       = useState(wazuhCfg);
  const [showPassword, setShowPassword]   = useState(false);
  const [wazuhSaveMsg, setWazuhSaveMsg]   = useState("");
  const [wazuhSaveError, setWazuhSaveError] = useState(false);

  const handleSaveWazuh = () => {
    if (!wazuhDraft.apiUrl.trim()) {
      setWazuhSaveMsg("API URL is required");
      setWazuhSaveError(true);
      return;
    }
    saveWazuh(wazuhDraft);
    setWazuhSaveMsg("Connection saved");
    setWazuhSaveError(false);
    setTimeout(() => setWazuhSaveMsg(""), 3000);
  };

  const handleClearWazuh = () => {
    clearWazuh();
    setWazuhDraft({ apiUrl: "", username: "", password: "" });
    setWazuhSaveMsg("Connection cleared");
    setWazuhSaveError(false);
    setTimeout(() => setWazuhSaveMsg(""), 3000);
  };

  // ── SIEM rules ───────────────────────────────────────────────────
  const [rulesXml, setRulesXml]           = useState("");
  const [loadingRules, setLoadingRules]   = useState(false);
  const [deploying, setDeploying]         = useState(false);
  const [deployMsg, setDeployMsg]         = useState("");
  const [deployError, setDeployError]     = useState(false);

  const handleLoadRules = async () => {
    setLoadingRules(true);
    setDeployMsg("");
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
    <div className="max-w-3xl space-y-6">

      {/* ── Page header ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex items-center gap-3 mb-1">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl"
            style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}
          >
            <Terminal size={16} style={{ color: "#f59e0b" }} />
          </div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
          >
            SIEM Configuration
          </h1>
        </div>
        <p className="text-sm ml-12" style={{ color: "var(--text-muted)" }}>
          Manage and deploy custom Wazuh detection rules
        </p>
      </motion.div>

      {/* ── Wazuh Connection card ────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="card"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)" }}
            >
              <Server size={14} style={{ color: "var(--accent)" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>
                Wazuh Connection
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Your personal Wazuh API endpoint · stored locally per account
              </p>
            </div>
          </div>

          {isConfigured && (
            <span
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
            >
              <CheckCircle size={11} /> Connected
            </span>
          )}
        </div>

        <div className="space-y-3">
          {/* API URL */}
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
              Wazuh API URL
            </label>
            <input
              className="input text-sm font-mono"
              placeholder="https://192.168.x.x:55000"
              value={wazuhDraft.apiUrl}
              onChange={(e) => setWazuhDraft({ ...wazuhDraft, apiUrl: e.target.value })}
            />
          </div>

          {/* Credentials row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                Username
              </label>
              <input
                className="input text-sm"
                placeholder="wazuh-wui"
                value={wazuhDraft.username}
                onChange={(e) => setWazuhDraft({ ...wazuhDraft, username: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                Password
              </label>
              <div className="relative">
                <input
                  className="input text-sm pr-9"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={wazuhDraft.password}
                  onChange={(e) => setWazuhDraft({ ...wazuhDraft, password: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--text-subtle)" }}
                >
                  {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
          </div>

          {/* Save / clear status */}
          {wazuhSaveMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{
                backgroundColor: wazuhSaveError ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
                border: `1px solid ${wazuhSaveError ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
                color: wazuhSaveError ? "#f87171" : "#4ade80",
              }}
            >
              {wazuhSaveError ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
              {wazuhSaveMsg}
            </motion.div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleSaveWazuh}
              className="btn-primary gap-1.5"
              style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
            >
              <Save size={13} /> Save Connection
            </button>
            {isConfigured && (
              <button
                onClick={handleClearWazuh}
                className="btn-secondary gap-1.5"
                style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
              >
                <Trash2 size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        {/* Info note */}
        <div
          className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2.5"
          style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
        >
          <ChevronRight size={12} className="mt-0.5 shrink-0" style={{ color: "var(--text-subtle)" }} />
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
            Credentials are saved to <strong style={{ color: "var(--text-muted)" }}>your browser only</strong> and
            never sent to the Cyber Sentinel server except when making Wazuh API calls (rule deploy, alert polling).
            Each user account stores its own connection independently.
          </p>
        </div>
      </motion.div>

      {/* ── Info banner ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.25 }}
        className="flex items-start gap-3 rounded-xl px-4 py-3"
        style={{ backgroundColor: "var(--accent-dim)", border: "1px solid rgba(59,130,246,0.15)" }}
      >
        <ChevronRight size={14} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Rules are stored in Wazuh's{" "}
          <code className="font-mono text-[10px] px-1 rounded" style={{ backgroundColor: "var(--bg-muted)", color: "var(--accent)" }}>
            custom_rules.xml
          </code>
          . Click <strong style={{ color: "var(--text-base)" }}>Load</strong> to fetch the current ruleset.
          Edit rules in the XML editor below, then click{" "}
          <strong style={{ color: "var(--text-base)" }}>Deploy</strong> to push to the manager.
          Uses the Wazuh connection configured above (or falls back to server{" "}
          <code className="font-mono text-[10px] px-1 rounded" style={{ backgroundColor: "var(--bg-muted)", color: "var(--accent)" }}>
            WAZUH_API_URL
          </code>).
        </p>
      </motion.div>

      {/* ── Rule manager card ────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
        className="card"
      >
        {/* Card header + action buttons */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}
            >
              <FileCode2 size={14} style={{ color: "#f59e0b" }} />
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>
                Custom Detection Rules
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Wazuh · custom_rules.xml
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadRules}
              disabled={loadingRules}
              className="btn-secondary gap-1.5"
              style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
            >
              {loadingRules
                ? <LoadingSpinner size="sm" />
                : <RefreshCw size={13} />
              }
              {rulesXml ? "Refresh" : "Load Rules"}
            </button>

            <button
              onClick={handleDeploy}
              disabled={deploying || !rulesXml}
              className="btn-primary gap-1.5"
              style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
            >
              {deploying ? <LoadingSpinner size="sm" /> : <Upload size={13} />}
              Deploy
            </button>
          </div>
        </div>

        {/* Deploy status message */}
        {deployMsg && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-center gap-2 rounded-lg px-4 py-3 text-sm mb-4"
            style={{
              backgroundColor: deployError ? "rgba(239,68,68,0.08)" : "rgba(34,197,94,0.08)",
              border: `1px solid ${deployError ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.2)"}`,
              color: deployError ? "#f87171" : "#4ade80",
            }}
          >
            {deployError
              ? <AlertCircle size={13} className="shrink-0" />
              : <CheckCircle size={13} className="shrink-0" />
            }
            {deployMsg}
          </motion.div>
        )}

        {/* Rules display — empty state or XML viewer */}
        {rulesXml ? (
          <pre
            className="text-xs rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed"
            style={{
              backgroundColor: "var(--bg-muted)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              maxHeight: "28rem",
              overflowY: "auto",
            }}
          >
            {rulesXml}
          </pre>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-16 rounded-xl"
            style={{ border: "1px dashed var(--border)", backgroundColor: "var(--bg-muted)" }}
          >
            <FileCode2 size={28} className="mb-3" style={{ color: "var(--text-subtle)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
              No rules loaded
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
              Click Load Rules to fetch from Wazuh
            </p>
            <button
              onClick={handleLoadRules}
              className="btn-secondary mt-4 gap-1.5"
              style={{ fontSize: "0.8125rem" }}
            >
              <RefreshCw size={13} />
              Load Rules
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
