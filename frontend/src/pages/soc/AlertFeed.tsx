import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getAlerts, getAlertStats, retriageAllUntriaged, classifyLowPriorityAlerts } from "@/services/alertService";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuth } from "@/hooks/useAuth";
import { timeAgo, showToast, formatAlertTime } from "@/lib/utils";
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

  const [alerts,        setAlerts]        = useState<AlertSummary[]>([]);
  const [alertStats,    setAlertStats]    = useState<AlertStats | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [isFetching,    setIsFetching]    = useState(false);
  const [fetchError,    setFetchError]    = useState("");
  const [page,          setPage]          = useState(1);
  const [liveCount,     setLiveCount]     = useState(0);
  const [showFP,        setShowFP]        = useState(false);
  const [triaging,      setTriaging]      = useState(false);
  const [classifying,   setClassifying]   = useState(false);
  const [kbFocus,       setKbFocus]       = useState(-1);
  const kbFocusRef                        = useRef(-1);
  const displayedAlertsRef                = useRef<AlertSummary[]>([]);

  const [filterVerdict, setFilterVerdict] = useState("");
  const [filterLevel,   setFilterLevel]   = useState(0);
  const [filterAgent,   setFilterAgent]   = useState(searchParams.get("agent_name") ?? "");
  const [filterGroup,   setFilterGroup]   = useState(searchParams.get("agent_group") ?? "");
  const [filterMitre,   setFilterMitre]   = useState(searchParams.get("mitre") ?? "");

  const [filterOpen,   setFilterOpen]   = useState(false);
  const [filterSev,    setFilterSev]    = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterDays,   setFilterDays]   = useState<number>(7);
  const [displayPage,  setDisplayPage]  = useState(1);
  const [exportingPdf, setExportingPdf] = useState(false);
  const DISPLAY_SIZE = 10;
  const knownAgentsSet                  = useRef<Set<string>>(new Set());
  const [knownAgents,  setKnownAgents]  = useState<string[]>([]);

  const { messages } = useWebSocket<{ type: string; alert_id?: string }>({ channel: "alerts" });

  const fetchAlerts = useCallback(async () => {
    setFetchError("");
    setIsFetching(true);
    try {
      const [data, stats] = await Promise.allSettled([
        getAlerts({
          page, size: 50,
          ai_verdict:       filterVerdict || undefined,
          rule_level_min:   filterLevel   || undefined,
          agent_name:       filterAgent   || undefined,
          agent_group:      filterGroup   || undefined,
          mitre_technique:  filterMitre   || undefined,
        }),
        getAlertStats(),
      ]);
      if (data.status === "fulfilled") {
        setAlerts(data.value);
        const fresh = (data.value as AlertSummary[])
          .map((a) => a.agent_name)
          .filter((n): n is string => Boolean(n));
        fresh.forEach((a) => knownAgentsSet.current.add(a));
      } else setFetchError("Failed to load alerts. Check that the backend is running.");
      if (stats.status === "fulfilled") {
        setAlertStats(stats.value);
        // Seed agent list from top_agents aggregation — covers ALL agents in the
        // DB, not just those that appear in the current 50-alert page.
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
  }, [page, filterVerdict, filterLevel, filterAgent, filterGroup, filterMitre]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Sync agent filter to URL
  useEffect(() => {
    const current = searchParams.get("agent_name") ?? "";
    if (filterAgent === current) return;
    const next = new URLSearchParams(searchParams);
    filterAgent ? next.set("agent_name", filterAgent) : next.delete("agent_name");
    setSearchParams(next, { replace: true });
  }, [filterAgent, searchParams, setSearchParams]);

  // Sync MITRE filter to URL
  useEffect(() => {
    const current = searchParams.get("mitre") ?? "";
    if (filterMitre === current) return;
    const next = new URLSearchParams(searchParams);
    filterMitre ? next.set("mitre", filterMitre) : next.delete("mitre");
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

  const realAlerts   = alerts.filter((a) => a.ai_verdict !== "FALSE_POSITIVE");
  const fpAlerts     = alerts.filter((a) => a.ai_verdict === "FALSE_POSITIVE");
  const displayedAlerts = [...realAlerts, ...(showFP || filterVerdict === "FALSE_POSITIVE" ? fpAlerts : [])];
  kbFocusRef.current          = kbFocus;
  displayedAlertsRef.current  = displayedAlerts;

  const filteredAlerts = useMemo(() => {
    let list = displayedAlerts;
    if (filterSev.length > 0) {
      list = list.filter(a => {
        const label = getSeverityLabel(a.rule_level).toLowerCase();
        return filterSev.includes(label);
      });
    }
    if (filterStatus === "triaged")   list = list.filter(a => a.ai_verdict && a.ai_verdict !== "UNANALYZED");
    if (filterStatus === "untriaged") list = list.filter(a => !a.ai_verdict || a.ai_verdict === "UNANALYZED");
    // Skip the date cutoff when a verdict tab is active — verdict filters are
    // all-time (matching the tab counts from alertStats), so hiding old results
    // would show 0 alerts even though the tab count says otherwise.
    if (!filterVerdict) {
      const cutoff = Date.now() - filterDays * 86400000;
      list = list.filter(a => new Date(a.timestamp ?? 0).getTime() >= cutoff);
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts, showFP, filterSev, filterStatus, filterDays, filterVerdict]);

  // Reset display page when filters change
  useEffect(() => { setDisplayPage(1); }, [filterVerdict, filterLevel, filterAgent, filterGroup, filterMitre, filterSev, filterStatus, filterDays, showFP]);

  const totalDisplayPages = Math.max(1, Math.ceil(filteredAlerts.length / DISPLAY_SIZE));
  const pagedAlerts       = filteredAlerts.slice((displayPage - 1) * DISPLAY_SIZE, displayPage * DISPLAY_SIZE);

  const socTotal     = alertStats?.total ?? 0;
  const socTP        = alertStats?.by_verdict?.["TRUE_POSITIVE"] ?? 0;
  const socFP        = alertStats?.by_verdict?.["FALSE_POSITIVE"] ?? 0;
  const socUnknown   = alertStats?.by_verdict?.["UNKNOWN"] ?? 0;
  const untriaged    = alertStats?.by_verdict?.["UNANALYSED"] ?? 0;

  const tabItems = VERDICT_FILTERS.map((f) => ({
    id: f.value || "all",
    label: f.label,
    count: f.value === ""               ? socTotal  :
           f.value === "TRUE_POSITIVE"  ? socTP     :
           f.value === "FALSE_POSITIVE" ? socFP     :
           f.value === "UNKNOWN"        ? socUnknown : undefined,
  }));

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
            onClick={() => setFilterOpen(f => !f)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              ...(filterSev.length > 0 || filterStatus !== "all"
                ? { background: "var(--accent-soft)", color: "var(--accent)", borderColor: "oklch(from var(--accent) l c h / 0.3)" }
                : {}),
            }}
          >
            <Icon name="filter" size={12} />
            Filters
            {(filterSev.length > 0 || filterStatus !== "all") && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }} />
            )}
          </button>
          <button
            className="btn btn-sm"
            disabled={exportingPdf}
            style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={async () => {
              setExportingPdf(true);
              try {
                await exportSocAlertsPDF({ alerts: filteredAlerts, stats: alertStats });
              } catch (err) {
                showToast((err as Error).message ?? "PDF export failed", "error");
              } finally {
                setExportingPdf(false);
              }
            }}
          >
            <Icon name="download" size={12} /> {exportingPdf ? "Exporting…" : "Export"}
          </button>
          {user?.role?.toLowerCase() === "admin" && (<>
            <button
              className="btn btn-sm"
              disabled={classifying}
              title="One-time fix: mark all rule_level < 4 alerts as LOW PRIORITY (instant DB update)"
              onClick={async () => {
                setClassifying(true);
                try {
                  const r = await classifyLowPriorityAlerts();
                  alert(`Marked ${r.updated.toLocaleString()} low-level alerts as LOW PRIORITY. Refresh to see updated counts.`);
                  fetchAlerts();
                } catch { alert("Failed — check backend logs."); }
                finally { setClassifying(false); }
              }}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="filter" size={12} style={{ animation: classifying ? "spin 1s linear infinite" : undefined }} />
              {classifying ? "Classifying…" : "Fix Historical"}
            </button>
            <button
              className="btn btn-sm"
              disabled={triaging}
              title="Queue all unanalysed rule_level ≥ 4 alerts for AI triage"
              onClick={async () => {
                setTriaging(true);
                try {
                  const r = await retriageAllUntriaged();
                  alert(`Queued ${r.queued.toLocaleString()} alerts for triage. Results will appear as the worker processes them.`);
                } catch { alert("Failed to queue triage — check backend logs."); }
                finally { setTriaging(false); }
              }}
              style={{ display: "flex", alignItems: "center", gap: 6 }}
            >
              <Icon name="zap" size={12} style={{ animation: triaging ? "spin 1s linear infinite" : undefined }} />
              {triaging ? "Queuing…" : "Triage Pending"}
            </button>
          </>)}
          <button className="btn btn-sm btn-primary" onClick={() => { setLoading(true); fetchAlerts(); }} disabled={isFetching}
            style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="refresh" size={12} style={{ animation: isFetching ? "spin 1s linear infinite" : undefined }} />
            {isFetching ? "Loading…" : "Refresh"}
          </button>
        </>}
      />

      {filterOpen && (
        <div className="card p-4" style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start", padding: "16px 18px" }}>
          {/* Severity */}
          <div>
            <p className="text-xs font-semibold mb-2" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 8 }}>Severity</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["critical", "high", "medium", "low"].map(sev => (
                <label key={sev} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={filterSev.includes(sev)}
                    onChange={e => setFilterSev(e.target.checked ? [...filterSev, sev] : filterSev.filter(s => s !== sev))}
                  />
                  <span style={{ textTransform: "capitalize" }}>{sev}</span>
                </label>
              ))}
            </div>
          </div>
          {/* Status */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 8 }}>Status</p>
            <div style={{ display: "flex", gap: 12 }}>
              {["all", "triaged", "untriaged"].map(s => (
                <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 12 }}>
                  <input type="radio" name="alert-status" checked={filterStatus === s} onChange={() => setFilterStatus(s)} />
                  <span style={{ textTransform: "capitalize" }}>{s}</span>
                </label>
              ))}
            </div>
          </div>
          {/* Date range */}
          <div>
            <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-2)", marginBottom: 8 }}>Date Range</p>
            <select
              value={filterDays}
              onChange={e => setFilterDays(Number(e.target.value))}
              className="input"
              style={{ fontSize: 12, padding: "4px 8px" }}
            >
              <option value={1}>Last 24h</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
          {/* Reset */}
          <div style={{ alignSelf: "flex-end" }}>
            <button className="btn btn-sm" onClick={() => { setFilterSev([]); setFilterStatus("all"); setFilterDays(7); }}>
              Reset
            </button>
          </div>
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
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {tabItems.map((t) => (
                <button key={t.id}
                  onClick={() => { setFilterVerdict(t.id === "all" ? "" : t.id); setPage(1); }}
                  className="tab"
                  style={filterVerdict === (t.id === "all" ? "" : t.id) ? { background: "var(--accent-soft)", color: "var(--text)", borderColor: "oklch(from var(--accent) l c h / 0.3)" } : undefined}
                >
                  {t.label}
                  {t.count !== undefined && <span className="tab-count">{t.count.toLocaleString()}</span>}
                </button>
              ))}
            </div>

            {/* Level + agent + mitre filters */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              {LEVEL_FILTERS.map(({ value, label }) => (
                <button key={value}
                  onClick={() => { setFilterLevel(value); setPage(1); }}
                  className="tab"
                  style={filterLevel === value ? { background: "oklch(from var(--sev-medium) l c h / 0.12)", color: "var(--sev-medium)", borderColor: "oklch(from var(--sev-medium) l c h / 0.3)" } : undefined}
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

          {/* Table */}
          <div style={{ maxHeight: "calc(100vh - 420px)", overflowY: "auto" }}>
            {loading ? (
              <table className="tbl"><tbody>{[1,2,3,4,5].map((i) => <AlertSkeletonRow key={i} />)}</tbody></table>
            ) : filteredAlerts.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 0", gap: 12, textAlign: "center" }}>
                <Icon name="shield" size={32} style={{ color: "var(--text-4)" }} />
                <p style={{ fontSize: 14, fontWeight: 600, color: "var(--text-3)" }}>No alerts yet</p>
                <p style={{ fontSize: 12, color: "var(--text-4)" }}>Alerts will appear here when Wazuh detects events</p>
              </div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 92 }}>ID</th>
                    <th>Rule</th>
                    <th>Agent</th>
                    <th>MITRE</th>
                    <th>Verdict</th>
                    <th>Time</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pagedAlerts.map((alert, idx) => {
                    const sevColor  = getSeverityColor(alert.rule_level);
                    const isFocused = (displayPage - 1) * DISPLAY_SIZE + idx === kbFocus;
                    const isFP      = alert.ai_verdict === "FALSE_POSITIVE";
                    return (
                      <tr key={alert.id}
                        onClick={() => navigate(`/alerts/${alert.id}`)}
                        style={{ cursor: "pointer", opacity: isFP ? 0.55 : 1, outline: isFocused ? "2px solid var(--accent)" : "none", outlineOffset: "-2px" }}>
                        <td>
                          <span className="row" style={{ gap: 6 }}>
                            <span style={{ width: 3, height: 18, borderRadius: 2, background: sevColor, flexShrink: 0 }} />
                            <span className="mono" style={{ fontSize: 11 }}>{alert.id.slice(0, 8)}</span>
                          </span>
                        </td>
                        <td>
                          <div style={{ fontSize: 12, color: "var(--text)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {alert.rule_description}
                          </div>
                          <div className="row" style={{ gap: 6, marginTop: 2 }}>
                            <span className="mono" style={{ fontSize: 10, color: "var(--text-3)" }}>rule.id {alert.rule_id}</span>
                            <span style={{ fontSize: 10, color: sevColor }}>{getSeverityLabel(alert.rule_level)}</span>
                          </div>
                        </td>
                        <td><span className="mono" style={{ fontSize: 11 }}>{alert.agent_name || "—"}</span></td>
                        <td>
                          {alert.mitre_techniques && alert.mitre_techniques.length > 0 ? (
                            <Badge tone="accent">{alert.mitre_techniques[0].technique}</Badge>
                          ) : <span className="dim">—</span>}
                        </td>
                        <td><VerdictPill verdict={alert.ai_verdict || "unanalyzed"} /></td>
                        <td>
                          <span
                            className="mono"
                            style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap" }}
                            title={alert.timestamp ? `${new Date(alert.timestamp).toUTCString()}  ·  ${timeAgo(alert.timestamp)}` : "—"}
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
                {showFP ? `Hide ${fpAlerts.length} false positive${fpAlerts.length > 1 ? "s" : ""}` : `Show ${fpAlerts.length} false positive${fpAlerts.length > 1 ? "s" : ""}`}
              </button>
            </div>
          )}
          {/* Display pagination (10 per page) */}
          {filteredAlerts.length > DISPLAY_SIZE && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-sm" disabled={displayPage <= 1} onClick={() => setDisplayPage((p) => p - 1)}>Previous</button>
              <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>
                {displayPage} / {totalDisplayPages} · {filteredAlerts.length} alerts
              </span>
              <button
                className="btn btn-sm"
                disabled={displayPage >= totalDisplayPages && alerts.length < 50}
                onClick={() => {
                  if (displayPage < totalDisplayPages) {
                    setDisplayPage(p => p + 1);
                  } else {
                    // Exhausted current fetch — load next backend page
                    setPage(p => p + 1);
                    setDisplayPage(1);
                  }
                }}
              >Next</button>
            </div>
          )}
          {/* Backend page prev (when past first backend page and display page = 1) */}
          {page > 1 && displayPage === 1 && (
            <div style={{ padding: "6px 18px", borderTop: "1px solid var(--border)", textAlign: "center" }}>
              <button className="btn btn-sm" onClick={() => { setPage(p => p - 1); setDisplayPage(1); }}>← Previous batch</button>
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
                  { l: "Total",         v: alertStats.total.toLocaleString(),      tone: "default" },
                  { l: "True Positive", v: socTP,                                  tone: "critical" },
                  { l: "Escalated",     v: alertStats.by_action?.["ESCALATE"] ?? 0, tone: "default" },
                  { l: "Dismissed",     v: alertStats.by_action?.["DISMISS"]  ?? 0, tone: "default" },
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
                <div className="eyebrow" style={{ marginBottom: 10 }}>TOP AGENTS</div>
                {alertStats.top_agents.slice(0, 4).map((agent) => {
                  const max = alertStats.top_agents[0]?.count || 1;
                  return (
                    <div key={agent._id} style={{ marginBottom: 8 }}>
                      <div className="between" style={{ marginBottom: 4 }}>
                        <span className="mono" style={{ fontSize: 11 }}>{agent._id || "unknown"}</span>
                        <span className="num" style={{ fontSize: 11, color: "var(--text-3)" }}>{agent.count.toLocaleString()}</span>
                      </div>
                      <div style={{ height: 3, background: "var(--surface-2)", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${Math.round((agent.count / max) * 100)}%`, height: "100%", background: "var(--accent)" }} />
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
                  const max = alertStats.top_rules[0]?.count || 1;
                  const tones = ["high", "medium", "info", "low"];
                  return (
                    <div key={rule._id} style={{ marginBottom: 8 }}>
                      <div className="between" style={{ marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{rule.desc || rule._id}</span>
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
