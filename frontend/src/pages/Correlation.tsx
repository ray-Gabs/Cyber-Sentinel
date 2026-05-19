/**
 * Correlation Engine — links pentest findings to live Wazuh SOC alerts.
 * Helps analysts understand whether a scanner finding is being actively exploited.
 */
import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { getCorrelations, runCorrelation, deleteCorrelation, deleteAllCorrelations } from "@/services/correlationService";
import { getScans } from "@/services/scanService";
import { formatDate } from "@/lib/utils";
import { Icon, SeverityBadge, PageHead } from "@/components/ui";
import ConfirmModal from "@/components/common/ConfirmModal";
import type { Correlation, ScanSummary } from "@/types";

const PAGE_SIZE = 10;
const LINKS_PAGE_SIZE = 20;

function Spin() {
  return (
    <div
      className="animate-spin rounded-full shrink-0"
      style={{ width: 14, height: 14, border: "2px solid var(--border)", borderTopColor: "var(--accent)" }}
    />
  );
}

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
      <Icon name="info" size={12} style={{ color: "var(--text-3)" }} className="cursor-help" />
      <div
        className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 rounded-lg px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-50"
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

export default function CorrelationPage() {
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [total,        setTotal]        = useState(0);
  const [page,         setPage]         = useState(1);
  const [scans,        setScans]        = useState<ScanSummary[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [running,      setRunning]      = useState(false);
  const [error,        setError]        = useState("");
  const [selectedScan, setSelectedScan] = useState("");
  const [expanded,     setExpanded]     = useState<string | null>(null);
  const [deleting,     setDeleting]     = useState<string | null>(null);
  const [clearingAll,  setClearingAll]  = useState(false);
  const [confirmOpen,  setConfirmOpen]  = useState(false);
  const [linksPages,   setLinksPages]   = useState<Record<string, number>>({});
  const [linksSearch,  setLinksSearch]  = useState<Record<string, string>>({});

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const fetchCorrelations = useCallback(async (targetPage: number) => {
    const skip = (targetPage - 1) * PAGE_SIZE;
    const data = await getCorrelations(skip, PAGE_SIZE);
    setCorrelations(data.items);
    setTotal(data.total);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [, scanData] = await Promise.all([
          fetchCorrelations(1),
          getScans(1, 50),
        ]);
        setScans(scanData.filter((s) => s.status === "completed"));
      } catch {
        setError("Failed to load data. Check your connection.");
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchCorrelations]);

  const handlePageChange = async (newPage: number) => {
    setPage(newPage);
    setLoading(true);
    try {
      await fetchCorrelations(newPage);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await deleteCorrelation(id);
      setCorrelations((prev) => prev.filter((c) => c.id !== id));
      setTotal(t => Math.max(0, t - 1));
      if (expanded === id) setExpanded(null);
    } catch {
      // silently ignore
    } finally {
      setDeleting(null);
    }
  };

  const executeClearAll = async () => {
    setConfirmOpen(false);
    setClearingAll(true);
    try {
      await deleteAllCorrelations();
      setCorrelations([]);
      setTotal(0);
      setPage(1);
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
      // Merge: update existing entry or prepend new one — prevents duplicates
      // when the same scan is correlated more than once (backend upserts by scan_id)
      setCorrelations((prev) => {
        const existingIdx = prev.findIndex(c => c.id === result.id);
        if (existingIdx >= 0) {
          return prev.map((c, i) => i === existingIdx ? result : c);
        }
        // New correlation — prepend and bump total
        setTotal(t => t + 1);
        return [result, ...prev];
      });
      setExpanded(result.id);
    } catch {
      setError("Correlation failed. Ensure both a scan and Wazuh alerts are available.");
    } finally {
      setRunning(false);
    }
  };

  if (loading && correlations.length === 0) {
    return (
      <div className="flex justify-center py-20">
        <div
          className="animate-spin rounded-full"
          style={{ width: 32, height: 32, border: "3px solid var(--border)", borderTopColor: "var(--accent)" }}
        />
      </div>
    );
  }

  return (
    <>
    <ConfirmModal
      open={confirmOpen}
      title="Clear All Correlations"
      message={`Delete all ${total} correlation run${total !== 1 ? "s" : ""}?`}
      detail="This action cannot be undone."
      confirmLabel="Clear All"
      variant="danger"
      loading={clearingAll}
      onConfirm={executeClearAll}
      onCancel={() => setConfirmOpen(false)}
    />
    <div className="space-y-5">

      <PageHead
        eyebrow="CORRELATION ENGINE"
        title="Correlation Engine"
        sub={total > 0
          ? `${total} correlation run${total !== 1 ? "s" : ""}`
          : "Link pentest findings to live SOC alerts"}
        actions={
          total > 0 ? (
            <button
              className="btn btn-sm btn-danger flex items-center gap-1.5"
              disabled={clearingAll}
              onClick={() => setConfirmOpen(true)}
            >
              {clearingAll ? <Spin /> : <Icon name="trash" size={13} />}
              Clear All
            </button>
          ) : undefined
        }
      />

      {/* How it works */}
      <div className="card" style={{ padding: "1rem 1.25rem" }}>
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 mt-0.5"
            style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}
          >
            <Icon name="info" size={14} style={{ color: "#22c55e" }} />
          </div>
          <div>
            <p className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>
              What does Correlation Engine do?
            </p>
            <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-2)" }}>
              The Correlation Engine bridges <strong style={{ color: "var(--text)" }}>pentest findings</strong> (from
              your scanner) with <strong style={{ color: "var(--text)" }}>live Wazuh SOC alerts</strong>. It looks for
              matching IPs, CVEs, ports, and attack patterns — so you can answer:{" "}
              <em style={{ color: "var(--text)" }}>"Is this vulnerability being actively exploited right now?"</em>
            </p>
            <div className="flex flex-wrap gap-3">
              {[
                { iconName: "target", color: "#f59e0b", label: "Select a completed scan" },
                { iconName: "play",   color: "#3b82f6", label: "Run the correlation engine" },
                { iconName: "link",   color: "#22c55e", label: "Review matched findings ↔ alerts" },
                { iconName: "zap",    color: "#a855f7", label: "Read AI-generated threat summary" },
              ].map(({ iconName, color, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <Icon name={iconName} size={12} style={{ color }} />
                  <span className="text-xs" style={{ color: "var(--text-2)" }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Run new correlation */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>
            Run New Correlation
          </p>
          <InfoTooltip text="Select any completed pentest scan. The engine will compare its findings against all Wazuh alerts stored in the database. Re-running on the same scan updates the existing result." />
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="w-full sm:max-w-sm">
            <label className="text-xs font-medium mb-1.5 block" style={{ color: "var(--text-2)" }}>
              Completed scan
            </label>
            <select
              className="input text-sm w-full"
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
              <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: "var(--text-3)" }}>
                <Icon name="alert" size={10} />
                No completed scans yet.{" "}
                <Link to="/scans/new" className="underline" style={{ color: "var(--accent)" }}>
                  Run a scan first
                </Link>
              </p>
            )}
          </div>

          <button
            className="btn btn-primary flex items-center gap-1.5 shrink-0 disabled:opacity-40"
            disabled={!selectedScan || running}
            onClick={handleRun}
          >
            {running ? <Spin /> : <Icon name="play" size={13} />}
            {running ? "Analyzing…" : "Run Correlation"}
          </button>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs mt-3"
            style={{ backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "var(--sev-critical)" }}
          >
            <Icon name="alert" size={12} className="shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {correlations.length === 0 && !loading ? (
        <div className="card flex flex-col items-center justify-center py-14">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: "var(--bg-2)" }}>
            <Icon name="link" size={24} style={{ color: "var(--text-3)" }} />
          </div>
          <p className="text-base font-semibold" style={{ color: "var(--text-2)" }}>No correlations yet</p>
          <p className="text-sm mt-1 text-center max-w-xs" style={{ color: "var(--text-3)" }}>
            Select a completed scan above and run the engine to see how findings connect to live alerts.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="eyebrow">
              Results — {total} run{total !== 1 ? "s" : ""}
            </p>
            {totalPages > 1 && (
              <span className="text-xs" style={{ color: "var(--text-3)" }}>
                Page {page} of {totalPages}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full" style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--accent)" }} />
            </div>
          ) : (
            correlations.map((corr) => {
              const isOpen   = expanded === corr.id;
              const highConf = corr.links.filter((l) => l.confidence >= 0.8).length;

              return (
                <div key={corr.id} className="card overflow-hidden" style={{ padding: 0 }}>
                  {/* Card header */}
                  <div
                    className="flex items-center justify-between gap-4 px-4 py-3.5 cursor-pointer hover:bg-white/5 transition-colors"
                    style={{ backgroundColor: isOpen ? "var(--bg-2)" : undefined }}
                    onClick={() => {
                      if (!isOpen) setLinksPages((prev) => ({ ...prev, [corr.id]: 1 }));
                      setExpanded(isOpen ? null : corr.id);
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
                        style={{
                          backgroundColor: corr.links.length > 0 ? "rgba(34,197,94,0.1)" : "var(--bg-2)",
                          border: `1px solid ${corr.links.length > 0 ? "rgba(34,197,94,0.2)" : "var(--border)"}`,
                        }}
                      >
                        <Icon name="shield" size={13} style={{ color: corr.links.length > 0 ? "#22c55e" : "var(--text-3)" }} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                          {corr.scan_target}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs" style={{ color: "var(--text-2)" }}>
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
                      <span className="text-xs hidden sm:block" style={{ color: "var(--text-3)" }}>
                        {formatDate(corr.created_at)}
                      </span>
                      <button
                        className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
                        style={{ color: "var(--text-3)" }}
                        disabled={deleting === corr.id}
                        onClick={(e) => { e.stopPropagation(); handleDelete(corr.id); }}
                        title="Delete this correlation"
                      >
                        {deleting === corr.id ? <Spin /> : <Icon name="trash" size={13} style={{ color: "var(--sev-high)" }} />}
                      </button>
                      <Icon name={isOpen ? "chevU" : "chevD"} size={14} style={{ color: "var(--text-3)" }} />
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isOpen && (
                    <div className="px-4 pb-4 pt-0 space-y-4 border-t" style={{ borderColor: "var(--border)" }}>

                      {/* AI Summary */}
                      {corr.ai_summary && (
                        <div
                          className="rounded-lg p-4 mt-4"
                          style={{ backgroundColor: "rgba(168,85,247,0.04)", border: "1px solid rgba(168,85,247,0.15)" }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <Icon name="zap" size={13} style={{ color: "#a855f7" }} />
                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#a855f7" }}>
                              AI Threat Summary
                            </span>
                            <InfoTooltip text="AI-generated analysis linking the pentest findings to the live alerts. Use this to assess overall threat severity." />
                          </div>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-2)" }}>
                            {corr.ai_summary}
                          </p>
                        </div>
                      )}

                      {/* Links table */}
                      {corr.links.length > 0 ? (
                        <div className="space-y-2">
                          {/* Search bar */}
                          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
                            style={{ backgroundColor: "var(--surface)", border: linksSearch[corr.id] ? "1px solid rgba(59,130,246,0.4)" : "1px solid var(--border)" }}>
                            <Icon name="search" size={11} style={{ color: "var(--text-3)", flexShrink: 0 }} />
                            <input
                              type="text"
                              placeholder="Search findings, alerts, match type…"
                              value={linksSearch[corr.id] ?? ""}
                              onChange={(e) => {
                                setLinksSearch((prev) => ({ ...prev, [corr.id]: e.target.value }));
                                setLinksPages((prev) => ({ ...prev, [corr.id]: 1 }));
                              }}
                              className="bg-transparent outline-none text-xs flex-1 min-w-0"
                              style={{ color: "var(--text)" }}
                            />
                            {linksSearch[corr.id] && (
                              <button
                                onClick={() => {
                                  setLinksSearch((prev) => ({ ...prev, [corr.id]: "" }));
                                  setLinksPages((prev) => ({ ...prev, [corr.id]: 1 }));
                                }}
                                style={{ color: "var(--text-3)", flexShrink: 0 }}
                              >
                                <Icon name="x" size={11} />
                              </button>
                            )}
                          </div>

                        {(() => {
                            const q = (linksSearch[corr.id] ?? "").toLowerCase().trim();
                            const filtered = q
                              ? corr.links.filter((l) =>
                                  l.finding_name.toLowerCase().includes(q) ||
                                  l.alert_rule_description.toLowerCase().includes(q) ||
                                  (CORRELATION_TYPE_LABELS[l.correlation_type]?.label ?? l.correlation_type).toLowerCase().includes(q)
                                )
                              : corr.links;
                            const lp = linksPages[corr.id] ?? 1;
                            const start = (lp - 1) * LINKS_PAGE_SIZE;
                            const totalLinkPages = Math.ceil(filtered.length / LINKS_PAGE_SIZE);
                            return (
                              <div className="rounded-lg" style={{ border: "1px solid var(--border)" }}>
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr style={{ backgroundColor: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>
                                      <th className="px-4 py-2.5 text-left">
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                                          Finding <InfoTooltip text="Vulnerability discovered during the pentest scan." />
                                        </div>
                                      </th>
                                      <th className="px-4 py-2.5 text-left">
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                                          Matched Alert <InfoTooltip text="The Wazuh SOC alert this finding was correlated with." />
                                        </div>
                                      </th>
                                      <th className="px-4 py-2.5 text-left">
                                        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                                          Match Type <InfoTooltip text="Why the engine linked these two." />
                                        </div>
                                      </th>
                                      <th className="px-4 py-2.5 text-right">
                                        <div className="flex items-center justify-end gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-3)" }}>
                                          Confidence <InfoTooltip text="80%+ = high, 50-79% = medium, &lt;50% = low." />
                                        </div>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {filtered.length === 0 ? (
                                      <tr>
                                        <td colSpan={4} className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-3)" }}>
                                          No matches for "{q}"
                                        </td>
                                      </tr>
                                    ) : (
                                      filtered.slice(start, start + LINKS_PAGE_SIZE).map((link, i) => {
                                        const conf     = confidencePill(link.confidence);
                                        const typeInfo = CORRELATION_TYPE_LABELS[link.correlation_type];
                                        const globalIdx = start + i;
                                        return (
                                          <tr key={`${link.correlation_type}-${globalIdx}`} style={{ borderBottom: globalIdx < filtered.length - 1 ? "1px solid var(--border)" : undefined }}>
                                            <td className="px-4 py-3">
                                              <div className="flex items-center gap-2">
                                                <SeverityBadge severity={link.finding_severity} />
                                                <span className="truncate max-w-[180px] text-sm" style={{ color: "var(--text)" }}>
                                                  {link.finding_name}
                                                </span>
                                              </div>
                                              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
                                                via {link.finding_tool}
                                              </p>
                                            </td>
                                            <td className="px-4 py-3">
                                              <p className="truncate max-w-[200px] text-sm" style={{ color: "var(--text-2)" }}>
                                                {link.alert_rule_description}
                                              </p>
                                              <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
                                                Wazuh level {link.alert_rule_level}
                                              </p>
                                            </td>
                                            <td className="px-4 py-3">
                                              <div className="group relative inline-flex">
                                                <span
                                                  className="text-xs px-2 py-0.5 rounded font-medium cursor-help"
                                                  style={{ backgroundColor: "var(--bg-2)", color: "var(--text-2)", border: "1px solid var(--border)" }}
                                                >
                                                  {typeInfo?.label ?? link.correlation_type}
                                                </span>
                                                {typeInfo && (
                                                  <div
                                                    className="pointer-events-none absolute bottom-full left-0 mb-2 w-56 rounded-lg px-3 py-2 text-xs opacity-0 group-hover:opacity-100 transition-opacity z-50"
                                                    style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}
                                                  >
                                                    {typeInfo.tooltip}
                                                  </div>
                                                )}
                                              </div>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                              <span
                                                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                                style={{ backgroundColor: conf.bg, color: conf.color, border: `1px solid ${conf.border}` }}
                                              >
                                                {conf.label}
                                              </span>
                                            </td>
                                          </tr>
                                        );
                                      })
                                    )}
                                  </tbody>
                                </table>
                                {filtered.length > LINKS_PAGE_SIZE && (
                                  <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: "1px solid var(--border)" }}>
                                    <span className="text-xs" style={{ color: "var(--text-3)" }}>
                                      {(lp - 1) * LINKS_PAGE_SIZE + 1}–{Math.min(lp * LINKS_PAGE_SIZE, filtered.length)} of {filtered.length} findings
                                    </span>
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={lp <= 1}
                                        onClick={() => setLinksPages((prev) => ({ ...prev, [corr.id]: lp - 1 }))}
                                        className="px-2.5 py-1 rounded text-xs transition-colors disabled:opacity-30"
                                        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                                      >
                                        Prev
                                      </button>
                                      <span className="text-xs px-2" style={{ color: "var(--text-3)" }}>{lp} / {totalLinkPages}</span>
                                      <button
                                        type="button"
                                        disabled={lp >= totalLinkPages}
                                        onClick={() => setLinksPages((prev) => ({ ...prev, [corr.id]: lp + 1 }))}
                                        className="px-2.5 py-1 rounded text-xs transition-colors disabled:opacity-30"
                                        style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-2)" }}
                                      >
                                        Next
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center py-8 rounded-lg" style={{ border: "1px dashed var(--border)" }}>
                          <Icon name="link" size={20} className="mb-2" style={{ color: "var(--text-3)" }} />
                          <p className="text-sm" style={{ color: "var(--text-2)" }}>No correlations found for this scan</p>
                          <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
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
                          <Icon name="external" size={11} />
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, paddingTop: 8 }}>
              <button
                className="btn btn-sm"
                disabled={page <= 1 || loading}
                onClick={() => handlePageChange(page - 1)}
              >
                Previous
              </button>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>
                {page} / {totalPages} · {total} total
              </span>
              <button
                className="btn btn-sm"
                disabled={page >= totalPages || loading}
                onClick={() => handlePageChange(page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
    </>
  );
}
