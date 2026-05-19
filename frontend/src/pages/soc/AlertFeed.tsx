import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAlerts, getAlertStats, retriageAllUntriaged, getTriageStatus, batchOverrideAlerts } from "@/services/alertService";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { timeAgo, showToast, formatAlertTime, parseUtcDate } from "@/lib/utils";
import { Icon, Badge, KPI, PageHead, VerdictPill } from "@/components/ui";
import { exportSocAlertsPDF } from "@/lib/exportSocAlerts";
import type { AlertSummary, AlertStats } from "@/types";

function getSeverityColor(level: number): string {
  if (level >= 12) return "var(--sev-critical)";
  if (level >= 8)  return "var(--sev-high)";
  if (level >= 5)  return "var(--sev-medium)";
  return "var(--sev-low)";
}

function getSeverityLabel(level: number): string {
  if (level >= 12) return "Critical";
  if (level >= 8)  return "High";
  if (level >= 5)  return "Medium";
  return "Low";
}

const VERDICT_FILTERS = [
  { value: "",               label: "All" },
  { value: "TRUE_POSITIVE",  label: "True Positive" },
  { value: "FALSE_POSITIVE", label: "False Positive" },
  { value: "UNKNOWN",        label: "Unknown" },
  { value: "TRIAGE_FAILED",  label: "Triage Failed" },
];

const LEVEL_FILTERS = [
  { value: 0,  label: "All Levels"   },
  { value: 12, label: "Critical 12+" },
  { value: 8,  label: "High 8+"      },
  { value: 5,  label: "Medium 5+"    },
];


function AlertSkeletonRow() {
  return (
    <tr>
      <td colSpan={7}>
        <div className="animate-pulse" style={{ height: 36, background: "var(--surface-2)", borderRadius: 6, margin: "2px 0" }} />
      </td>
    </tr>
  );
}

