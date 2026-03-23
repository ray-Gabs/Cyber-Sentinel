/**
 * AlertFeed — live alert list from Wazuh with AI triage verdicts.
 */
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { getAlerts } from "@/services/alertService";
import { useWebSocket } from "@/hooks/useWebSocket";
import { formatDate, timeAgo, cn } from "@/lib/utils";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import type { AlertSummary } from "@/types";

const VERDICT_COLORS: Record<string, string> = {
  TRUE_POSITIVE: "text-red-400",
  FALSE_POSITIVE: "text-green-400",
  UNKNOWN: "text-yellow-400",
};

const ACTION_BADGES: Record<string, { bg: string; text: string }> = {
  ESCALATE: { bg: "bg-red-500/10 border-red-500/30", text: "text-red-400" },
  MONITOR: { bg: "bg-yellow-500/10 border-yellow-500/30", text: "text-yellow-400" },
  DISMISS: { bg: "bg-gray-500/10 border-gray-500/30", text: "text-gray-400" },
};

function levelColor(level: number): string {
  if (level >= 12) return "text-severity-critical";
  if (level >= 8) return "text-severity-high";
  if (level >= 5) return "text-severity-medium";
  return "text-severity-low";
}

function getSeverityBorder(level: number): string {
  if (level >= 12) return "#EF4444";
  if (level >= 8)  return "#F97316";
  if (level >= 5)  return "#EAB308";
  if (level >= 1)  return "#3B82F6";
  return "#475569";
}

export default function AlertFeed() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<AlertSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filterVerdict, setFilterVerdict] = useState("");
  const [filterLevel, setFilterLevel] = useState(0);
  const [filterAgent, setFilterAgent] = useState("");

  const { messages } = useWebSocket<AlertSummary>({ channel: "alerts" });

  const fetchAlerts = useCallback(async () => {
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
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, filterVerdict, filterLevel, filterAgent]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Merge real-time alerts
  useEffect(() => {
    if (messages.length > 0 && page === 1) {
      const newest = messages[0]?.data;
      if (newest?.id && !alerts.some((a) => a.id === newest.id)) {
        setAlerts((prev) => [newest, ...prev].slice(0, 50));
      }
    }
  }, [messages]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const uniqueAgents = [...new Set(alerts.map((a) => a.agent_name).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SOC Alerts</h1>
          <p className="text-sm text-gray-500">
            Wazuh alerts with AI triage — {alerts.length} alerts
          </p>
        </div>
        <button onClick={fetchAlerts} className="btn-secondary text-sm">
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          className="input text-xs py-1.5 w-auto"
          value={filterVerdict}
          onChange={(e) => { setFilterVerdict(e.target.value); setPage(1); }}
        >
          <option value="">All Verdicts</option>
          <option value="TRUE_POSITIVE">True Positive</option>
          <option value="FALSE_POSITIVE">False Positive</option>
          <option value="UNKNOWN">Unknown</option>
        </select>

        <select
          className="input text-xs py-1.5 w-auto"
          value={filterLevel}
          onChange={(e) => { setFilterLevel(Number(e.target.value)); setPage(1); }}
        >
          <option value={0}>All Levels</option>
          <option value={5}>Level 5+</option>
          <option value={8}>Level 8+ (High)</option>
          <option value={12}>Level 12+ (Critical)</option>
        </select>

        <select
          className="input text-xs py-1.5 w-auto"
          value={filterAgent}
          onChange={(e) => { setFilterAgent(e.target.value); setPage(1); }}
        >
          <option value="">All Agents</option>
          {uniqueAgents.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Alert list */}
      {alerts.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <ShieldAlert size={36} className="mb-3" style={{ color: "var(--text-subtle)" }} />
          <p className="text-base font-semibold" style={{ fontFamily: "Syne, sans-serif", color: "var(--text-muted)" }}>
            No alerts yet
          </p>
          <p className="text-sm mt-1" style={{ color: "var(--text-subtle)" }}>
            SOC alerts will appear here when Wazuh detects events
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert) => {
            const actionInfo = alert.ai_action ? ACTION_BADGES[alert.ai_action] : null;
            return (
              <div
                key={alert.id}
                onClick={() => navigate(`/alerts/${alert.id}`)}
                className="card cursor-pointer hover:border-gray-600 transition-colors"
                style={{
                  borderLeft: `3px solid ${getSeverityBorder(alert.rule_level)}`,
                  paddingLeft: "16px",
                }}
              >
                <div className="flex items-start gap-4">
                  {/* Level badge */}
                  <div className="text-center shrink-0 w-12">
                    <div className={cn("text-xl font-bold flex items-center justify-center gap-1", levelColor(alert.rule_level))}>
                      <span
                        style={{
                          display: "inline-block",
                          width: "6px",
                          height: "6px",
                          borderRadius: "50%",
                          backgroundColor: getSeverityBorder(alert.rule_level),
                          flexShrink: 0,
                          verticalAlign: "middle",
                        }}
                      />
                      {alert.rule_level}
                    </div>
                    <div className="text-[10px] text-gray-500 uppercase">level</div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-white truncate">
                        {alert.rule_description}
                      </span>
                      <span className="text-xs text-gray-600 bg-gray-800 px-1.5 py-0.5 rounded">
                        Rule {alert.rule_id}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
                      <span>{alert.agent_name}</span>
                      <span title={formatDate(alert.timestamp)}>{timeAgo(alert.timestamp)}</span>
                      {alert.mitre_techniques && alert.mitre_techniques.length > 0 && (
                        <div className="flex gap-1">
                          {alert.mitre_techniques.slice(0, 3).map((t, i) => (
                            <span
                              key={i}
                              className="bg-purple-500/10 border border-purple-500/30 text-purple-400 px-1.5 py-0.5 rounded text-[10px]"
                            >
                              {t.technique}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Verdict + Action */}
                  <div className="flex items-center gap-3 shrink-0">
                    {alert.ai_verdict && (
                      <div className="text-right">
                        <div className={cn("text-xs font-medium", VERDICT_COLORS[alert.ai_verdict] ?? "text-gray-400")}>
                          {alert.ai_verdict.replace("_", " ")}
                        </div>
                        {alert.ai_confidence != null && (
                          <div className="text-[10px] text-gray-600">
                            {Math.round(alert.ai_confidence * 100)}% conf
                          </div>
                        )}
                      </div>
                    )}
                    {actionInfo && alert.ai_action && (
                      <span className={cn("text-[10px] font-medium border px-2 py-1 rounded", actionInfo.bg, actionInfo.text)}>
                        {alert.ai_action}
                      </span>
                    )}
                    {alert.analyst_override && (
                      <span className="text-[10px] font-medium border border-blue-500/30 bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
                        OVERRIDE
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {alerts.length >= 50 && (
        <div className="flex justify-center gap-3">
          <button
            className="btn-secondary text-sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="text-sm text-gray-400 self-center">Page {page}</span>
          <button
            className="btn-secondary text-sm"
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
