/**
 * Settings — Wazuh connection config (per-user) + detection rules link + notification prefs.
 * Detection rules CRUD lives at /soc/detection-rules — this page links there.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { getCustomRules, getWazuhToken, generateWazuhToken, updateTenantSettings, type WazuhTokenInfo } from "@/services/alertService";
import { useAuth } from "@/hooks/useAuth";
import {
  getNotificationPrefs, saveNotificationPrefs, DEFAULT_NOTIF_PREFS,
  type NotificationPrefs,
} from "@/services/authService";
import { useWazuhConfig } from "@/hooks/useWazuhConfig";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { Link } from "react-router-dom";
import {
  FileCode2, CheckCircle, AlertCircle, Terminal,
  RefreshCw, Server, Save, Eye, EyeOff, Trash2, Info,
  Lock, Globe, User, CheckCircle2, Circle, ArrowRight,
  ShieldAlert, Bell, Key, Copy,
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
  const [wazuhDraft, setWazuhDraft]     = useState(wazuhCfg);
  const [showPassword, setShowPassword] = useState(false);
  const [wazuhSaveMsg, setWazuhSaveMsg] = useState("");
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

  // ── Notification preferences ──────────────────────────────────────────
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIF_PREFS);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifSaved, setNotifSaved]   = useState(false);

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

  // ── Wazuh forwarder token ─────────────────────────────────────────────
  const { user } = useAuth();
  const [tokenInfo, setTokenInfo]           = useState<WazuhTokenInfo | null>(null);
  const [tokenLoading, setTokenLoading]     = useState(false);
  const [tokenCopied, setTokenCopied]       = useState(false);
  const [showToken, setShowToken]           = useState(false);
  const [minLevel, setMinLevel]             = useState(user?.wazuh_min_level ?? 3);
  const [minLevelSaving, setMinLevelSaving] = useState(false);
  const [minLevelSaved, setMinLevelSaved]   = useState(false);

  useEffect(() => {
    getWazuhToken().then(setTokenInfo).catch(() => {});
  }, []);

  const handleGenerateToken = async () => {
    setTokenLoading(true);
    try {
      const info = await generateWazuhToken();
      setTokenInfo(info);
    } finally {
      setTokenLoading(false);
    }
  };

  const handleCopyToken = () => {
    if (!tokenInfo?.token) return;
    navigator.clipboard.writeText(tokenInfo.token);
    setTokenCopied(true);
    setTimeout(() => setTokenCopied(false), 2000);
  };

  const handleSaveMinLevel = async () => {
    setMinLevelSaving(true);
    try {
      await updateTenantSettings({ wazuh_min_level: minLevel });
      setMinLevelSaved(true);
      setTimeout(() => setMinLevelSaved(false), 2500);
    } catch {
      // ignore — backend logs it
    } finally {
      setMinLevelSaving(false);
    }
  };

  // ── SIEM rules XML viewer ─────────────────────────────────────────────
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
    { icon: Globe,  done: hasUrl,       label: "API URL configured", note: "e.g. https://192.168.x.x:55000" },
    { icon: User,   done: hasUsername,  label: "Username set",       note: "Default: wazuh-wui" },
    { icon: Lock,   done: hasPassword,  label: "Password set",       note: "Stored in browser only" },
    { icon: Server, done: isConfigured, label: "Connection saved",   note: "Saved with Save Connection" },
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
            Connect to Wazuh and manage your detection rules
          </p>
        </div>
      </motion.div>

      {/* ── Main grid: Connection (left) | Rules XML (right) ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* ══ LEFT: Wazuh Connection ═══════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.25 }}
          className="flex flex-col gap-4"
        >
          {/* Connection form */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                  style={{ backgroundColor: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)" }}
                >
                  <Server size={14} style={{ color: "var(--accent)" }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Wazuh Connection</p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>Per-account · stored in your browser</p>
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

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                <Globe size={11} /> Wazuh API URL
                <InfoTooltip text="REST API endpoint of your Wazuh manager. Default port is 55000. Use HTTPS if SSL is configured." />
              </label>
              <input
                className="input text-sm font-mono w-full"
                placeholder="https://192.168.x.x:55000"
                value={wazuhDraft.apiUrl}
                onChange={(e) => setWazuhDraft({ ...wazuhDraft, apiUrl: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                  <User size={11} /> Username
                  <InfoTooltip text="Wazuh API user with read permissions. Default: wazuh-wui." />
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
                  <Lock size={11} /> Password
                  <InfoTooltip text="Stored in your browser only. Forwarded directly to your Wazuh API." />
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

          {/* Setup checklist */}
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
                  <Icon size={12} className="ml-auto mt-1 shrink-0" style={{ color: done ? "#4ade80" : "var(--text-subtle)" }} />
                </div>
              ))}
            </div>
          </div>

          {/* Forwarder token */}
          <div className="card space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                style={{ backgroundColor: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.18)" }}
              >
                <Key size={14} style={{ color: "#a855f7" }} />
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Forwarder Token</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Per-user · sent by wazuh_forwarder.py as X-Wazuh-Token</p>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                <Key size={11} /> Your Webhook Token
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    readOnly
                    className="input text-sm font-mono w-full pr-9"
                    type={showToken ? "text" : "password"}
                    value={tokenInfo?.token ?? "Generate a token to get started"}
                    style={{ color: tokenInfo ? "var(--text-base)" : "var(--text-subtle)" }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2"
                    style={{ color: "var(--text-subtle)" }}
                  >
                    {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <button
                  onClick={handleCopyToken}
                  disabled={!tokenInfo?.token}
                  className="btn-secondary gap-1.5 shrink-0"
                  style={{ fontSize: "0.8125rem", padding: "0.4rem 0.75rem" }}
                >
                  <Copy size={13} />
                  {tokenCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            {tokenInfo?.webhook_url && (
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium mb-1.5" style={{ color: "var(--text-muted)" }}>
                  <Globe size={11} /> Webhook URL
                </label>
                <input
                  readOnly
                  className="input text-sm font-mono w-full"
                  value={tokenInfo.webhook_url}
                  style={{ color: "var(--text-subtle)" }}
                />
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                  Min Alert Level
                  <InfoTooltip text="Alerts below this Wazuh rule level are silently dropped during ingestion. Set per project as different projects have different needs." />
                </label>
                <span className="text-xs font-mono font-semibold" style={{ color: "var(--accent)" }}>
                  Level {minLevel}+
                </span>
              </div>
              <input
                type="range" min={0} max={15} step={1}
                value={minLevel}
                onChange={(e) => setMinLevel(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
                <span>0 (all)</span><span>7 (medium)</span><span>12 (critical)</span><span>15 (max)</span>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleGenerateToken}
                disabled={tokenLoading}
                className="btn-secondary gap-1.5"
                style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
              >
                {tokenLoading ? <LoadingSpinner size="sm" /> : <RefreshCw size={13} />}
                {tokenInfo ? "Rotate Token" : "Generate Token"}
              </button>
              <button
                onClick={handleSaveMinLevel}
                disabled={minLevelSaving}
                className="btn-primary gap-1.5"
                style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
              >
                {minLevelSaving ? <LoadingSpinner size="sm" /> : minLevelSaved ? <CheckCircle size={13} /> : <Save size={13} />}
                {minLevelSaved ? "Saved!" : "Save Level"}
              </button>
            </div>

            {tokenInfo?.instructions && (
              <div
                className="rounded-lg px-3 py-2.5 text-[11px] leading-relaxed font-mono whitespace-pre-wrap"
                style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-subtle)", border: "1px solid var(--border)" }}
              >
                {tokenInfo.instructions}
              </div>
            )}
          </div>

          {/* Privacy note */}
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

        {/* ══ RIGHT: Wazuh XML rules viewer ════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
          className="card flex flex-col gap-3"
        >
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
                  <InfoTooltip text="Wazuh custom rules extend the built-in ruleset. Load the XML to inspect the current rules deployed on the manager." />
                </div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>Wazuh · custom_rules.xml</p>
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
                to="/detection-rules"
                className="btn-primary gap-1.5 flex items-center"
                style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
              >
                <ArrowRight size={13} /> Detection Rules
              </Link>
            </div>
          </div>

          <p className="text-[11px]" style={{ color: "var(--text-subtle)" }}>
            Read-only view of the Wazuh XML ruleset. To create regex detection rules for
            alert classification, use{" "}
            <Link to="/detection-rules" className="underline" style={{ color: "var(--accent)" }}>
              Detection Rules
            </Link>.
          </p>

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
              style={{ border: "1px dashed var(--border)", backgroundColor: "var(--bg-muted)", minHeight: "16rem" }}
            >
              <FileCode2 size={28} className="mb-3" style={{ color: "var(--text-subtle)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No rules loaded</p>
              <p className="text-xs mt-1 text-center max-w-[18rem]" style={{ color: "var(--text-subtle)" }}>
                Click <strong style={{ color: "var(--text-muted)" }}>Load</strong> to pull{" "}
                <code className="font-mono" style={{ color: "var(--accent)" }}>custom_rules.xml</code>{" "}
                from your Wazuh manager.
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
                <p className="text-[11px] mt-2" style={{ color: "var(--text-subtle)" }}>Save a connection first</p>
              )}
            </div>
          )}
        </motion.div>
      </div>

      {/* ── Detection Rules — link card ───────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.25 }}
        className="flex items-center justify-between gap-4 rounded-xl px-4 py-4"
        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}
          >
            <ShieldAlert size={14} style={{ color: "#f87171" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>Detection Rules</p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Manage per-user regex patterns that auto-classify incoming Wazuh alerts by severity
            </p>
          </div>
        </div>
        <Link
          to="/detection-rules"
          className="btn-primary gap-1.5 flex items-center shrink-0"
          style={{ fontSize: "0.8125rem", padding: "0.4rem 0.875rem" }}
        >
          <ArrowRight size={13} /> Manage Rules
        </Link>
      </motion.div>

      {/* ── Notification Preferences ─────────────────────────── */}
      <motion.div
        className="card"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
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
              type="range" min={0} max={15} step={1}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {([
              ["notify_scan_complete",    "Scan completed"],
              ["notify_scan_failed",      "Scan failed"],
              ["notify_critical_finding", "Critical finding detected"],
              ["notify_soc_critical",     "SOC critical alert"],
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
