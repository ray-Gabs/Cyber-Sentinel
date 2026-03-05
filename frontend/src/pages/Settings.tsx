/**
 * Settings — forwarder token, detection rules link, notification prefs.
 * Detection rules CRUD lives at /soc/detection-rules — this page links there.
 */
import { useState, useEffect } from "react";
import { getWazuhToken, generateWazuhToken, updateTenantSettings, type WazuhTokenInfo } from "@/services/alertService";
import { useAuth } from "@/hooks/useAuth";
import {
  getNotificationPrefs, saveNotificationPrefs, DEFAULT_NOTIF_PREFS,
  type NotificationPrefs,
} from "@/services/authService";
import { Link } from "react-router-dom";
import { Icon, PageHead } from "@/components/ui";

function Spin() {
  return (
    <div
      className="animate-spin rounded-full shrink-0"
      style={{ width: 13, height: 13, border: "2px solid var(--border)", borderTopColor: "var(--accent)" }}
    />
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center">
      <Icon name="info" size={12} style={{ color: "var(--text-3)" }} className="cursor-help" />
      <div
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-60 rounded-lg px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-50 whitespace-normal"
        style={{
          backgroundColor: "var(--surface)",
          border: "1px solid var(--border)",
          color: "var(--text-2)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

export default function Settings() {
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
      // ignore
    } finally {
      setMinLevelSaving(false);
    }
  };

  return (
    <div className="space-y-6">

      <PageHead
        eyebrow="SETTINGS"
        title="Settings"
        sub="Manage your forwarder token, notification preferences, and detection rules"
      />

      {/* ── Forwarder Token ───────────────────────────────────────── */}
      <div className="card space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={{ backgroundColor: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.18)" }}
          >
            <Icon name="lock" size={14} style={{ color: "#a855f7" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Forwarder Token</p>
            <p className="text-xs" style={{ color: "var(--text-2)" }}>Per-user · sent by wazuh_forwarder.py as X-Wazuh-Token</p>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium mb-2" style={{ color: "var(--text-2)" }}>
            <Icon name="lock" size={11} /> Your Webhook Token
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                readOnly
                className="input text-sm font-mono w-full pr-9"
                type={showToken ? "text" : "password"}
                value={tokenInfo?.token ?? "Generate a token to get started"}
                style={{ color: tokenInfo ? "var(--text)" : "var(--text-3)" }}
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--text-3)" }}
              >
                <Icon name={showToken ? "eyeOff" : "eye"} size={13} />
              </button>
            </div>
            <button
              onClick={handleCopyToken}
              disabled={!tokenInfo?.token}
              className="btn btn-sm flex items-center gap-1.5 shrink-0 disabled:opacity-40"
            >
              <Icon name="copy" size={13} />
              {tokenCopied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        {tokenInfo?.webhook_url && (
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium mb-2" style={{ color: "var(--text-2)" }}>
              <Icon name="globe" size={11} /> Webhook URL
            </label>
            <input
              readOnly
              className="input text-sm font-mono w-full"
              value={tokenInfo.webhook_url}
              style={{ color: "var(--text-3)" }}
            />
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--text-2)" }}>
              Min Alert Level
              <InfoTooltip text="Alerts below this Wazuh rule level are silently dropped during ingestion. Set per project as different projects have different needs." />
            </label>
            <span className="mono text-xs font-semibold" style={{ color: "var(--accent)" }}>
              Level {minLevel}+
            </span>
          </div>
          <input
            type="range" min={0} max={15} step={1}
            value={minLevel}
            onChange={(e) => setMinLevel(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
            <span>0 (all)</span><span>7 (medium)</span><span>12 (critical)</span><span>15 (max)</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleGenerateToken}
            disabled={tokenLoading}
            className="btn btn-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            {tokenLoading ? <Spin /> : <Icon name="refresh" size={13} />}
            {tokenInfo ? "Rotate Token" : "Generate Token"}
          </button>
          <button
            onClick={handleSaveMinLevel}
            disabled={minLevelSaving}
            className="btn btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            {minLevelSaving ? <Spin /> : <Icon name={minLevelSaved ? "checkCircle" : "check"} size={13} />}
            {minLevelSaved ? "Saved!" : "Save Level"}
          </button>
        </div>

        {tokenInfo?.instructions && (
          <div
            className="rounded-lg px-3 py-2.5 text-[11px] leading-relaxed mono whitespace-pre-wrap"
            style={{ backgroundColor: "var(--bg-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
          >
            {tokenInfo.instructions}
          </div>
        )}
      </div>

      {/* ── Detection Rules — link card ───────────────────────── */}
      <div
        className="flex items-center justify-between gap-4 rounded-xl px-4 py-4"
        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
            style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)" }}
          >
            <Icon name="shield" size={14} style={{ color: "var(--sev-critical)" }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>Detection Rules</p>
            <p className="text-xs" style={{ color: "var(--text-2)" }}>
              Manage per-user regex patterns that auto-classify incoming Wazuh alerts by severity
            </p>
          </div>
        </div>
        <Link
          to="/detection-rules"
          className="btn btn-primary btn-sm flex items-center gap-1.5 shrink-0"
        >
          <Icon name="arrowR" size={13} /> Manage Rules
        </Link>
      </div>

      {/* ── Notification Preferences ─────────────────────────── */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl" style={{ backgroundColor: "rgba(245,158,11,0.1)" }}>
            <Icon name="bell" size={15} style={{ color: "#f59e0b" }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Notification Preferences</h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
              Control which events trigger in-app notifications for you
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium" style={{ color: "var(--text-2)" }}>
                Minimum Alert Level to Notify
              </label>
              <span className="mono text-xs font-semibold" style={{ color: "var(--accent)" }}>
                Level {notifPrefs.min_alert_level}+
              </span>
            </div>
            <input
              type="range" min={0} max={15} step={1}
              value={notifPrefs.min_alert_level}
              onChange={(e) => setNotifPrefs({ ...notifPrefs, min_alert_level: Number(e.target.value) })}
              className="w-full accent-yellow-500"
            />
            <div className="flex justify-between text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
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
                style={{ backgroundColor: "var(--bg-2)", border: "1px solid var(--border)" }}
              >
                <span className="text-xs" style={{ color: "var(--text)" }}>{label}</span>
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
                      backgroundColor: notifPrefs[key] ? "#4ade80" : "var(--text-3)",
                    }}
                  />
                </button>
              </label>
            ))}
          </div>

          <button
            onClick={handleSaveNotifPrefs}
            disabled={notifSaving}
            className="btn btn-primary btn-sm flex items-center gap-1.5 disabled:opacity-40"
          >
            {notifSaving ? <Spin /> : <Icon name={notifSaved ? "checkCircle" : "check"} size={13} />}
            {notifSaved ? "Saved!" : "Save Preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