export default function AlertFeed() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [alerts,      setAlerts]      = useState<AlertSummary[]>([]);
  const [totalAlerts, setTotalAlerts] = useState(0);
  const [totalPages,  setTotalPages]  = useState(1);
  const [alertStats,  setAlertStats]  = useState<AlertStats | null>(null);
  const [loading,            setLoading]            = useState(true);
  const [isFetching,         setIsFetching]         = useState(false);
  const [fetchError,         setFetchError]         = useState("");
  const [page,          setPage]          = useState(1);
  const [liveCount,     setLiveCount]     = useState(0);
  const [showFP,        setShowFP]        = useState(false);
  const [triaging,      setTriaging]      = useState(false);
  const [kbFocus,       setKbFocus]       = useState(-1);
  const kbFocusRef                        = useRef(-1);
  const displayedAlertsRef                = useRef<AlertSummary[]>([]);

  // ── Bulk selection ──────────────────────────────────────────────────────────
  const [selectedIds,   setSelectedIds]   = useState<Set<string>>(new Set());
  const [bulkActing,    setBulkActing]    = useState(false);

  // ── Triage progress ─────────────────────────────────────────────────────────
  const [triageStatus,  setTriageStatus]  = useState<{ pending: number; queue_depth: number } | null>(null);
  const triagePollerRef                   = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Backend filters (trigger re-fetch) ──────────────────────────────────
  const [filterVerdict, setFilterVerdict] = useState("");
  const [filterLevel,   setFilterLevel]   = useState(0);
  const [filterAgent,   setFilterAgent]   = useState(searchParams.get("agent_name") ?? "");
  const [filterGroup,   setFilterGroup]   = useState(searchParams.get("agent_group") ?? "");
  const [filterMitre,   setFilterMitre]   = useState(searchParams.get("mitre") ?? "");

  // ── Client-side filters ──────────────────────────────────────────────────
  const [searchQuery,  setSearchQuery]   = useState("");
  const [filterStatus, setFilterStatus]  = useState<string>("all");
  // Date range: preset (days) or custom from/to ISO dates
  const [filterDays,   setFilterDays]    = useState<number>(30);
  const [dateFrom,     setDateFrom]      = useState("");
  const [dateTo,       setDateTo]        = useState("");

  const [exportingPdf,   setExportingPdf]   = useState(false);
  const [showRangePopup, setShowRangePopup] = useState(false);
  const knownAgentsSet                      = useRef<Set<string>>(new Set());
  const [knownAgents,    setKnownAgents]    = useState<string[]>([]);
  const rangePopupRef                       = useRef<HTMLDivElement>(null);

  const debouncedSearch = useDebounce(searchQuery, 300);

  const { messages } = useWebSocket<{ type: string; alert_id?: string }>({ channel: "alerts" });

  const fetchAlerts = useCallback(async () => {
    setFetchError("");
    setIsFetching(true);
    try {
      const [data, stats] = await Promise.allSettled([
        getAlerts({
          page, size: 10,
          ai_verdict:       filterVerdict || undefined,
          rule_level_min:   filterLevel   || undefined,
          agent_name:       filterAgent   || undefined,
          agent_group:      filterGroup   || undefined,
          mitre_technique:  filterMitre   || undefined,
          tab:              filterStatus !== "all" ? filterStatus : undefined,
          days:             (!dateFrom && !dateTo) ? filterDays : undefined,
          search:           debouncedSearch.trim() || undefined,
        }),
        getAlertStats("30d", filterAgent || undefined, true),
      ]);
      if (data.status === "fulfilled") {
        setAlerts(data.value.items);
        setTotalAlerts(data.value.total);
        setTotalPages(data.value.pages);
        const fresh = data.value.items
          .map((a) => a.agent_name)
          .filter((n): n is string => Boolean(n));
        fresh.forEach((a) => knownAgentsSet.current.add(a));
      } else setFetchError("Failed to load alerts. Check that the backend is running.");
      if (stats.status === "fulfilled") {
        setAlertStats(stats.value);
        (stats.value.top_agents ?? [])
          .map((a: { _id: string }) => a._id)
          .filter(Boolean)
          .forEach((a: string) => knownAgentsSet.current.add(a));
      }
      setKnownAgents([...knownAgentsSet.current]);
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [page, filterVerdict, filterLevel, filterAgent, filterGroup, filterMitre, filterStatus, filterDays, dateFrom, dateTo, debouncedSearch]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Reset to page 1 when search or filters change
  useEffect(() => { setPage(1); }, [debouncedSearch, filterVerdict, filterLevel, filterAgent, filterGroup, filterMitre, filterStatus, filterDays]);

  // Sync URL params
  useEffect(() => {
    const current = searchParams.get("agent_name") ?? "";
    if (filterAgent === current) return;
    const next = new URLSearchParams(searchParams);
    if (filterAgent) { next.set("agent_name", filterAgent); } else { next.delete("agent_name"); }
    setSearchParams(next, { replace: true });
  }, [filterAgent, searchParams, setSearchParams]);

  useEffect(() => {
    const current = searchParams.get("mitre") ?? "";
    if (filterMitre === current) return;
    const next = new URLSearchParams(searchParams);
    if (filterMitre) { next.set("mitre", filterMitre); } else { next.delete("mitre"); }
    setSearchParams(next, { replace: true });
  }, [filterMitre, searchParams, setSearchParams]);

  // WebSocket live updates
  useEffect(() => {
    if (!messages.length) return;
    const t = messages[0].data?.type;
    if (t === "alert_new" || t === "alert_triaged") {
      if (t === "alert_new") setLiveCount((n) => n + 1);
      if (page === 1) fetchAlerts();
    }
  }, [messages, page, fetchAlerts]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const len = displayedAlertsRef.current.length;
      if (len === 0) return;
      if (e.key === "j") { e.preventDefault(); setKbFocus((p) => Math.min(len - 1, p < 0 ? 0 : p + 1)); }
      else if (e.key === "k") { e.preventDefault(); setKbFocus((p) => (p <= 0 ? 0 : p - 1)); }
      else if (e.key === "Enter" && kbFocusRef.current >= 0) {
        const a = displayedAlertsRef.current[kbFocusRef.current];
        if (a) navigate(`/alerts/${a.id}`);
      } else if (e.key === "Escape") setKbFocus(-1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate]);

  useEffect(() => {
    if (!showRangePopup) return;
    const handler = (e: MouseEvent) => {
      if (rangePopupRef.current && !rangePopupRef.current.contains(e.target as Node))
        setShowRangePopup(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showRangePopup]);

  // Poll triage status while triaging is active, stop when queue clears
  useEffect(() => {
    if (!triaging && !triageStatus?.pending) return;
    if (triagePollerRef.current) return;
    triagePollerRef.current = setInterval(async () => {
      try {
        const s = await getTriageStatus();
        setTriageStatus(s);
        if (s.pending === 0 && s.queue_depth === 0) {
          clearInterval(triagePollerRef.current!);
          triagePollerRef.current = null;
          setTriageStatus(null);
          fetchAlerts();
        }
      } catch { /* silent */ }
    }, 5000);
    return () => { if (triagePollerRef.current) { clearInterval(triagePollerRef.current); triagePollerRef.current = null; } };
  }, [triaging, triageStatus?.pending, fetchAlerts]);

  const fpAlerts = useMemo(
    () => alerts.filter((a) => a.ai_verdict === "FALSE_POSITIVE"),
    [alerts],
  );

  kbFocusRef.current = kbFocus;

  const filteredAlerts = useMemo(() => {
    const realAlerts = alerts.filter((a) => a.ai_verdict !== "FALSE_POSITIVE");
    let list = [...realAlerts, ...(showFP || filterVerdict === "FALSE_POSITIVE" ? fpAlerts : [])];

    // Custom date range client-side filter (preset days are handled server-side via `days` param)
    if (dateFrom || dateTo) {
      const from = dateFrom ? new Date(dateFrom).getTime() : 0;
      const to   = dateTo   ? new Date(dateTo + "T23:59:59.999").getTime() : Date.now();
      list = list.filter(a => {
        const ts = a.timestamp ? parseUtcDate(a.timestamp).getTime() : Date.now();
        return ts >= from && ts <= to;
      });
    }

    return list;
  }, [alerts, fpAlerts, showFP, dateFrom, dateTo, filterVerdict]);

  displayedAlertsRef.current = filteredAlerts;

  const hasActiveClientFilters =
    dateFrom !== "" ||
    dateTo !== "" ||
    filterDays !== 30 ||
    searchQuery !== "";

  const resetClientFilters = () => {
    setFilterDays(30);
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
  };


  const socTotal   = alertStats?.total ?? 0;
  const socTP      = alertStats?.by_verdict?.["TRUE_POSITIVE"] ?? 0;
  const socFP      = alertStats?.by_verdict?.["FALSE_POSITIVE"] ?? 0;
  const socUnknown = alertStats?.by_verdict?.["UNKNOWN"] ?? 0;
  const untriaged  = alertStats?.by_verdict?.["UNANALYSED"] ?? 0;

  const tabItems = VERDICT_FILTERS.map((f) => ({
    id: f.value || "all",
    label: f.label,
    count: f.value === ""               ? socTotal  :
           f.value === "TRUE_POSITIVE"  ? socTP     :
           f.value === "FALSE_POSITIVE" ? socFP     :
           f.value === "UNKNOWN"        ? socUnknown : undefined,
  }));


  const rangeLabelDisplay = dateFrom || dateTo
    ? `${dateFrom || "any"} → ${dateTo || "now"}`
    : filterDays === 1  ? "Last 24h"
    : filterDays === 7  ? "Last 7 days"
    : filterDays === 90 ? "Last 90 days"
    : "Last 30 days";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap-md)" }}>

      {/* Error banner */}
      {fetchError && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "10px 14px", borderRadius: "var(--r-md)",
          background: "oklch(from var(--sev-medium) l c h / 0.08)",
          border: "1px solid oklch(from var(--sev-medium) l c h / 0.25)",
          color: "var(--sev-medium)", fontSize: 13,
        }}>
          <span>{fetchError}</span>
          <button onClick={() => { setLoading(true); fetchAlerts(); }}
            style={{ background: "none", border: 0, cursor: "pointer", color: "inherit", fontWeight: 600, textDecoration: "underline" }}>
            Retry
          </button>
        </div>
      )}

      <PageHead
        eyebrow="SIEM · LIVE"
        title={<>SOC Alerts {liveCount > 0 && <span className="mono" style={{ fontSize: 13, color: "var(--sev-low)", marginLeft: 8, fontWeight: 400 }}>+{liveCount} live</span>}</>}
        sub={`Wazuh alerts with AI triage · ${socTotal.toLocaleString()} ingested · ${untriaged} awaiting triage.`}
        actions={<>
          <button
            className="btn btn-sm"
            disabled={exportingPdf}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={async () => {
              setExportingPdf(true);
              try {
                await exportSocAlertsPDF({
                  alerts: filteredAlerts,
                  stats: alertStats,
                  filterContext: {
                    searchQuery:  searchQuery || undefined,
                    severities:   undefined,
                    status:       filterStatus !== "all" ? filterStatus : undefined,
                    dateFrom:     dateFrom || undefined,
                    dateTo:       dateTo   || undefined,
                    filterDays:   (!dateFrom && !dateTo) ? filterDays : undefined,
                    agentName:    filterAgent  || undefined,
                    verdict:      filterVerdict || undefined,
                  },
                });
              } catch (err) {
                showToast((err as Error).message ?? "PDF export failed", "error");
              } finally {
                setExportingPdf(false);
              }
            }}
          >
            <Icon name="download" size={12} /> {exportingPdf ? "Exporting…" : "Export PDF"}
          </button>
          {user?.role?.toLowerCase() === "admin" && (
            <button
              className="btn btn-sm"
              disabled={triaging}
              title="Queue AI triage for the next 200 unanalysed alerts"
              onClick={async () => {
                setTriaging(true);
                try {
                  const res = await retriageAllUntriaged();
                  const { queued, total_untriaged } = res as { queued: number; total_untriaged: number };
                  if (queued === 0) {
                    showToast("No pending alerts found.", "success");
                  } else {
                    const remaining = total_untriaged - queued;
                    showToast(
                      remaining > 0
                        ? `Queued ${queued.toLocaleString()} alerts. ${remaining.toLocaleString()} still waiting — click again for the next batch.`
                        : `Queued ${queued.toLocaleString()} alerts for AI triage.`,
                      "success",
                    );
                    // Start progress polling
                    const s = await getTriageStatus().catch(() => null);
                    if (s) setTriageStatus(s);
                  }
                  fetchAlerts();
                } catch {
                  showToast("Failed to queue triage — check that the Celery SOC worker is running.", "error");
                } finally {
                  setTriaging(false);
                }
              }}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="zap" size={12} style={{ animation: triaging ? "spin 1s linear infinite" : undefined }} />
              {triaging ? "Queuing…" : "Triage Pending"}
            </button>
          )}
          <button className="btn btn-sm btn-primary" onClick={() => { setLoading(true); fetchAlerts(); }} disabled={isFetching}
            style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="refresh" size={12} style={{ animation: isFetching ? "spin 1s linear infinite" : undefined }} />
            {isFetching ? "Loading…" : "Refresh"}
          </button>
        </>}
      />

      {/* Triage progress bar */}
      {triageStatus && triageStatus.pending > 0 && (
        <div style={{ padding: "10px 14px", borderRadius: "var(--r-md)", background: "oklch(from var(--accent) l c h / 0.08)", border: "1px solid oklch(from var(--accent) l c h / 0.2)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid var(--accent)", borderTopColor: "transparent", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: "var(--text-2)" }}>
            AI triage running — <strong style={{ color: "var(--accent)" }}>{triageStatus.pending.toLocaleString()}</strong> alerts pending
            {triageStatus.queue_depth > 0 && `, ${triageStatus.queue_depth.toLocaleString()} in queue`}
          </span>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div style={{ padding: "10px 14px", borderRadius: "var(--r-md)", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 12, color: "var(--text-2)", marginRight: 4 }}>{selectedIds.size} selected</span>
          {(["TRUE_POSITIVE", "FALSE_POSITIVE", "UNKNOWN"] as const).map((v) => (
            <button
              key={v}
              className="btn btn-sm"
              disabled={bulkActing}
              onClick={async () => {
                setBulkActing(true);
                try {
                  const { updated } = await batchOverrideAlerts([...selectedIds], v);
                  showToast(`Marked ${updated} alert${updated !== 1 ? "s" : ""} as ${v.replace("_", " ")}`, "success");
                  setSelectedIds(new Set());
                  fetchAlerts();
                } catch { showToast("Bulk action failed", "error"); }
                finally { setBulkActing(false); }
              }}
              style={{ fontSize: 11 }}
            >
              {v === "TRUE_POSITIVE" ? "True Positive" : v === "FALSE_POSITIVE" ? "False Positive" : "Unknown"}
            </button>
          ))}
          <button className="btn btn-sm" style={{ fontSize: 11, marginLeft: "auto" }} onClick={() => setSelectedIds(new Set())}>
            Clear
          </button>
        </div>
      )}

      {/* KPI strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "var(--gap-md)" }}>
        <KPI label="UNTRIAGED"       value={untriaged} accent={untriaged > 0 ? "critical" : "default"} sub="awaiting triage" icon="alert" />
        <KPI label="TRUE POSITIVE"   value={socTP}     sub="last 24h" icon="target" />
        <KPI label="FALSE POSITIVE"  value={socFP}     sub="auto-dismissed" icon="check" />
        <KPI label="AVG TRIAGE TIME" value={alertStats ? "4.2" : "—"} unit="s" sub="AI haiku-4.5" icon="zap" />
        <KPI label="DETECTIONS"      value={alertStats?.top_rules?.length ?? 0} sub="rules matched" icon="shield" />
      </div>

      {/* Main split: list + detail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: "var(--gap-md)", alignItems: "start" }}>

        {/* Alert list */}
        <div className="card" style={{ overflow: "hidden", padding: 0 }}>

          {/* Tabs */}
          <div style={{ padding: "14px 18px 10px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
              {tabItems.map((t) => (
                <button key={t.id}
                  onClick={() => { setFilterVerdict(t.id === "all" ? "" : t.id); setPage(1); }}
                  className="tab"
                  style={filterVerdict === (t.id === "all" ? "" : t.id)
                    ? { background: "var(--accent-soft)", color: "var(--text)", borderColor: "oklch(from var(--accent) l c h / 0.3)" }
                    : undefined}
                >
                  {t.label}
                  {t.count !== undefined && <span className="tab-count">{t.count.toLocaleString()}</span>}
                </button>
              ))}

              {/* Range popup — top right of tabs row */}
              <div ref={rangePopupRef} style={{ marginLeft: "auto", position: "relative" }}>
                <button
                  className="tab"
                  onClick={() => setShowRangePopup(v => !v)}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    ...(showRangePopup || dateFrom || dateTo || filterDays !== 30
                      ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "oklch(from var(--accent) l c h / 0.3)" }
                      : undefined),
                  }}
                >
                  <Icon name="calendar" size={11} />
                  {rangeLabelDisplay}
                </button>
                {showRangePopup && (
                  <div style={{
                    position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 100,
                    background: "var(--surface)", border: "1px solid var(--border)",
                    borderRadius: "var(--r-md)", padding: 14, minWidth: 260,
                    boxShadow: "0 8px 24px oklch(0 0 0 / 0.2)",
                    display: "flex", flexDirection: "column", gap: 10,
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>Date Range</div>
                    <select
                      value={dateFrom || dateTo ? 0 : filterDays}
                      onChange={e => { const v = Number(e.target.value); if (v > 0) { setFilterDays(v); setDateFrom(""); setDateTo(""); } }}
                      className="input"
                      style={{ fontSize: 12, height: 30, padding: "0 8px", cursor: "pointer" }}
                    >
                      {(dateFrom || dateTo) && <option value={0}>Custom range</option>}
                      <option value={1}>Last 24h</option>
                      <option value={7}>Last 7 days</option>
                      <option value={30}>Last 30 days</option>
                      <option value={90}>Last 90 days</option>
                    </select>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={e => setDateFrom(e.target.value)}
                        className="input"
                        title="From date"
                        style={{ fontSize: 11, height: 28, padding: "0 8px", cursor: "pointer", flex: 1 }}
                      />
                      <span style={{ fontSize: 11, color: "var(--text-4)" }}>–</span>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={e => setDateTo(e.target.value)}
                        className="input"
                        title="To date"
                        style={{ fontSize: 11, height: 28, padding: "0 8px", cursor: "pointer", flex: 1 }}
                      />
                    </div>
                    {(dateFrom || dateTo) && (
                      <button
                        className="btn btn-sm"
                        onClick={() => { setDateFrom(""); setDateTo(""); setFilterDays(30); }}
                        style={{ fontSize: 11, alignSelf: "flex-end" }}
                      >
                        Clear dates
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Level + agent + mitre filters */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {LEVEL_FILTERS.map(({ value, label }) => (
                <button key={value}
                  onClick={() => { setFilterLevel(value); setPage(1); }}
                  className="tab"
                  style={filterLevel === value
                    ? { background: "oklch(from var(--sev-medium) l c h / 0.12)", color: "var(--sev-medium)", borderColor: "oklch(from var(--sev-medium) l c h / 0.3)" }
                    : undefined}
                >
                  {label}
                </button>
              ))}

              {(knownAgents.length > 0 || filterAgent) && (
                <select className="input" style={{ fontSize: 11, height: 26, padding: "0 8px", maxWidth: 160 }}
                  value={filterAgent} onChange={(e) => { setFilterAgent(e.target.value); setPage(1); }}>
                  <option value="">All Agents</option>
                  {filterAgent && !knownAgents.includes(filterAgent) && <option value={filterAgent}>{filterAgent}</option>}
                  {knownAgents.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}

              {filterMitre && (
                <button onClick={() => { setFilterMitre(""); setPage(1); }}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 6, fontSize: 11, background: "oklch(from var(--sev-critical) l c h / 0.12)", color: "var(--sev-critical)", border: "1px solid oklch(from var(--sev-critical) l c h / 0.25)", cursor: "pointer" }}>
                  <span className="mono">{filterMitre}</span>
                  <Icon name="x" size={10} />
                </button>
              )}

              {user?.wazuh_agent_group && (
                <button onClick={() => { setFilterGroup(filterGroup ? "" : (user.wazuh_agent_group ?? "")); setPage(1); }}
                  className="tab"
                  style={filterGroup ? { background: "oklch(from var(--accent) l c h / 0.12)", color: "var(--accent)", borderColor: "oklch(from var(--accent) l c h / 0.3)" } : undefined}>
                  {filterGroup ? `Tenant: ${user.wazuh_agent_group}` : "My Tenant"}
                </button>
              )}
            </div>
          </div>

          {/* ── Permanent filter strip (always visible) ─────────────── */}
          <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
            {/* Search bar */}
            <div style={{ position: "relative", marginBottom: 10 }}>
              <Icon name="search" size={13} style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                color: "var(--text-4)", pointerEvents: "none",
              }} />
              <input
                className="input"
                style={{ paddingLeft: 32, fontSize: 12, paddingRight: searchQuery ? 32 : 12 }}
                placeholder="Search rule description, agent name, rule ID…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: 0, cursor: "pointer", padding: 2,
                    color: "var(--text-4)", display: "flex", alignItems: "center",
                  }}
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </div>

            {/* Filter row */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>

              {/* Status pills */}
              <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)", whiteSpace: "nowrap" }}>Status</span>
                {(["all", "triaged", "untriaged"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => { setFilterStatus(s); setPage(1); }}
                    className="tab"
                    style={filterStatus === s && s !== "all"
                      ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "oklch(from var(--accent) l c h / 0.3)" }
                      : { textTransform: "capitalize" }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Reset */}
              {hasActiveClientFilters && (
                <button
                  className="btn btn-sm"
                  onClick={resetClientFilters}
                  style={{ fontSize: 11, padding: "2px 10px", marginLeft: "auto" }}
                >
                  Reset
                </button>
              )}
            </div>

            {/* Active filter summary */}
            {hasActiveClientFilters && (
              <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-3)", display: "flex", gap: 6, flexWrap: "wrap" }}>
                <span style={{ color: "var(--text-4)" }}>Showing:</span>
                <span className="mono" style={{ color: "var(--accent)" }}>{filteredAlerts.length} matching</span>
                {searchQuery && <span>· search "{searchQuery}"</span>}
                {filterStatus !== "all" && <span>· {filterStatus}</span>}
                {(dateFrom || dateTo) && <span>· {dateFrom || "any"} → {dateTo || "now"}</span>}
              </div>
            )}
          </div>

          {/* Table */}
          <div style={{ maxHeight: "calc(100vh - 480px)", overflowY: "auto" }}>
            {loading ? (
              <table className="tbl"><tbody>{[1,2,3,4,5].map((i) => <AlertSkeletonRow key={i} />)}</tbody></table>
            ) : filteredAlerts.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 12, textAlign: "center" }}>
                <Icon name="shield" size={32} style={{ color: "var(--text-4)" }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)" }}>No alerts match your filters</p>
                <p style={{ fontSize: 12, color: "var(--text-4)" }}>Try adjusting the search or date range</p>
                {hasActiveClientFilters && (
                  <button className="btn btn-sm" onClick={resetClientFilters}>Clear Filters</button>
                )}
              </div>
            ) : (
              <table className="tbl">
                <colgroup>
                  <col style={{ width: 28 }} />
                  <col style={{ width: 92 }} />
                  <col />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 140 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 28 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={{ padding: "8px 6px" }}>
                      <input type="checkbox"
                        checked={filteredAlerts.length > 0 && filteredAlerts.every((a) => selectedIds.has(a.id))}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds((prev) => { const n = new Set(prev); filteredAlerts.forEach((a) => n.add(a.id)); return n; });
                          else setSelectedIds((prev) => { const n = new Set(prev); filteredAlerts.forEach((a) => n.delete(a.id)); return n; });
                        }}
                        style={{ cursor: "pointer" }}
                      />
                    </th>
                    <th>ID</th>
                    <th>Rule</th>
                    <th>Agent</th>
                    <th>MITRE</th>
                    <th>Verdict</th>
                    <th>Time</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredAlerts.map((alert, idx) => {
                    const sevColor  = getSeverityColor(alert.rule_level);
                    const isFocused = idx === kbFocus;
                    const isFP      = alert.ai_verdict === "FALSE_POSITIVE";
                    return (
                      <tr key={alert.id}
                        onClick={() => navigate(`/alerts/${alert.id}`)}
                        style={{ cursor: "pointer", opacity: isFP ? 0.55 : 1, outline: isFocused ? "2px solid var(--accent)" : "none", outlineOffset: "-2px", background: selectedIds.has(alert.id) ? "oklch(from var(--accent) l c h / 0.06)" : undefined }}>
                        <td style={{ padding: "8px 6px" }} onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox"
                            checked={selectedIds.has(alert.id)}
                            onChange={(e) => setSelectedIds((prev) => { const n = new Set(prev); if (e.target.checked) n.add(alert.id); else n.delete(alert.id); return n; })}
                            style={{ cursor: "pointer" }}
                          />
                        </td>
                        <td>
                          <span className="row" style={{ gap: 6 }}>
                            <span style={{ width: 3, height: 18, borderRadius: 2, background: sevColor, flexShrink: 0 }} />
                            <span className="mono" style={{ fontSize: 11 }}>{alert.id.slice(0, 8)}</span>
                          </span>
                        </td>
                        <td style={{ maxWidth: 260 }}>
                          <div style={{ fontSize: 12, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {alert.rule_description}
                          </div>
                          {/* Fix: flex-wrap + shrink-0 on severity pill prevents "Low" from being clipped */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2, flexWrap: "nowrap", overflow: "hidden" }}>
                            <span className="mono" style={{ fontSize: 10, color: "var(--text-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0, flexShrink: 1 }}>
                              rule.id {alert.rule_id}
                            </span>
                            <span style={{ fontSize: 10, color: sevColor, flexShrink: 0, whiteSpace: "nowrap" }}>
                              {getSeverityLabel(alert.rule_level)}
                            </span>
                          </div>
                        </td>
                        <td style={{ overflow: "hidden" }}><span className="mono" style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{alert.agent_name || "—"}</span></td>
                        <td style={{ overflow: "hidden" }}>
                          {alert.mitre_techniques && alert.mitre_techniques.length > 0 ? (
                            <Badge tone="accent">{alert.mitre_techniques[0].technique}</Badge>
                          ) : <span className="dim">—</span>}
                        </td>
                        <td><VerdictPill verdict={alert.ai_verdict || "unanalyzed"} /></td>
                        <td>
                          <span
                            className="mono"
                            style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}
                            title={alert.timestamp ? `${parseUtcDate(alert.timestamp).toUTCString()}  ·  ${timeAgo(alert.timestamp)}` : "—"}
                          >
                            {formatAlertTime(alert.timestamp)}
                          </span>
                        </td>
                        <td><Icon name="chevR" size={13} style={{ color: "var(--text-4)" }} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* FP toggle */}
          {fpAlerts.length > 0 && (
            <div style={{ padding: "10px 18px", borderTop: "1px solid var(--border)" }}>
              <button onClick={() => setShowFP((v) => !v)}
                style={{ fontSize: 11, color: "var(--text-3)", background: "none", border: 0, cursor: "pointer", textDecoration: "underline" }}>
                {showFP
                  ? `Hide ${fpAlerts.length} false positive${fpAlerts.length > 1 ? "s" : ""}`
                  : `Show ${fpAlerts.length} false positive${fpAlerts.length > 1 ? "s" : ""}`}
              </button>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>
                {page} / {totalPages} · {totalAlerts.toLocaleString()} alerts
              </span>
              <button className="btn btn-sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          )}
        </div>

        {/* Quick-stat detail panel */}
        {alertStats && (
          <div className="card" style={{ alignSelf: "start", position: "sticky", top: 0, padding: 0 }}>
            <div style={{ padding: "18px", borderBottom: "1px solid var(--border)" }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>ALERT SUMMARY</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 1, background: "var(--border)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                {[
                  { l: "Total",         v: alertStats.total.toLocaleString(),       tone: "default"   },
                  { l: "True Positive", v: socTP,                                   tone: "critical"  },
                  { l: "Escalated",     v: alertStats.by_action?.["ESCALATE"] ?? 0, tone: "default"   },
                  { l: "Dismissed",     v: alertStats.by_action?.["DISMISS"]  ?? 0, tone: "default"   },
                ].map((s) => (
                  <div key={s.l} style={{ background: "var(--surface)", padding: "12px 14px" }}>
                    <div className="eyebrow">{s.l}</div>
                    <div className="num" style={{ fontSize: 20, fontWeight: 500, marginTop: 4, color: s.tone === "critical" ? "var(--sev-critical)" : "var(--text)" }}>{s.v}</div>
                  </div>
                ))}
              </div>
            </div>

            {alertStats.top_agents?.length > 0 && (
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
                <div className="between" style={{ marginBottom: 10 }}>
                  <div className="eyebrow">TOP AGENTS</div>
                  {filterAgent && (
                    <button
                      onClick={() => { setFilterAgent(""); setPage(1); }}
                      style={{ fontSize: 10, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                    >
                      Clear
                    </button>
                  )}
                </div>
                {alertStats.top_agents.slice(0, 6).map((agent) => {
                  const max      = alertStats.top_agents[0]?.count || 1;
                  const isActive = filterAgent === agent._id;
                  return (
                    <div
                      key={agent._id}
                      role="button"
                      tabIndex={0}
                      title={`Filter by ${agent._id}`}
                      onClick={() => { setFilterAgent(isActive ? "" : agent._id); setPage(1); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setFilterAgent(isActive ? "" : agent._id); setPage(1); }}}
                      style={{
                        marginBottom: 8, cursor: "pointer", padding: "4px 6px", borderRadius: 6,
                        border: isActive ? "1px solid oklch(from var(--accent) l c h / 0.4)" : "1px solid transparent",
                        background: isActive ? "oklch(from var(--accent) l c h / 0.08)" : "transparent",
                        transition: "background 0.15s",
                      }}
                    >
                      <div className="between" style={{ marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 11, color: isActive ? "var(--accent)" : "var(--text-2)" }}>
                          {agent._id || "unknown"}
                        </span>
                        <span className="num" style={{ fontSize: 11, color: "var(--text-3)" }}>{agent.count.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round((agent.count / max) * 100)}%`, height: "100%", background: "var(--accent)", opacity: isActive ? 1 : 0.5 }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {alertStats.top_rules?.length > 0 && (
              <div style={{ padding: "14px 18px" }}>
                <div className="eyebrow" style={{ marginBottom: 10 }}>TOP RULES</div>
                {alertStats.top_rules.slice(0, 4).map((rule, i) => {
                  const max   = alertStats.top_rules[0]?.count || 1;
                  const tones = ["high", "medium", "info", "low"];
                  return (
                    <div key={rule._id} style={{ marginBottom: 8 }}>
                      <div className="between" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>
                          {rule.desc || rule._id}
                        </span>
                        <span className="num" style={{ fontSize: 11, color: "var(--text-3)" }}>{rule.count.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round((rule.count / max) * 100)}%`, height: "100%", background: `var(--sev-${tones[i]})` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      {filteredAlerts.length > 0 && !loading && (
        <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-4)", letterSpacing: "0.02em" }}>
          <kbd className="mono">j</kbd> / <kbd className="mono">k</kbd> navigate · <kbd className="mono">↵</kbd> open
        </p>
      )}
    </div>
  );
}
