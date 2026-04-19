/**
 * AlertDetail — single alert view with AI verdict, MITRE ATT&CK tags,
 * threat intel enrichment, and analyst override.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getAlert, overrideAlert, enrichAlert, getAlertPlaybooks, triggerPlaybook, PlaybookExecution } from "@/services/alertService";
import { formatDate, cn } from "@/lib/utils";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import {
  ShieldAlert,
  Brain,
  Globe,
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  Search,
  Zap,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { Alert } from "@/types";

const VERDICT_STYLES: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
  TRUE_POSITIVE: { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  FALSE_POSITIVE: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  UNKNOWN: { icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
};

export default function AlertDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [alert, setAlert] = useState<Alert | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideNotes, setOverrideNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [playbooks, setPlaybooks] = useState<PlaybookExecution[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState("");
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const [data, pbs] = await Promise.all([getAlert(id), getAlertPlaybooks(id)]);
        setAlert(data);
        setPlaybooks(pbs);
      } catch {
        setError("Alert not found");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleTriggerPlaybook = async () => {
    if (!id) return;
    setTriggering(true);
    try {
      const execution = await triggerPlaybook(id, selectedPlaybook || undefined);
      setPlaybooks((prev) => [execution, ...prev]);
      setSelectedPlaybook("");
    } catch {
      // ignore — backend returns 404 if no match
    } finally {
      setTriggering(false);
    }
  };

  const handleOverride = async () => {
    if (!id || !overrideValue) return;
    setSubmitting(true);
    try {
      const updated = await overrideAlert(id, {
        override: overrideValue,
        notes: overrideNotes || undefined,
      });
      setAlert(updated);
      setOverrideValue("");
      setOverrideNotes("");
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnrich = async () => {
    if (!id) return;
    setEnriching(true);
    try {
      const updated = await enrichAlert(id);
      setAlert(updated);
    } catch {
      // ignore
    } finally {
      setEnriching(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error || !alert) {
    return (
      <div className="py-12 text-center card">
        <p className="text-red-400">{error || "Alert not found"}</p>
        <button onClick={() => navigate("/alerts")} className="mt-4 btn-secondary">
          Back to Alerts
        </button>
      </div>
    );
  }

  const verdictInfo = alert.ai_verdict ? VERDICT_STYLES[alert.ai_verdict] : null;
  const VerdictIcon = verdictInfo?.icon ?? AlertTriangle;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <button
            onClick={() => navigate("/alerts")}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 mb-2"
          >
            <ArrowLeft size={14} /> Back to Alerts
          </button>
          <h1 className="text-2xl font-bold text-white">{alert.rule_description}</h1>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-400">
            <span>Rule {alert.rule_id}</span>
            <span>Level {alert.rule_level}</span>
            <span>Agent: {alert.agent_name} ({alert.agent_ip})</span>
            <span>{formatDate(alert.timestamp)}</span>
          </div>
        </div>
        <button
          onClick={handleEnrich}
          disabled={enriching}
          className="btn-secondary text-sm flex items-center gap-1.5"
        >
          {enriching ? <LoadingSpinner size="sm" /> : <Search size={14} />}
          Enrich
        </button>
      </div>

      {/* AI Verdict Card */}
      {alert.ai_verdict && (
        <div className={cn("card border", verdictInfo?.bg)}>
          <div className="flex items-center gap-3 mb-3">
            <Brain size={20} className="text-sentinel-400" />
            <h2 className="text-lg font-semibold text-white">AI Verdict</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Classification</p>
              <div className={cn("flex items-center gap-2 text-lg font-bold", verdictInfo?.color)}>
                <VerdictIcon size={20} />
                {alert.ai_verdict.replace("_", " ")}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Confidence</p>
              <div className="text-lg font-bold text-white">
                {alert.ai_confidence != null
                  ? `${Math.round(alert.ai_confidence * 100)}%`
                  : "N/A"}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase mb-1">Recommended Action</p>
              <div className="text-lg font-bold text-white">
                {alert.ai_action ?? "N/A"}
              </div>
            </div>
          </div>
          {alert.ai_reasoning && (
            <div className="mt-4 pt-4 border-t border-gray-700/50">
              <p className="text-xs text-gray-500 uppercase mb-1">Reasoning</p>
              <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">
                {alert.ai_reasoning}
              </p>
            </div>
          )}

          {/* Analyst override badge */}
          {alert.analyst_override && (
            <div className="mt-4 pt-4 border-t border-gray-700/50">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-blue-400" />
                <span className="text-sm font-medium text-blue-400">
                  Analyst Override: {alert.analyst_override.replace("_", " ")}
                </span>
              </div>
              {alert.analyst_notes && (
                <p className="mt-1 text-sm text-gray-400">{alert.analyst_notes}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* MITRE ATT&CK */}
      {alert.mitre_techniques && alert.mitre_techniques.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <ShieldAlert size={20} className="text-purple-400" />
            <h2 className="text-lg font-semibold text-white">MITRE ATT&CK Mapping</h2>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {alert.mitre_techniques.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-purple-500/20 bg-purple-500/5 px-3 py-2"
              >
                <div className="shrink-0">
                  <span className="text-xs font-mono font-bold text-purple-400">
                    {t.technique}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-white">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.tactic}</p>
                </div>
              </div>
            ))}
          </div>
          {alert.mitre_tactics && alert.mitre_tactics.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {alert.mitre_tactics.map((tactic) => (
                <span
                  key={tactic}
                  className="text-[10px] bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded"
                >
                  {tactic}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Threat Intel */}
      {alert.threat_intel && (
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <Globe size={20} className="text-orange-400" />
            <h2 className="text-lg font-semibold text-white">Threat Intelligence</h2>
          </div>

          {/* VirusTotal results */}
          {alert.threat_intel.virustotal && alert.threat_intel.virustotal.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-400 mb-2">VirusTotal</h3>
              <div className="space-y-2">
                {alert.threat_intel.virustotal.map((vt, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded border border-gray-700 bg-gray-800/50 px-3 py-2"
                  >
                    <div>
                      <span className="text-sm text-white font-mono">
                        {vt.ip || vt.domain}
                      </span>
                      {vt.country && (
                        <span className="ml-2 text-xs text-gray-500">{vt.country}</span>
                      )}
                      {vt.as_owner && (
                        <span className="ml-2 text-xs text-gray-500">{vt.as_owner}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-red-400">{vt.malicious} malicious</span>
                      <span className="text-yellow-400">{vt.suspicious} suspicious</span>
                      <span className="text-green-400">{vt.harmless} harmless</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AbuseIPDB results */}
          {alert.threat_intel.abuseipdb && alert.threat_intel.abuseipdb.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2">AbuseIPDB</h3>
              <div className="space-y-2">
                {alert.threat_intel.abuseipdb.map((ab, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded border border-gray-700 bg-gray-800/50 px-3 py-2"
                  >
                    <div>
                      <span className="text-sm text-white font-mono">{ab.ip}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {ab.country_code} — {ab.isp}
                      </span>
                      {ab.is_tor && (
                        <span className="ml-2 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                          TOR
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span
                        className={
                          ab.abuse_confidence >= 80
                            ? "text-red-400"
                            : ab.abuse_confidence >= 50
                            ? "text-yellow-400"
                            : "text-gray-400"
                        }
                      >
                        {ab.abuse_confidence}% abuse
                      </span>
                      <span className="text-gray-500">
                        {ab.total_reports} reports
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Raw Log */}
      <div className="card">
        <h2 className="text-sm font-semibold text-gray-400 uppercase mb-2">Full Log</h2>
        <pre className="text-xs text-gray-400 bg-gray-900 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap max-h-48">
          {alert.full_log || "No log data available"}
        </pre>
      </div>

      {/* Rule Groups */}
      {alert.rule_groups && alert.rule_groups.length > 0 && (
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-400 uppercase mb-2">Rule Groups</h2>
          <div className="flex flex-wrap gap-1">
            {alert.rule_groups.map((g) => (
              <span
                key={g}
                className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded"
              >
                {g}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Analyst Override Form */}
      <div className="card">
        <h2 className="text-lg font-semibold text-white mb-3">Analyst Override</h2>
        <p className="text-sm text-gray-500 mb-4">
          Override the AI verdict with your own classification.
        </p>
        <div className="space-y-3 max-w-md">
          <select
            className="input"
            value={overrideValue}
            onChange={(e) => setOverrideValue(e.target.value)}
          >
            <option value="">Select classification...</option>
            <option value="TRUE_POSITIVE">True Positive</option>
            <option value="FALSE_POSITIVE">False Positive</option>
          </select>
          <textarea
            className="input min-h-[80px]"
            placeholder="Notes (optional)"
            value={overrideNotes}
            onChange={(e) => setOverrideNotes(e.target.value)}
          />
          <button
            className="btn-primary text-sm"
            disabled={!overrideValue || submitting}
            onClick={handleOverride}
          >
            {submitting ? "Submitting..." : "Submit Override"}
          </button>
        </div>
      </div>

      {/* Playbook Response Engine */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Zap size={20} style={{ color: "var(--yellow)" }} />
          <h2 className="text-lg font-semibold" style={{ color: "var(--text-base)" }}>Playbook Response</h2>
        </div>

        {/* Trigger controls */}
        <div className="flex items-center gap-2 mb-4">
          <select
            className="input flex-1 max-w-xs text-sm"
            value={selectedPlaybook}
            onChange={(e) => setSelectedPlaybook(e.target.value)}
          >
            <option value="">Auto-select matching playbook</option>
            <option value="brute_force_response">Brute Force Response</option>
            <option value="web_attack_response">Web Attack Response</option>
            <option value="malware_response">Malware Detection Response</option>
            <option value="privilege_escalation_response">Privilege Escalation Response</option>
          </select>
          <button
            className="btn-secondary text-sm flex items-center gap-1.5"
            disabled={triggering}
            onClick={handleTriggerPlaybook}
          >
            {triggering ? <LoadingSpinner size="sm" /> : <Zap size={14} />}
            Trigger
          </button>
        </div>

        {/* Execution history */}
        {playbooks.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: "var(--text-muted)" }}>
            No playbooks triggered for this alert yet.
          </p>
        ) : (
          <div className="space-y-2">
            {playbooks.map((pb) => (
              <div
                key={pb.id}
                className="rounded-lg border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-elevated)" }}
              >
                <button
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                  onClick={() => setExpandedExecution(expandedExecution === pb.id ? null : pb.id)}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs px-2 py-0.5 rounded font-medium"
                      style={{
                        backgroundColor: pb.status === "completed" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                        color: pb.status === "completed" ? "var(--green)" : "var(--yellow)",
                      }}
                    >
                      {pb.status}
                    </span>
                    <span className="text-sm font-medium" style={{ color: "var(--text-base)" }}>
                      {pb.playbook_name}
                    </span>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {pb.trigger_rule}
                    </span>
                  </div>
                  {expandedExecution === pb.id
                    ? <ChevronUp size={14} style={{ color: "var(--text-muted)" }} />
                    : <ChevronDown size={14} style={{ color: "var(--text-muted)" }} />
                  }
                </button>
                {expandedExecution === pb.id && (
                  <div className="px-4 pb-3 space-y-2 border-t" style={{ borderColor: "var(--border)" }}>
                    {pb.actions.map((action) => (
                      <div key={action.step} className="flex items-start gap-3 pt-2">
                        <span
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 shrink-0"
                          style={{
                            backgroundColor: action.executed ? "rgba(34,197,94,0.15)" : "rgba(71,85,105,0.3)",
                            color: action.executed ? "var(--green)" : "var(--text-muted)",
                          }}
                        >
                          {action.step}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={{ color: "var(--text-base)" }}>{action.description}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {action.automated ? "Automated" : "Manual recommendation"}
                            </span>
                            {action.result && (
                              <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                                — {action.result}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
