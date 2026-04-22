/**
 * Settings — Wazuh connection config (per-user) + SIEM rule management.
 * Responsive: single column on mobile/tablet, 2-col on lg+.
 */
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  getCustomRules,
  listDetectionRules, createDetectionRule, updateDetectionRule, deleteDetectionRule,
} from "@/services/alertService";
import {
  getNotificationPrefs, saveNotificationPrefs, DEFAULT_NOTIF_PREFS,
  type NotificationPrefs,
} from "@/services/authService";
import type { DetectionRule, DetectionRuleCreate } from "@/types";
import { useWazuhConfig } from "@/hooks/useWazuhConfig";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Link } from "react-router-dom";
import {
  FileCode2, CheckCircle, AlertCircle, Terminal,
  RefreshCw, Server, Save, Eye, EyeOff, Trash2, Info,
  Lock, Globe, User, CheckCircle2, Circle, ArrowRight,
  Plus, ShieldAlert, X, Bell,
} from "lucide-react";

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center">
      <Info size={12} style={{ color: "var(--text-subtle)" }} className="cursor-help" />
      <div
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-lg px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-normal"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border)",
          color: "var(--text-muted)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

export default function Settings() {
  // ── Wazuh connection ──────────────────────────────────────────────────
  const { config: wazuhCfg, save: saveWazuh, clear: clearWazuh, isConfigured } = useWazuhConfig();
  const [wazuhDraft, setWazuhDraft]         = useState(wazuhCfg);
  const [showPassword, setShowPassword]     = useState(false);
  const [wazuhSaveMsg, setWazuhSaveMsg]     = useState("");
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

  // ── Detection rules ───────────────────────────────────────────────────
  const [rules, setRules]               = useState<DetectionRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError]     = useState("");
  const [ruleForm, setRuleForm]         = useState<DetectionRuleCreate>({
    name: "", pattern: "", severity: "medium", enabled: true,
  });
  const [ruleFormVisible, setRuleFormVisible] = useState(false);
  const [ruleFormError, setRuleFormError]     = useState("");
  const [ruleSubmitting, setRuleSubmitting]   = useState(false);
  const [regexTestInput, setRegexTestInput]   = useState("");

  // ── Notification preferences ──────────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved] = useState(false);
  const [deletingRuleId, setDeletingRuleId]   = useState<string | null>(null);
  const [togglingRuleId, setTogglingRuleId]   = useState<string | null>(null);

  const fetchRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError("");
    try {
      setRules(await listDetectionRules());
    } catch {
      setRulesError("Failed to load detection rules. Check your connection.");
    } finally {
      setRulesLoading(false);
    }
  }, []);

  useEffect(() => { void fetchRules(); }, [fetchRules]);

  useEffect(() => {
    getNotificationPrefs().then(setNotifPrefs).catch(() => {});
  }, []);

  const handleSaveNotifPrefs = async () => {
    setNotifSaving(true);
    try {
      const saved = await saveNotificationPrefs(notifPrefs);
      setNotifPrefs(saved);
      setNotifSaved(true);
      setTimeout(() => setNotifSaved(false), 2000);
    } catch {
      // ignore
    } finally {
      setNotifSaving(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleForm.name.trim() || !ruleForm.pattern.trim()) {
      setRuleFormError("Name and pattern are required");
      return;
    }
    setRuleSubmitting(true);
    setRuleFormError("");
    try {
      const created = await createDetectionRule(ruleForm);
      setRules((prev) => [created, ...prev]);
      setRuleForm({ name: "", pattern: "", severity: "medium", enabled: true });
      setRuleFormVisible(false);
    } catch {
      setRuleFormError("Failed to create rule. Check the pattern syntax.");
    } finally {
      setRuleSubmitting(false);
    }
  };

  const handleToggleRule = async (rule: DetectionRule) => {
    if (togglingRuleId) return;
    setTogglingRuleId(rule.id);
    try {
      const updated = await updateDetectionRule(rule.id, { enabled: !rule.enabled });
      setRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)));
    } catch {
      // fail silently — state stays unchanged, user can retry
    } finally {
      setTogglingRuleId(null);
    }
  };

  const handleDeleteRule = async (id: string) => {
    setDeletingRuleId(id);
    try {
      await deleteDetectionRule(id);
      setRules((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // fail silently
    } finally {
      setDeletingRuleId(null);
    }
  };

  const SEV_STYLE: Record<string, { bg: string; text: string }> = {
    low:      { bg: "rgba(34,197,94,0.12)",  text: "#4ade80"  },
    medium:   { bg: "rgba(245,158,11,0.12)", text: "#fbbf24"  },
    high:     { bg: "rgba(249,115,22,0.12)", text: "#fb923c"  },
    critical: { bg: "rgba(239,68,68,0.12)",  text: "#f87171"  },
  };

  // ── SIEM rules (read-only viewer — editing moved to SIEM Config page) ───
  const [rulesXml, setRulesXml]         = useState("");
  const [loadingRules, setLoadingRules] = useState(false);

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

  // ── Derived state ─────────────────────────────────────────────────────
  const hasUrl      = Boolean(wazuhDraft.apiUrl.trim());
  const hasUsername = Boolean(wazuhDraft.username.trim());
  const hasPassword = Boolean(wazuhDraft.password);

  const setupSteps = [
    { icon: Globe,  done: hasUrl,      label: "API URL configured",      note: "e.g. https://192.168.x.x:55000" },
    { icon: User,   done: hasUsername, label: "Username set",             note: "Default: wazuh-wui" },
    { icon: Lock,   done: hasPassword, label: "Password set",             note: "Stored in browser only" },
    { icon: Server, done: isConfigured, label: "Connection saved",        note: "Saved with Save Connection" },
  ];

  return (
    <div className="space-y-5">

      {/* ── Page header ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-3"
      >
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
          style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}
        >
          <Terminal size={16} style={{ color: "#f59e0b" }} />
        </div>
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
          >
            SIEM Configuration
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Connect to Wazuh and manage custom detection rules
          </p>
        </div>
      </motion.div>

      {/* ── Main grid: Connection (left) | Rules (right) ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* ══ LEFT: Wazuh Connection ═══════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="flex flex-col gap-4"
        >
          {/* ── Connection form card ─────────────────────────── */}
          <div className="card space-y-4">
            {/* Card header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                  style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)" }}
                >
                  <Server size={14} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>
                    Wazuh Connection
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Per-account · stored in your browser
                  </p>
                </div>
              </div>
              {isConfigured && (
                <span
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium shrink-0"
                  style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
                >
                  <CheckCircle size={11} /> Active
                </span>
              )}
            </div>

            {/* API URL */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                <Globe size={11} />
                Wazuh API URL
                <InfoTooltip text="REST API endpoint of your Wazuh manager. Default port is 55000. Use HTTPS if SSL is configured on the manager." />
              </label>
              <input
                className="input text-sm font-mono w-full"
                placeholder="https://192.168.x.x:55000"
                value={wazuhDraft.apiUrl}
                onChange={(e) => setWazuhDraft({ ...wazuhDraft, apiUrl: e.target.value })}
              />
            </div>

            {/* Credentials — stack on mobile, grid on sm+ */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                  <User size={11} />
                  Username
                  <InfoTooltip text="Wazuh API user with at least read permissions. Default read-only user is wazuh-wui." />
                </label>
                <input
                  className="input text-sm w-full"
                  placeholder="wazuh-wui"
                  value={wazuhDraft.username}
                  onChange={(e) => setWazuhDraft({ ...wazuhDraft, username: e.target.value })}
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                  <Lock size={11} />
                  Password
                  <InfoTooltip text="Stored only in your browser's localStorage. Never sent to the Cyber Sentinel server — only forwarded directly to your Wazuh API." />
                </label>
                <div className="relative">
                  <input
                    className="input text-sm pr-9 w-full"
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

            {/* Feedback message */}
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
            <div className="flex items-center gap-2 flex-wrap">
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

          {/* ── Setup checklist card ──────────────────────────── */}
          <div className="card">
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "var(--text-subtle)" }}>
              Setup Checklist
            </p>
            <div className="space-y-2.5">
              {setupSteps.map(({ icon: Icon, done, label, note }) => (
                <div key={label} className="flex items-start gap-3">
                  <div
                    className="flex items-center justify-center w-6 h-6 rounded-full shrink-0 mt-0.5"
                    style={{
                      backgroundColor: done ? "rgba(34,197,94,0.1)" : "var(--bg-muted)",
                      border: `1px solid ${done ? "rgba(34,197,94,0.3)" : "var(--border)"}`,
                    }}
                  >
                    {done
                      ? <CheckCircle2 size={12} style={{ color: "#4ade80" }} />
                      : <Circle size={12} style={{ color: "var(--text-subtle)" }} />
                    }
                  </div>
                  <div>
                    <p className="text-xs font-medium" style={{ color: done ? "var(--text-base)" : "var(--text-muted)" }}>
                      {label}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{note}</p>
                  </div>
                  <Icon
                    size={12}
                    className="ml-auto mt-1 shrink-0"
                    style={{ color: done ? "#4ade80" : "var(--text-subtle)" }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Privacy note ──────────────────────────────────── */}
          <div
            className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
            style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
          >
            <Lock size={12} className="mt-0.5 shrink-0" style={{ color: "var(--text-subtle)" }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
              Credentials are saved to{" "}
              <strong style={{ color: "var(--text-muted)" }}>your browser only</strong> and
              forwarded directly to your Wazuh instance. Each user account stores
              its own connection independently.
            </p>
          </div>
        </motion.div>

        {/* ══ RIGHT: Custom Detection Rules ════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
          className="card flex flex-col gap-3"
        >
          {/* Card header + action buttons */}
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                style={{ backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.18)" }}
              >
                <FileCode2 size={14} style={{ color: "#f59e0b" }} />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>
                    Custom Detection Rules
                  </p>
                  <InfoTooltip text="Wazuh custom rules extend the built-in ruleset. Load the current XML, edit it inline, then Deploy to push changes to your Wazuh manager." />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Wazuh · custom_rules.xml
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleLoadRules}
                disabled={loadingRules}
                className="btn-secondary gap-1.5"
                style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
              >
                {loadingRules ? <LoadingSpinner size="sm" /> : <RefreshCw size={13} />}
                {rulesXml ? "Refresh" : "Load"}
              </button>
              <Link
                to="/soc/siem-config"
                className="btn-primary gap-1.5 flex items-center"
                style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
              >
                <ArrowRight size={13} />
                SIEM Config
              </Link>
            </div>
          </div>

          {/* Hint */}
          <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
            Read-only view of the backend's built-in custom rules XML. To create
            and manage per-project detection rules, use{" "}
            <Link to="/soc/siem-config" className="underline" style={{ color: "var(--accent)" }}>
              SIEM Config
            </Link>.
          </p>

          {/* Rules viewer or empty state — grows to fill card */}
          {rulesXml ? (
            <pre
              className="flex-1 text-xs rounded-lg p-4 overflow-auto whitespace-pre font-mono leading-relaxed"
              style={{
                backgroundColor: "var(--bg-muted)",
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                minHeight: "16rem",
                maxHeight: "36rem",
              }}
            >
              {rulesXml}
            </pre>
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-lg flex-1"
              style={{
                border: "1px dashed var(--border)",
                backgroundColor: "var(--bg-muted)",
                minHeight: "16rem",
              }}
            >
              <FileCode2 size={28} className="mb-3" style={{ color: "var(--text-subtle)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                No rules loaded
              </p>
              <p className="text-xs mt-1 text-center max-w-[18rem]" style={{ color: "var(--text-subtle)" }}>
                Click <strong style={{ color: "var(--text-muted)" }}>Load</strong> to pull{" "}
                <code className="font-mono" style={{ color: "var(--accent)" }}>custom_rules.xml</code> from
                your Wazuh manager. Make sure your connection is configured.
              </p>
              <button
                onClick={handleLoadRules}
                disabled={loadingRules || !isConfigured}
                className="btn-secondary gap-1.5 mt-4"
                style={{ fontSize: "0.8125rem" }}
              >
                {loadingRules ? <LoadingSpinner size="sm" /> : <RefreshCw size={13} />}
                Load Rules
              </button>
              {!isConfigured && (
                <p className="text-[11px] mt-2" style={{ color: "var(--text-subtle)" }}>
                  Save a connection first
                </p>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Detection Rules Section ───────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
        className="card space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
              style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}
            >
              <ShieldAlert size={14} style={{ color: "#f87171" }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>
                  Detection Rules
                </p>
                {rules.length > 0 && (
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded font-mono"
                    style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-subtle)", border: "1px solid var(--border)" }}
                  >
                    {rules.length}
                  </span>
                )}
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Regex patterns that auto-classify incoming Wazuh alerts by severity
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchRules()}
              disabled={rulesLoading}
              className="btn-secondary gap-1.5"
              style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
            >
              {rulesLoading ? <LoadingSpinner size="sm" /> : <RefreshCw size={13} />}
              Refresh
            </button>
            <button
              onClick={() => { setRuleFormVisible((v) => !v); setRuleFormError(""); }}
              className="btn-primary gap-1.5"
              style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
            >
              <Plus size={13} /> Add Rule
            </button>
          </div>
        </div>

        {/* Collapsible create form */}
        {ruleFormVisible && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={(e) => void handleCreateRule(e)}
            className="rounded-xl p-4 space-y-3"
            style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
              New Rule
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Name <span style={{ color: "#f87171" }}>*</span>
                </label>
                <input
                  className="input text-sm w-full"
                  placeholder="e.g. SQL Injection Attempt"
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                  Severity
                </label>
                <select
                  className="input text-sm w-full"
                  value={ruleForm.severity}
                  onChange={(e) => setRuleForm({ ...ruleForm, severity: e.target.value as DetectionRuleCreate["severity"] })}
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                Pattern (regex) <span style={{ color: "#f87171" }}>*</span>
              </label>
              <input
                className="input text-sm font-mono w-full"
                placeholder="e.g. (?i)(union|select|drop)\s+.*"
                value={ruleForm.pattern}
                onChange={(e) => setRuleForm({ ...ruleForm, pattern: e.target.value })}
              />
              {/* Live regex tester */}
              {ruleForm.pattern.trim() && (() => {
                let status: "match" | "no_match" | "invalid" | null = null;
                if (regexTestInput.trim()) {
                  try {
                    status = new RegExp(ruleForm.pattern).test(regexTestInput) ? "match" : "no_match";
                  } catch {
                    status = "invalid";
                  }
                } else if (ruleForm.pattern.trim()) {
                  try { new RegExp(ruleForm.pattern); } catch { status = "invalid"; }
                }
                const statusColor = status === "match" ? "var(--green)"
                  : status === "no_match" ? "var(--yellow)"
                  : status === "invalid" ? "var(--red)"
                  : "var(--text-muted)";
                const statusLabel = status === "match" ? "Match"
                  : status === "no_match" ? "No match"
                  : status === "invalid" ? "Invalid regex"
                  : "";
                return (
                  <div className="mt-2 rounded-lg p-2.5" style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Test input</span>
                      {statusLabel && (
                        <span className="text-[11px] font-semibold" style={{ color: statusColor }}>{statusLabel}</span>
                      )}
                    </div>
                    <input
                      className="input text-xs font-mono w-full"
                      placeholder="Paste sample log text to test the pattern..."
                      value={regexTestInput}
                      onChange={(e) => setRegexTestInput(e.target.value)}
                    />
                  </div>
                );
              })()}
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
                Description (optional)
              </label>
              <input
                className="input text-sm w-full"
                placeholder="Brief explanation of what this rule detects"
                value={ruleForm.description ?? ""}
                onChange={(e) => setRuleForm({ ...ruleForm, description: e.target.value || undefined })}
              />
            </div>
            {ruleFormError && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
              >
                <AlertCircle size={12} /> {ruleFormError}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={ruleSubmitting}
                className="btn-primary gap-1.5"
                style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
              >
                {ruleSubmitting ? <LoadingSpinner size="sm" /> : <Plus size={13} />}
                Create Rule
              </button>
              <button
                type="button"
                onClick={() => { setRuleFormVisible(false); setRuleFormError(""); }}
                className="btn-secondary gap-1.5"
                style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
              >
                <X size={13} /> Cancel
              </button>
            </div>
          </motion.form>
        )}

        {/* Rules list — three states */}
        {rulesLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg animate-pulse"
                style={{ backgroundColor: "var(--bg-muted)" }}
              />
            ))}
          </div>
        ) : rulesError ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl py-10 gap-3"
            style={{ border: "1px dashed rgba(239,68,68,0.3)", backgroundColor: "rgba(239,68,68,0.04)" }}
          >
            <AlertCircle size={24} style={{ color: "#f87171" }} />
            <p className="text-sm" style={{ color: "#f87171" }}>{rulesError}</p>
            <button
              onClick={() => void fetchRules()}
              className="btn-secondary gap-1.5"
              style={{ fontSize: "0.8125rem" }}
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        ) : rules.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl py-10 gap-3"
            style={{ border: "1px dashed var(--border)", backgroundColor: "var(--bg-muted)" }}
          >
            <ShieldAlert size={28} style={{ color: "var(--text-subtle)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No detection rules yet</p>
            <p className="text-xs text-center max-w-xs" style={{ color: "var(--text-subtle)" }}>
              Add regex patterns to automatically classify incoming Wazuh alerts by severity.
            </p>
            <button
              onClick={() => setRuleFormVisible(true)}
              className="btn-primary gap-1.5"
              style={{ fontSize: "0.8125rem" }}
            >
              <Plus size={13} /> Add First Rule
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {rules.map((rule) => {
              const sev = SEV_STYLE[rule.severity] ?? SEV_STYLE.medium;
              const isDeleting = deletingRuleId === rule.id;
              const isToggling = togglingRuleId === rule.id;
              return (
                <div
                  key={rule.id}
                  className="flex items-center gap-3 rounded-lg px-3.5 py-2.5 group"
                  style={{
                    border: "1px solid var(--border)",
                    backgroundColor: rule.enabled ? "var(--bg-surface)" : "var(--bg-muted)",
                  }}
                >
                  {/* Enabled pill-toggle */}
                  <button
                    onClick={() => void handleToggleRule(rule)}
                    disabled={isToggling}
                    title={rule.enabled ? "Disable rule" : "Enable rule"}
                    className="shrink-0 w-8 h-4 rounded-full relative transition-colors"
                    style={{
                      backgroundColor: rule.enabled ? "rgba(34,197,94,0.3)" : "var(--border)",
                      border: `1px solid ${rule.enabled ? "rgba(34,197,94,0.5)" : "var(--border)"}`,
                    }}
                  >
                    <span
                      className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                      style={{
                        left: rule.enabled ? "calc(100% - 14px)" : "1px",
                        backgroundColor: rule.enabled ? "#4ade80" : "var(--text-subtle)",
                      }}
                    />
                  </button>

                  {/* Name + pattern */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs font-semibold truncate"
                      style={{ color: rule.enabled ? "var(--text-base)" : "var(--text-muted)" }}
                    >
                      {rule.name}
                    </p>
                    <p className="text-[11px] font-mono truncate mt-0.5" style={{ color: "var(--text-subtle)" }}>
                      {rule.pattern}
                    </p>
                  </div>

                  {/* Severity badge */}
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide shrink-0"
                    style={{ backgroundColor: sev.bg, color: sev.text }}
                  >
                    {rule.severity}
                  </span>

                  {/* Delete */}
                  <button
                    onClick={() => void handleDeleteRule(rule.id)}
                    disabled={isDeleting}
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded"
                    style={{ color: "var(--text-subtle)" }}
                    title="Delete rule"
                  >
                    {isDeleting ? <LoadingSpinner size="sm" /> : <Trash2 size={13} />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Notification Preferences */}
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl" style={{ backgroundColor: "rgba(245,158,11,0.1)" }}>
            <Bell size={15} style={{ color: "var(--yellow)" }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Notification Preferences</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Control which events trigger in-app notifications for you
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Min alert level slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                Minimum Alert Level to Notify
              </label>
              <span className="text-xs font-mono font-semibold" style={{ color: "var(--accent)" }}>
                Level {notifPrefs.min_alert_level}+
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={15}
              step={1}
              value={notifPrefs.min_alert_level}
              onChange={(e) => setNotifPrefs({ ...notifPrefs, min_alert_level: Number(e.target.value) })}
              className="w-full accent-yellow-500"
            />
            <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
              <span>0 (all)</span>
              <span>7 (medium)</span>
              <span>12 (critical)</span>
              <span>15 (max)</span>
            </div>
          </div>

          {/* Toggle preferences */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              ["notify_scan_complete", "Scan completed"],
              ["notify_scan_failed", "Scan failed"],
              ["notify_critical_finding", "Critical finding detected"],
              ["notify_soc_critical", "SOC critical alert"],
              ["notify_new_registration", "New user registration"],
            ] as [keyof NotificationPrefs, string][]).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between rounded-lg px-3 py-2.5 cursor-pointer"
                style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
              >
                <span className="text-xs" style={{ color: "var(--text-base)" }}>{label}</span>
                <button
                  type="button"
                  onClick={() => setNotifPrefs({ ...notifPrefs, [key]: !notifPrefs[key] })}
                  className="shrink-0 w-8 h-4 rounded-full relative transition-colors"
                  style={{
                    backgroundColor: notifPrefs[key] ? "rgba(34,197,94,0.3)" : "var(--border)",
                    border: `1px solid ${notifPrefs[key] ? "rgba(34,197,94,0.5)" : "var(--border)"}`,
                  }}
                >
                  <span
                    className="absolute top-0.5 w-3 h-3 rounded-full transition-all"
                    style={{
                      left: notifPrefs[key] ? "calc(100% - 14px)" : "1px",
                      backgroundColor: notifPrefs[key] ? "#4ade80" : "var(--text-subtle)",
                    }}
                  />
                </button>
              </label>
            ))}
          </div>

          <button
            onClick={handleSaveNotifPrefs}
            disabled={notifSaving}
            className="btn-primary gap-1.5"
            style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
          >
            {notifSaving ? <LoadingSpinner size="sm" /> : notifSaved ? <CheckCircle size={13} /> : <Save size={13} />}
            {notifSaved ? "Saved!" : "Save Preferences"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
