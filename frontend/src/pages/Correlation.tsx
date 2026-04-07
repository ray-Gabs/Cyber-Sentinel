/**
 * Correlation — links pentest findings to live Wazuh SOC alerts.
 * Helps analysts understand whether a scanner finding is being actively exploited.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { getCorrelations, runCorrelation, deleteCorrelation, deleteAllCorrelations } from "@/services/correlationService";
import { getScans } from "@/services/scanService";
import { formatDate } from "@/lib/utils";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import StatusBadge from "@/components/common/StatusBadge";
import {
  Link2, Sparkles, Play, Info, ChevronDown, ChevronUp,
  Shield, AlertTriangle, Target, ExternalLink, Trash2,
} from "lucide-react";
import type { Correlation, ScanSummary } from "@/types";

const CORRELATION_TYPE_LABELS: Record<string, { label: string; tooltip: string }> = {
  ip_match:       { label: "IP Match",       tooltip: "The scanner and an active alert reference the same IP address." },
  attack_pattern: { label: "Attack Pattern", tooltip: "The finding's attack category matches the pattern of a live alert." },
  cve_match:      { label: "CVE Match",       tooltip: "The CVE found by the scanner is referenced in an active Wazuh rule." },
  port_match:     { label: "Port Match",      tooltip: "An open port found in the scan is the source of active alert traffic." },
  keyword:        { label: "Keyword",         tooltip: "A rule description keyword links a finding to an alert." },
};

function confidencePill(c: number) {
  if (c >= 0.8) return { color: "#4ade80", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.25)", label: `${Math.round(c * 100)}%` };
  if (c >= 0.5) return { color: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.25)", label: `${Math.round(c * 100)}%` };
  return           { color: "#94a3b8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.2)", label: `${Math.round(c * 100)}%` };
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <div className="group relative inline-flex items-center">
      <Info size={12} style={{ color: "var(--text-subtle)" }} className="cursor-help" />
      <div
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-50"
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

export default function CorrelationPage() {
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [scans, setScans]               = useState<ScanSummary[]>([]);
  const [loading, setLoading]           = useState(true);
  const [running, setRunning]           = useState(false);
  const [error, setError]               = useState("");
  const [selectedScan, setSelectedScan] = useState("");
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [deleting, setDeleting]         = useState<string | null>(null);
  const [clearingAll, setClearingAll]   = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [corrData, scanData] = await Promise.all([
          getCorrelations(),
          getScans(1, 50),
        ]);
        setCorrelations(corrData);
        setScans(scanData.filter((s) => s.status === "completed"));
      } catch {
        setError("Failed to load data. Check your connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteCorrelation(id);
      setCorrelations((prev) => prev.filter((c) => c.id !== id));
      if (expanded === id) setExpanded(null);
    } catch {
      // silently ignore
    } finally {
      setDeleting(null);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm(`Delete all ${correlations.length} correlation run${correlations.length !== 1 ? "s" : ""}?`)) return;
    setClearingAll(true);
    try {
      await deleteAllCorrelations();
      setCorrelations([]);
      setExpanded(null);
    } catch {
      setError("Failed to clear correlations. Try again.");
    } finally {
      setClearingAll(false);
    }
  };

  const handleRun = async () => {
    if (!selectedScan) return;
    setRunning(true);
    setError("");
    try {
      const result = await runCorrelation(selectedScan);
      setCorrelations((prev) => [result, ...prev]);
      setExpanded(result.id);
    } catch {
      setError("Correlation failed. Ensure both a scan and Wazuh alerts are available.");
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page header ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-start justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl"
            style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}
          >
            <Link2 size={16} style={{ color: "#22c55e" }} />
          </div>
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
            >
              Correlation Engine
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {correlations.length > 0
                ? `${correlations.length} correlation run${correlations.length !== 1 ? "s" : ""}`
                : "Link pentest findings to live SOC alerts"}
            </p>
          </div>
        </div>

        {correlations.length > 0 && (
          <button
            className="btn-secondary gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10"
            style={{ fontSize: "0.8125rem" }}
            disabled={clearingAll}
            onClick={handleClearAll}
          >
            {clearingAll ? <LoadingSpinner size="sm" /> : <Trash2 size={13} />}
            Clear All
          </button>
        )}
      </motion.div>

      {/* ── How it works explainer ──────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.25 }}
        className="card"
        style={{ padding: "1rem 1.25rem" }}
      >
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5"
            style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}
          >
            <Info size={14} style={{ color: "#22c55e" }} />
          </div>
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--text-base)" }}>
              What does Correlation Engine do?
            </p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-muted)" }}>
              The Correlation Engine bridges <strong style={{ color: "var(--text-base)" }}>pentest findings</strong> (from
              your scanner) with <strong style={{ color: "var(--text-base)" }}>live Wazuh SOC alerts</strong>. It looks for
              matching IPs, CVEs, ports, and attack patterns — so you can answer the critical question:{" "}
              <em style={{ color: "var(--text-base)" }}>"Is this vulnerability being actively exploited right now?"</em>
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { icon: Target,         color: "#f59e0b", label: "Select a completed scan" },
                { icon: Play,           color: "#3b82f6", label: "Run the correlation engine" },
                { icon: Link2,          color: "#22c55e", label: "Review matched findings ↔ alerts" },
                { icon: Sparkles,       color: "#a855f7", label: "Read AI-generated threat summary" },
              ].map(({ icon: Icon, color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <Icon size={12} style={{ color }} />
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Run new correlation ──────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="card"
      >
        <div className="flex items-center gap-2 mb-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>
            Run New Correlation
          </p>
          <InfoTooltip text="Select any completed pentest scan. The engine will compare its findings against all Wazuh alerts currently stored in the database." />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="w-full sm:max-w-sm">
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-muted)" }}>
              Completed scan
            </label>
            <select
              className="input text-sm"
              value={selectedScan}
              onChange={(e) => setSelectedScan(e.target.value)}
            >
              <option value="">Choose a scan...</option>
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.target} — {s.finding_count} finding{s.finding_count !== 1 ? "s" : ""}
                </option>
              ))}
            </select>
            {scans.length === 0 && (
              <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "var(--text-subtle)" }}>
                <AlertTriangle size={10} />
                No completed scans yet.{" "}
                <Link to="/scans/new" className="underline" style={{ color: "var(--accent)" }}>
                  Run a scan first
                </Link>
              </p>
            )}
          </div>

          <button
            className="btn-primary gap-1.5 shrink-0"
            disabled={!selectedScan || running}
            onClick={handleRun}
            style={{ fontSize: "0.8125rem" }}
          >
            {running ? <LoadingSpinner size="sm" /> : <Play size={13} />}
            {running ? "Analyzing…" : "Run Correlation"}
          </button>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs mt-3"
            style={{
              backgroundColor: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              color: "#f87171",
            }}
          >
            <AlertTriangle size={12} className="shrink-0" />
            {error}
          </motion.div>
        )}
      </motion.div>

      {/* ── Results ─────────────────────────────────────────── */}
      {correlations.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
          className="card flex flex-col items-center justify-center py-14"
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
            style={{ backgroundColor: "var(--bg-muted)" }}
          >
            <Link2 size={24} style={{ color: "var(--text-subtle)" }} />
          </div>
          <p
            className="text-base font-semibold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-muted)" }}
          >
            No correlations yet
          </p>
          <p className="text-sm mt-1 text-center max-w-xs" style={{ color: "var(--text-subtle)" }}>
            Select a completed scan above and run the engine to see how findings connect to live alerts.
          </p>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
          className="space-y-3"
        >
          <p className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
            Results — {correlations.length} run{correlations.length !== 1 ? "s" : ""}
          </p>

          <AnimatePresence initial={false}>
            {correlations.map((corr, idx) => {
              const isOpen = expanded === corr.id;
              const highConf = corr.links.filter((l) => l.confidence >= 0.8).length;

              return (
                <motion.div
                  key={corr.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04, duration: 0.2 }}
                  className="card overflow-hidden"
                  style={{ padding: 0 }}
                >
                  {/* ── Card header — always visible ── */}
                  <div
                    className="flex items-center justify-between gap-4 px-4 py-3.5 cursor-pointer"
                    style={{ backgroundColor: isOpen ? "var(--bg-muted)" : undefined }}
                    onClick={() => setExpanded(isOpen ? null : corr.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                        style={{
                          backgroundColor: corr.links.length > 0
                            ? "rgba(34,197,94,0.1)" : "var(--bg-muted)",
                          border: `1px solid ${corr.links.length > 0 ? "rgba(34,197,94,0.2)" : "var(--border)"}`,
                        }}
                      >
                        <Shield size={13} style={{ color: corr.links.length > 0 ? "#22c55e" : "var(--text-subtle)" }} />
                      </div>

                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--text-base)" }}>
                          {corr.scan_target}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {corr.links.length} link{corr.links.length !== 1 ? "s" : ""} found
                          </span>
                          {highConf > 0 && (
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                              style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
                            >
                              {highConf} high-confidence
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs hidden sm:block" style={{ color: "var(--text-subtle)" }}>
                        {formatDate(corr.created_at)}
                      </span>
                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                        style={{ color: "var(--text-subtle)" }}
                        disabled={deleting === corr.id}
                        onClick={(e) => { e.stopPropagation(); handleDelete(corr.id); }}
                        title="Delete this correlation"
                      >
                        {deleting === corr.id
                          ? <LoadingSpinner size="sm" />
                          : <Trash2 size={13} className="text-red-400" />
                        }
                      </button>
                      {isOpen
                        ? <ChevronUp size={14} style={{ color: "var(--text-subtle)" }} />
                        : <ChevronDown size={14} style={{ color: "var(--text-subtle)" }} />
                      }
                    </div>
                  </div>

                  {/* ── Expanded details ── */}
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 pt-0 space-y-4 border-t" style={{ borderColor: "var(--border)" }}>

                          {/* AI Summary */}
                          {corr.ai_summary && (
                            <div
                              className="rounded-lg p-4 mt-4"
                              style={{
                                backgroundColor: "rgba(168,85,247,0.04)",
                                border: "1px solid rgba(168,85,247,0.15)",
                              }}
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <Sparkles size={13} style={{ color: "#a855f7" }} />
                                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#a855f7" }}>
                                  AI Threat Summary
                                </span>
                                <InfoTooltip text="AI-generated analysis linking the pentest findings to the live alerts. Use this to assess overall threat severity." />
                              </div>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-muted)" }}>
                                {corr.ai_summary}
                              </p>
                            </div>
                          )}

                          {/* Links table */}
                          {corr.links.length > 0 ? (
                            <div className="overflow-x-auto rounded-lg" style={{ border: "1px solid var(--border)" }}>
                              <table className="w-full text-sm">
                                <thead>
                                  <tr style={{ backgroundColor: "var(--bg-muted)", borderBottom: "1px solid var(--border)" }}>
                                    <th className="px-4 py-2.5 text-left">
                                      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                                        Finding
                                        <InfoTooltip text="Vulnerability discovered during the pentest scan." />
                                      </div>
                                    </th>
                                    <th className="px-4 py-2.5 text-left">
                                      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                                        Matched Alert
                                        <InfoTooltip text="The Wazuh SOC alert this finding was correlated with." />
                                      </div>
                                    </th>
                                    <th className="px-4 py-2.5 text-left">
                                      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                                        Match Type
                                        <InfoTooltip text="Why the engine linked these two — hover each type badge for details." />
                                      </div>
                                    </th>
                                    <th className="px-4 py-2.5 text-right">
                                      <div className="flex items-center justify-end gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-subtle)" }}>
                                        Confidence
                                        <InfoTooltip text="How certain the engine is about this correlation — 80%+ = high, 50-79% = medium, &lt;50% = low." />
                                      </div>
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {corr.links.map((link, i) => {
                                    const conf = confidencePill(link.confidence);
                                    const typeInfo = CORRELATION_TYPE_LABELS[link.correlation_type];
                                    return (
                                      <tr
                                        key={link.finding_id ?? `${link.correlation_type}-${i}`}
                                        style={{
                                          borderBottom: i < corr.links.length - 1
                                            ? "1px solid var(--border)"
                                            : undefined,
                                        }}
                                      >
                                        <td className="px-4 py-3">
                                          <div className="flex items-center gap-2">
                                            <StatusBadge value={link.finding_severity} variant="severity" />
                                            <span
                                              className="truncate max-w-[180px] text-sm"
                                              style={{ color: "var(--text-base)" }}
                                            >
                                              {link.finding_name}
                                            </span>
                                          </div>
                                          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
                                            via {link.finding_tool}
                                          </p>
                                        </td>
                                        <td className="px-4 py-3">
                                          <p
                                            className="truncate max-w-[200px] text-sm"
                                            style={{ color: "var(--text-muted)" }}
                                          >
                                            {link.alert_rule_description}
                                          </p>
                                          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>
                                            Wazuh level {link.alert_rule_level}
                                          </p>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="group relative inline-flex">
                                            <span
                                              className="text-xs px-2 py-0.5 rounded font-medium cursor-help"
                                              style={{
                                                backgroundColor: "var(--bg-muted)",
                                                color: "var(--text-muted)",
                                                border: "1px solid var(--border)",
                                              }}
                                            >
                                              {typeInfo?.label ?? link.correlation_type}
                                            </span>
                                            {typeInfo && (
                                              <div
                                                className="pointer-events-none absolute bottom-full left-0 mb-2 w-56 rounded-lg px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-50"
                                                style={{
                                                  backgroundColor: "var(--bg-surface)",
                                                  border: "1px solid var(--border)",
                                                  color: "var(--text-muted)",
                                                  boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                                                }}
                                              >
                                                {typeInfo.tooltip}
                                              </div>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          <span
                                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                            style={{
                                              backgroundColor: conf.bg,
                                              color: conf.color,
                                              border: `1px solid ${conf.border}`,
                                            }}
                                          >
                                            {conf.label}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div
                              className="flex flex-col items-center py-8 rounded-lg"
                              style={{ border: "1px dashed var(--border)" }}
                            >
                              <Link2 size={20} className="mb-2" style={{ color: "var(--text-subtle)" }} />
                              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                                No correlations found for this scan
                              </p>
                              <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
                                No overlapping IPs, CVEs, or attack patterns detected
                              </p>
                            </div>
                          )}

                          <div className="flex items-center justify-end">
                            <Link
                              to={`/scans/${corr.scan_id}`}
                              className="flex items-center gap-1 text-xs transition-colors"
                              style={{ color: "var(--accent)" }}
                            >
                              View full scan report
                              <ExternalLink size={11} />
                            </Link>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
