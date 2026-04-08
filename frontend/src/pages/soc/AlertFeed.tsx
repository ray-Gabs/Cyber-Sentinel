/**
 * AlertFeed — live Wazuh alert list with AI triage verdicts.
 * Fully themed with CSS variables. GitHub issue-list meets SOC dashboard.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AnimatedList } from "@/components/ui/reactbits/AnimatedList";
import { ShieldAlert, RefreshCw, ChevronRight } from "lucide-react";
import { getAlerts } from "@/services/alertService";
import { useWebSocket } from "@/hooks/useWebSocket";
import { timeAgo } from "@/lib/utils";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import type { AlertSummary } from "@/types";

// ── Severity helpers ───────────────────────────────────────────────────────
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

// ── Verdict / action badge configs ────────────────────────────────────────
const VERDICT_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  TRUE_POSITIVE:  { bg: "rgba(239,68,68,0.12)",          color: "var(--sev-critical-text)", border: "rgba(239,68,68,0.25)"          },
  FALSE_POSITIVE: { bg: "var(--color-success-dim)",       color: "var(--sev-low-text)",      border: "var(--color-success-border)"   },
  UNKNOWN:        { bg: "rgba(234,179,8,0.12)",           color: "var(--sev-medium-text)",   border: "rgba(234,179,8,0.25)"          },
};

const ACTION_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  ESCALATE: { bg: "rgba(239,68,68,0.08)",  color: "var(--sev-critical-text)", border: "rgba(239,68,68,0.2)"  },
  MONITOR:  { bg: "rgba(234,179,8,0.08)",  color: "var(--sev-medium-text)",   border: "rgba(234,179,8,0.2)"  },
  DISMISS:  { bg: "rgba(71,85,105,0.1)",   color: "var(--text-muted)",        border: "rgba(71,85,105,0.2)"  },
};

// ── Filter configs ─────────────────────────────────────────────────────────
const VERDICT_FILTERS = [
  { value: "",               label: "All Verdicts"   },
  { value: "TRUE_POSITIVE",  label: "True Positive"  },
  { value: "FALSE_POSITIVE", label: "False Positive" },
  { value: "UNKNOWN",        label: "Unknown"        },
];

const LEVEL_FILTERS = [
  { value: 0,  label: "All Levels"     },
  { value: 12, label: "Critical 12+"   },
  { value: 8,  label: "High 8+"        },
  { value: 5,  label: "Medium 5+"      },
];

// ── Animations — per-row entrance now handled by AnimatedList ─────────────

// ── Component ──────────────────────────────────────────────────────────────
export default function AlertFeed() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [alerts, setAlerts]             = useState<AlertSummary[]>([]);
  const [loading, setLoading]           = useState(true);
  const [isFetching, setIsFetching]     = useState(false);
  const [fetchError, setFetchError]     = useState("");
  const [page, setPage]                 = useState(1);
  const [filterVerdict, setFilterVerdict] = useState("");
  const [filterLevel, setFilterLevel]   = useState(0);
  const [filterAgent, setFilterAgent]   = useState(searchParams.get("agent_name") ?? "");
  const [liveCount, setLiveCount]       = useState(0);

  const { messages } = useWebSocket<AlertSummary>({ channel: "alerts" });

  const fetchAlerts = useCallback(async () => {
    setFetchError("");
    setIsFetching(true);
    try {
      const data = await getAlerts({
        page,
        size: 50,
        ai_verdict: filterVerdict || undefined,
        rule_level_min: filterLevel || undefined,
        agent_name: filterAgent || undefined,
      });
      setAlerts(data);
    } catch {
      setFetchError("Failed to load alerts. Check that the backend is running.");
    } finally {
      setLoading(false);
      setIsFetching(false);
    }
  }, [page, filterVerdict, filterLevel, filterAgent]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Merge real-time WebSocket alerts
  useEffect(() => {
    if (messages.length > 0 && page === 1) {
      const newest = messages[0]?.data;
      if (newest?.id && !alerts.some((a) => a.id === newest.id)) {
        setAlerts((prev) => [newest, ...prev].slice(0, 50));
        setLiveCount((n) => n + 1);
      }
    }
  }, [messages, alerts, page]);

  const uniqueAgents = [...new Set(alerts.map((a) => a.agent_name).filter(Boolean))];

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading alerts...</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Error banner ────────────────────────────────────────── */}
      {fetchError && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm"
          style={{ backgroundColor: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)", color: "var(--sev-medium-text)" }}
        >
          <span>{fetchError}</span>
          <button
            onClick={() => { setLoading(true); fetchAlerts(); }}
            className="shrink-0 font-medium underline underline-offset-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex items-start justify-between gap-4"
      >
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
          >
            SOC Alerts
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Wazuh alerts with AI triage
            {liveCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1" style={{ color: "var(--sev-low-text)" }}>
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                +{liveCount} live
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); fetchAlerts(); }}
          disabled={isFetching}
          className="btn-secondary shrink-0 gap-1.5"
        >
          <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
          {isFetching ? "Loading…" : "Refresh"}
        </button>
      </motion.div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="space-y-2"
      >
        {/* Verdict filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {VERDICT_FILTERS.map(({ value, label }) => {
            const active = filterVerdict === value;
            return (
              <button
                key={value}
                onClick={() => { setFilterVerdict(value); setPage(1); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                style={{
                  backgroundColor: active ? "var(--accent-dim)" : "transparent",
                  color:           active ? "var(--accent)"     : "var(--text-muted)",
                  border:          active ? "1px solid rgba(59,130,246,0.3)" : "1px solid transparent",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Level + Agent filters */}
        <div className="flex gap-1.5 flex-wrap items-center">
          {LEVEL_FILTERS.map(({ value, label }) => {
            const active = filterLevel === value;
            return (
              <button
                key={value}
                onClick={() => { setFilterLevel(value); setPage(1); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150"
                style={{
                  backgroundColor: active ? "rgba(234,179,8,0.12)" : "transparent",
                  color:           active ? "var(--sev-medium-text)" : "var(--text-muted)",
                  border:          active ? "1px solid rgba(234,179,8,0.3)" : "1px solid transparent",
                }}
              >
                {label}
              </button>
            );
          })}

          {(uniqueAgents.length > 0 || filterAgent) && (
            <select
              className="input text-xs py-1.5 w-auto"
              style={{ maxWidth: "160px" }}
              value={filterAgent}
              onChange={(e) => { setFilterAgent(e.target.value); setPage(1); }}
            >
              <option value="">All Agents</option>
              {/* Ensure URL-preselected agent appears even before results load */}
              {filterAgent && !uniqueAgents.includes(filterAgent) && (
                <option value={filterAgent}>{filterAgent}</option>
              )}
              {uniqueAgents.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          )}
        </div>
      </motion.div>

      {/* ── Alert list ──────────────────────────────────────────── */}
      {alerts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <ShieldAlert size={36} className="mb-3" style={{ color: "var(--text-subtle)" }} />
          <p
            className="text-base font-semibold"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-muted)" }}
          >
            No alerts yet
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-subtle)" }}>
            SOC alerts will appear here when Wazuh detects events
          </p>
        </div>
      ) : (
        <AnimatedList
          items={alerts}
          keyExtractor={(alert) => alert.id}
          className="space-y-2"
          renderItem={(alert) => {
            const sevColor   = getSeverityColor(alert.rule_level);
            const sevLabel   = getSeverityLabel(alert.rule_level);
            const verdictSty = alert.ai_verdict ? VERDICT_STYLE[alert.ai_verdict] : null;
            const actionSty  = alert.ai_action  ? ACTION_STYLE[alert.ai_action]   : null;

            return (
              <motion.div
                onClick={() => navigate(`/alerts/${alert.id}`)}
                className="card cursor-pointer group transition-all duration-150"
                style={{
                  padding: "1rem 1.25rem 1rem 1rem",
                  borderLeft: `3px solid ${sevColor}`,
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = sevColor;
                  (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
                  (e.currentTarget as HTMLElement).style.boxShadow = `0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)`;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.transform = "";
                  (e.currentTarget as HTMLElement).style.boxShadow = "";
                }}
              >
                <div className="flex items-start gap-4">
                  {/* Level badge */}
                  <div
                    className="w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0"
                    style={{
                      backgroundColor: `${sevColor}15`,
                      border: `1px solid ${sevColor}30`,
                    }}
                  >
                    <span
                      className="text-base font-bold tabular-nums leading-none"
                      style={{ color: sevColor, fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {alert.rule_level}
                    </span>
                    <span
                      className="text-[8px] uppercase tracking-wider mt-0.5"
                      style={{ color: sevColor, opacity: 0.7 }}
                    >
                      {sevLabel.slice(0, 3)}
                    </span>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--text-base)" }}
                    >
                      {alert.rule_description}
                    </p>

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {alert.agent_name && (
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {alert.agent_name}
                        </span>
                      )}
                      <span className="text-xs font-mono" style={{ color: "var(--text-subtle)" }}>
                        {timeAgo(alert.timestamp)}
                      </span>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--bg-muted)",
                          color: "var(--text-subtle)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        #{alert.rule_id}
                      </span>
                    </div>

                    {/* MITRE techniques */}
                    {alert.mitre_techniques && alert.mitre_techniques.length > 0 && (
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        {alert.mitre_techniques.slice(0, 3).map((t, i) => (
                          <span
                            key={t.technique ?? i}
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{
                              backgroundColor: "var(--color-purple-dim)",
                              color: "var(--color-purple-text)",
                              border: "1px solid var(--color-purple-border)",
                            }}
                          >
                            {t.technique}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: verdict + action + confidence */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {verdictSty && alert.ai_verdict && (
                      <span
                        className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: verdictSty.bg,
                          color: verdictSty.color,
                          border: `1px solid ${verdictSty.border}`,
                        }}
                      >
                        {alert.ai_verdict.replace("_", " ")}
                      </span>
                    )}

                    {actionSty && alert.ai_action && (
                      <span
                        className="text-[10px] font-medium px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: actionSty.bg,
                          color: actionSty.color,
                          border: `1px solid ${actionSty.border}`,
                        }}
                      >
                        {alert.ai_action}
                      </span>
                    )}

                    {alert.ai_confidence != null && (
                      <span className="text-[10px]" style={{ color: "var(--text-subtle)" }}>
                        {Math.round(alert.ai_confidence * 100)}% conf
                      </span>
                    )}

                    {alert.analyst_override && (
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "var(--accent-dim)",
                          color: "var(--sev-info-text)",
                          border: "1px solid rgba(59,130,246,0.2)",
                        }}
                      >
                        OVERRIDE
                      </span>
                    )}

                    {/* Arrow hint */}
                    <ChevronRight
                      size={13}
                      className="transition-transform group-hover:translate-x-0.5"
                      style={{ color: "var(--text-subtle)" }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          }}
        />
      )}

      {/* ── Pagination ──────────────────────────────────────────── */}
      {alerts.length >= 50 && (
        <div className="flex justify-center items-center gap-3 pt-2">
          <button
            className="btn-secondary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-sm tabular-nums" style={{ color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
            Page {page}
          </span>
          <button
            className="btn-secondary"
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
