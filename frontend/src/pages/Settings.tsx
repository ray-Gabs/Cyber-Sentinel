/**
 * Settings — Wazuh SIEM rule management.
 * Single-purpose page: load, view, and deploy custom detection rules.
 * No tabs. No appearance controls (theme lives in the header).
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { getCustomRules, deployRules } from "@/services/alertService";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import {
  FileCode2,
  Upload,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Terminal,
  RefreshCw,
} from "lucide-react";

export default function Settings() {
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

      {/* ── Info banner ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
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
          Requires{" "}
          <code className="font-mono text-[10px] px-1 rounded" style={{ backgroundColor: "var(--bg-muted)", color: "var(--accent)" }}>
            WAZUH_API_URL
          </code>{" "}
          in your <code className="font-mono text-[10px]">.env</code>.
        </p>
      </motion.div>

      {/* ── Rule manager card ────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.25 }}
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
