/**
 * AlertDetail — single alert view with AI verdict, MITRE ATT&CK tags,
 * threat intel enrichment, and analyst override.
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getAlert, overrideAlert, enrichAlert, getAlertPlaybooks,
  triggerPlaybook, createDetectionRule, getAlertRawWazuh,
  type PlaybookExecution,
} from "@/services/alertService";
import { formatDate } from "@/lib/utils";
import { Icon, PageHead, Btn } from "@/components/ui";
import type { Alert, DetectionRuleCreate } from "@/types";

/* ── Helpers ──────────────────────────────────────────── */

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function severityFromLevel(level: number): DetectionRuleCreate["severity"] {
  if (level >= 13) return "critical";
  if (level >= 10) return "high";
  if (level >= 7)  return "medium";
  return "low";
}

function buildInitialForm(alert: Alert): DetectionRuleCreate {
  return {
    name: `From alert: ${alert.rule_description.slice(0, 50)}`,
    description: `Auto-created from Wazuh rule ${alert.rule_id} — ${alert.rule_description.slice(0, 100)}`,
    pattern: escapeRegex(alert.rule_description),
    severity: severityFromLevel(alert.rule_level),
    enabled: true,
    project_id: null,
  };
}

function buildThreatSummary(intel: NonNullable<Alert["threat_intel"]>): string {
  const vtMalicious = (intel.virustotal ?? []).filter((v) => v.malicious > 0);
  const abusiveIPs  = (intel.abuseipdb ?? []).filter((a) => a.abuse_confidence >= 50);
  const torIPs      = (intel.abuseipdb ?? []).filter((a) => a.is_tor);
  const parts: string[] = [];

  if (vtMalicious.length > 0)
    parts.push(`${vtMalicious.length} indicator${vtMalicious.length > 1 ? "s" : ""} flagged as malicious by virus scanners`);
  if (abusiveIPs.length > 0) {
    const maxConf = Math.max(...abusiveIPs.map((a) => a.abuse_confidence));
    parts.push(`${abusiveIPs.length} IP${abusiveIPs.length > 1 ? "s" : ""} with high abuse confidence (up to ${maxConf}%)`);
  }
  if (torIPs.length > 0)
    parts.push(`${torIPs.length} TOR exit node${torIPs.length > 1 ? "s" : ""} detected`);

  if (parts.length === 0) {
    const checked = (intel.virustotal?.length ?? 0) + (intel.abuseipdb?.length ?? 0);
    return checked > 0
      ? `${checked} indicator${checked > 1 ? "s" : ""} checked — no known threats found`
      : "No indicators were enriched";
  }
  return parts.join("; ");
}

function Spin({ size = 16 }: { size?: number }) {
  return (
    <div
      className="animate-spin rounded-full"
      style={{
        width: size, height: size, flexShrink: 0,
        border: "2px solid var(--border)",
        borderTopColor: "var(--accent)",
      }}
    />
  );
}

/* ── CreateRuleFromAlertModal ─────────────────────────── */

interface CreateRuleFromAlertModalProps {
  alert: Alert;
  onClose: () => void;
}

function CreateRuleFromAlertModal({ alert, onClose }: CreateRuleFromAlertModalProps) {
  const [form, setForm]           = useState<DetectionRuleCreate>(() => buildInitialForm(alert));
  const [testInput, setTestInput] = useState("");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState("");

  const testMatch = (() => {
    if (!testInput || !form.pattern) return null;
    try { return new RegExp(form.pattern).test(testInput); }
    catch { return null; }
  })();

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      await createDetectionRule(form);
      setSaved(true);
      setTimeout(onClose, 1200);
    } catch {
      setSaveError("Failed to create rule. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card w-full max-w-lg" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
        <div className="card-head between">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="plus" size={15} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold">Create Detection Rule</span>
          </div>
          <button onClick={onClose} className="btn btn-sm" style={{ padding: "4px 6px" }}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Rule Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">Rule Name</label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* Pattern */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">Pattern (regex)</label>
            <textarea
              rows={3}
              className="w-full rounded-lg border px-3 py-2 text-sm mono outline-none resize-none"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
              value={form.pattern}
              onChange={(e) => setForm((f) => ({ ...f, pattern: e.target.value }))}
            />
            <div className="rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-2)" }}>
              <p className="eyebrow" style={{ marginBottom: 4 }}>Live tester — paste a log line</p>
              <input
                className="w-full bg-transparent text-xs mono outline-none"
                style={{ color: "var(--text-1)" }}
                placeholder="e.g. sshd[1234]: Failed password for root..."
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
              />
              {testInput && (
                <p className="text-[10px] font-medium" style={{
                  marginTop: 4,
                  color: testMatch === true
                    ? "var(--sev-low)"
                    : testMatch === false
                    ? "var(--sev-critical)"
                    : "var(--text-3)",
                }}>
                  {testMatch === true ? "Match" : testMatch === false ? "No match" : "Invalid regex"}
                </p>
              )}
            </div>
          </div>

          {/* Severity */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">Severity</label>
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as DetectionRuleCreate["severity"] }))}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
          </div>

          {saveError && <p className="text-xs" style={{ color: "var(--sev-critical)" }}>{saveError}</p>}
        </div>

        <div className="between" style={{ padding: "12px var(--pad-card)", borderTop: "1px solid var(--border)" }}>
          <div />
          <div className="row" style={{ gap: 8 }}>
            <button onClick={onClose} className="btn btn-sm" disabled={saving}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || saved || !form.name || !form.pattern}
              className="btn btn-sm btn-primary row"
              style={{ gap: 6 }}
            >
              {saved
                ? <><Icon name="check" size={13} /> Saved</>
                : saving
                ? <><Spin size={13} /> Saving…</>
                : <><Icon name="plus" size={13} /> Create Rule</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Verdict config ───────────────────────────────────── */

const VERDICT: Record<string, { icon: string; color: string; bg: string }> = {
  TRUE_POSITIVE:  { icon: "xCircle",      color: "var(--sev-critical)", bg: "rgba(239,68,68,0.06)"    },
  FALSE_POSITIVE: { icon: "checkCircle",  color: "var(--sev-low)",      bg: "rgba(34,197,94,0.06)"    },
  UNKNOWN:        { icon: "alert",        color: "var(--sev-medium)",   bg: "rgba(245,158,11,0.06)"   },
  TRIAGE_FAILED:  { icon: "minusCircle",  color: "var(--text-3)",       bg: "rgba(100,116,139,0.06)"  },
};

/* ── Main component ───────────────────────────────────── */

export default function AlertDetail() {
  const { id }           = useParams<{ id: string }>();
  const navigate         = useNavigate();
  const [alert, setAlert]                       = useState<Alert | null>(null);
  const [loading, setLoading]                   = useState(true);
  const [error, setError]                       = useState("");
  const [overrideValue, setOverrideValue]       = useState("");
  const [overrideNotes, setOverrideNotes]       = useState("");
  const [submitting, setSubmitting]             = useState(false);
  const [enriching, setEnriching]               = useState(false);
  const [playbooks, setPlaybooks]               = useState<PlaybookExecution[]>([]);
  const [triggering, setTriggering]             = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState("");
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null);
  const [showCreateRule, setShowCreateRule]     = useState(false);
  const [wazuhRaw, setWazuhRaw]                 = useState<Record<string, unknown> | null>(null);
  const [fetchingWazuh, setFetchingWazuh]       = useState(false);
  const [wazuhFetchError, setWazuhFetchError]   = useState("");
  const [enrichError, setEnrichError]           = useState("");
  const [overrideError, setOverrideError]       = useState("");
  const [playbookError, setPlaybookError]       = useState("");

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
    setPlaybookError("");
    try {
      const execution = await triggerPlaybook(id, selectedPlaybook || undefined);
      setPlaybooks((prev) => [execution, ...prev]);
      setSelectedPlaybook("");
    } catch {
      setPlaybookError("No matching playbook found for this alert type. Try selecting one manually from the dropdown.");
    } finally { setTriggering(false); }
  };

  const handleOverride = async () => {
    if (!id || !overrideValue) return;
    setSubmitting(true);
    setOverrideError("");
    try {
      const updated = await overrideAlert(id, { override: overrideValue, notes: overrideNotes || undefined });
      setAlert(updated);
      setOverrideValue("");
      setOverrideNotes("");
    } catch {
      setOverrideError("Failed to submit override. Please try again.");
    } finally { setSubmitting(false); }
  };

  const handleFetchWazuh = async () => {
    if (!id) return;
    setFetchingWazuh(true);
    setWazuhFetchError("");
    try {
      const res = await getAlertRawWazuh(id);
      setWazuhRaw(res.alert);
    } catch {
      setWazuhFetchError("Could not fetch from Wazuh Manager — check connection settings.");
    } finally {
      setFetchingWazuh(false);
    }
  };

  const handleEnrich = async () => {
    if (!id) return;
    setEnriching(true);
    setEnrichError("");
    try {
      const updated = await enrichAlert(id);
      setAlert(updated);
    } catch {
      setEnrichError("Enrichment failed — check that VirusTotal / AbuseIPDB API keys are configured in Settings, or the target IP/domain may not be supported.");
    } finally { setEnriching(false); }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spin size={32} />
      </div>
    );
  }

  if (error || !alert) {
    return (
      <div className="card py-12 text-center">
        <p style={{ color: "var(--sev-critical)" }}>{error || "Alert not found"}</p>
        <button onClick={() => navigate("/alerts")} className="btn btn-sm" style={{ marginTop: 16 }}>
          Back to Alerts
        </button>
      </div>
    );
  }

  const v = alert.ai_verdict ? VERDICT[alert.ai_verdict] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {showCreateRule && (
        <CreateRuleFromAlertModal alert={alert} onClose={() => setShowCreateRule(false)} />
      )}

      {/* Back link */}
      <button
        onClick={() => navigate("/alerts")}
        style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontSize: 12, color: "var(--text-3)", background: "none",
          border: "none", cursor: "pointer", alignSelf: "flex-start",
        }}
      >
        <Icon name="chevL" size={14} /> Back to Alerts
      </button>

      {/* Page Header */}
      <PageHead
        eyebrow={`RULE ${alert.rule_id} · LEVEL ${alert.rule_level} · ${alert.agent_name} (${alert.agent_ip})`}
        title={alert.rule_description}
        sub={formatDate(alert.timestamp)}
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Btn size="sm" icon="plus" onClick={() => setShowCreateRule(true)}>Create Rule</Btn>
            <Btn size="sm" icon="search" loading={enriching} onClick={handleEnrich}>
              {enriching ? "Enriching…" : "Enrich"}
            </Btn>
          </div>
        }
      />

      {/* Enrich error banner */}
      {enrichError && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
        >
          <Icon name="alert" size={14} style={{ flexShrink: 0 }} />
          <span>{enrichError}</span>
          <button onClick={() => setEnrichError("")} className="ml-auto text-xs underline shrink-0" style={{ color: "#f87171" }}>
            Dismiss
          </button>
        </div>
      )}

      {/* AI Verdict */}
      {alert.ai_verdict && v && (
        <div className="card" style={{ background: v.bg }}>
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="brain" size={18} style={{ color: "var(--accent)" }} />
              <span className="font-semibold text-sm">AI Verdict</span>
            </div>
          </div>
          <div style={{
            padding: "var(--pad-card)",
            display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16,
          }}>
            <div>
              <p className="eyebrow">Classification</p>
              <div className="row" style={{ gap: 6, marginTop: 4, color: v.color, fontSize: 14, fontWeight: 600 }}>
                <Icon name={v.icon} size={17} style={{ color: v.color }} />
                {alert.ai_verdict.replace("_", " ")}
              </div>
            </div>
            <div>
              <p className="eyebrow">Confidence</p>
              <div className="num" style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                {alert.ai_confidence != null ? `${Math.round(alert.ai_confidence * 100)}%` : "N/A"}
              </div>
            </div>
            <div>
              <p className="eyebrow">Recommended Action</p>
              <div className="num" style={{ marginTop: 4, fontSize: 15, fontWeight: 600 }}>
                {alert.ai_action ?? "N/A"}
              </div>
            </div>
          </div>
          {alert.ai_reasoning && (
            <div style={{ padding: "12px var(--pad-card)", borderTop: "1px solid var(--border)" }}>
              <p className="eyebrow" style={{ marginBottom: 6 }}>Reasoning</p>
              <p className="text-sm" style={{ color: "var(--text-2)", lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                {alert.ai_reasoning}
              </p>
            </div>
          )}
          {alert.analyst_override && (
            <div style={{ padding: "12px var(--pad-card)", borderTop: "1px solid var(--border)" }}>
              <div className="row" style={{ gap: 8 }}>
                <Icon name="shield" size={15} style={{ color: "var(--accent)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--accent)" }}>
                  Analyst Override: {alert.analyst_override.replace("_", " ")}
                </span>
              </div>
              {alert.analyst_notes && (
                <p className="text-sm dim" style={{ marginTop: 4 }}>{alert.analyst_notes}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* MITRE ATT&CK */}
      {alert.mitre_techniques && alert.mitre_techniques.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="layers" size={16} style={{ color: "#a78bfa" }} />
              <span className="font-semibold text-sm">MITRE ATT&CK Mapping</span>
            </div>
          </div>
          <div style={{ padding: "var(--pad-card)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
              {alert.mitre_techniques.map((t, i) => (
                <div
                  key={i}
                  className="row"
                  style={{
                    gap: 12, padding: "8px 12px", borderRadius: 8,
                    border: "1px solid rgba(167,139,250,0.2)",
                    background: "rgba(167,139,250,0.05)",
                  }}
                >
                  <span className="mono text-xs font-bold" style={{ color: "#a78bfa", whiteSpace: "nowrap" }}>
                    {t.technique}
                  </span>
                  <div>
                    <p className="text-sm" style={{ color: "var(--text-1)" }}>{t.name}</p>
                    <p className="text-xs dim">{t.tactic}</p>
                  </div>
                </div>
              ))}
            </div>
            {alert.mitre_tactics && alert.mitre_tactics.length > 0 && (
              <div className="row" style={{ flexWrap: "wrap", gap: 4, marginTop: 12 }}>
                {alert.mitre_tactics.map((tactic) => (
                  <span
                    key={tactic}
                    style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 4,
                      background: "rgba(167,139,250,0.1)", color: "#c4b5fd",
                      border: "1px solid rgba(167,139,250,0.2)",
                    }}
                  >
                    {tactic}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Threat Intel */}
      {alert.threat_intel && (
        <div className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="globe" size={16} style={{ color: "#fb923c" }} />
              <span className="font-semibold text-sm">Threat Intelligence</span>
            </div>
          </div>
          {/* Plain-language summary for quick understanding */}
          <div style={{ padding: "10px var(--pad-card)", borderBottom: "1px solid var(--border)", background: "rgba(251,146,60,0.05)" }}>
            <p className="text-sm" style={{ color: "var(--text-2)" }}>
              <span style={{ fontWeight: 600, color: "#fb923c" }}>Summary: </span>
              {buildThreatSummary(alert.threat_intel)}
            </p>
          </div>
          <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 16 }}>
            {alert.threat_intel.virustotal && alert.threat_intel.virustotal.length > 0 && (
              <div>
                <p className="eyebrow" style={{ marginBottom: 8 }}>VirusTotal</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {alert.threat_intel.virustotal.map((vt, i) => (
                    <div
                      key={i}
                      className="between"
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)" }}
                    >
                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <span className="mono text-sm">{vt.ip || vt.domain}</span>
                        {vt.country  && <span className="dim text-xs">{vt.country}</span>}
                        {vt.as_owner && <span className="dim text-xs">{vt.as_owner}</span>}
                      </div>
                      <div className="row" style={{ gap: 12, flexShrink: 0 }}>
                        <span className="text-xs" style={{ color: "var(--sev-critical)" }}>{vt.malicious} malicious</span>
                        <span className="text-xs" style={{ color: "var(--sev-medium)" }}>{vt.suspicious} suspicious</span>
                        <span className="text-xs" style={{ color: "var(--sev-low)" }}>{vt.harmless} harmless</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {alert.threat_intel.abuseipdb && alert.threat_intel.abuseipdb.length > 0 && (
              <div>
                <p className="eyebrow" style={{ marginBottom: 8 }}>AbuseIPDB</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {alert.threat_intel.abuseipdb.map((ab, i) => (
                    <div
                      key={i}
                      className="between"
                      style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)" }}
                    >
                      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                        <span className="mono text-sm">{ab.ip}</span>
                        <span className="dim text-xs">{ab.country_code} — {ab.isp}</span>
                        {ab.is_tor && (
                          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(239,68,68,0.15)", color: "var(--sev-critical)" }}>
                            TOR
                          </span>
                        )}
                      </div>
                      <div className="row" style={{ gap: 12, flexShrink: 0 }}>
                        <span className="text-xs" style={{
                          color: ab.abuse_confidence >= 80
                            ? "var(--sev-critical)"
                            : ab.abuse_confidence >= 50
                            ? "var(--sev-medium)"
                            : "var(--text-3)",
                        }}>
                          {ab.abuse_confidence}% abuse
                        </span>
                        <span className="text-xs dim">{ab.total_reports} reports</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raw Log */}
      <div className="card">
        <div className="card-head between">
          <span className="eyebrow">Full Log</span>
          <button
            onClick={handleFetchWazuh}
            disabled={fetchingWazuh}
            className="btn btn-sm row"
            style={{ gap: 6 }}
          >
            {fetchingWazuh ? <Spin size={12} /> : <Icon name="refresh" size={12} />}
            Fetch from Wazuh
          </button>
        </div>
        <div style={{ padding: "var(--pad-card)" }}>
          {alert.full_log ? (
            <pre className="text-xs mono" style={{ color: "var(--text-3)", background: "var(--bg-2)", borderRadius: 8, padding: 16, overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 192 }}>
              {alert.full_log}
            </pre>
          ) : (
            <p className="text-xs italic" style={{ color: "var(--text-4)", background: "var(--bg-2)", borderRadius: 8, padding: 16 }}>
              No raw log captured for this alert type — see Structured Event Data below or fetch from Wazuh.
            </p>
          )}
          {wazuhFetchError && (
            <p className="text-xs" style={{ color: "var(--sev-critical)", marginTop: 8 }}>{wazuhFetchError}</p>
          )}
          {wazuhRaw && (
            <div style={{ marginTop: 12 }}>
              <p className="eyebrow" style={{ marginBottom: 4 }}>Live Wazuh API Response</p>
              <pre className="text-xs mono" style={{ color: "#86efac", background: "var(--bg-2)", borderRadius: 8, padding: 16, overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 384 }}>
                {JSON.stringify(wazuhRaw, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Structured Event Data */}
      {alert.data && Object.keys(alert.data).length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="database" size={16} style={{ color: "#22d3ee" }} />
              <span className="eyebrow">Structured Event Data</span>
            </div>
          </div>
          <div style={{ padding: "var(--pad-card)" }}>
            <pre className="text-xs mono" style={{ color: "#67e8f9", background: "var(--bg-2)", borderRadius: 8, padding: 16, overflowX: "auto", whiteSpace: "pre-wrap", maxHeight: 256 }}>
              {JSON.stringify(alert.data, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Extracted IOCs */}
      {alert.iocs && Object.values(alert.iocs).some((v) => v && v.length > 0) && (
        <div className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="target" size={16} style={{ color: "var(--sev-critical)" }} />
              <span className="eyebrow">Extracted IOCs</span>
            </div>
          </div>
          <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 12 }}>
            {(["ips", "domains", "hashes", "users", "processes", "files"] as const).map((kind) => {
              const items = alert.iocs?.[kind];
              if (!items || items.length === 0) return null;
              return (
                <div key={kind}>
                  <p className="eyebrow" style={{ marginBottom: 6 }}>{kind}</p>
                  <div className="row" style={{ flexWrap: "wrap", gap: 4 }}>
                    {items.map((item) => (
                      <span
                        key={item}
                        className="mono text-xs"
                        style={{ padding: "2px 8px", borderRadius: 4, background: "rgba(239,68,68,0.1)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.2)" }}
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Response Recommendations */}
      {alert.response_recommendations && alert.response_recommendations.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="check" size={16} style={{ color: "var(--accent)" }} />
              <span className="eyebrow">Response Recommendations</span>
            </div>
          </div>
          <div style={{ padding: "var(--pad-card)" }}>
            <ol style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {alert.response_recommendations.map((rec, i) => (
                <li key={i} className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                    background: "rgba(59,130,246,0.15)", color: "var(--accent)",
                    fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center",
                  }}>
                    {i + 1}
                  </span>
                  <span className="text-sm" style={{ color: "var(--text-2)" }}>{rec}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {/* False Positive Indicators */}
      {alert.false_positive_indicators && alert.false_positive_indicators.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <Icon name="checkCircle" size={16} style={{ color: "var(--sev-low)" }} />
              <span className="eyebrow">False Positive Indicators</span>
            </div>
          </div>
          <div style={{ padding: "var(--pad-card)" }}>
            <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {alert.false_positive_indicators.map((ind, i) => (
                <li key={i} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--sev-low)", flexShrink: 0, marginTop: 7 }} />
                  <span className="text-sm" style={{ color: "var(--text-2)" }}>{ind}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Rule Groups */}
      {alert.rule_groups && alert.rule_groups.length > 0 && (
        <div className="card">
          <div className="card-head">
            <span className="eyebrow">Rule Groups</span>
          </div>
          <div style={{ padding: "var(--pad-card)" }}>
            <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
              {alert.rule_groups.map((g) => (
                <span
                  key={g}
                  className="text-xs"
                  style={{ padding: "2px 8px", borderRadius: 4, background: "var(--bg-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}
                >
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Analyst Override */}
      <div className="card">
        <div className="card-head">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="shield" size={16} style={{ color: "var(--accent)" }} />
            <span className="font-semibold text-sm">Analyst Override</span>
          </div>
        </div>
        <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
          <p className="text-sm dim">Override the AI verdict with your own classification.</p>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
            value={overrideValue}
            onChange={(e) => setOverrideValue(e.target.value)}
          >
            <option value="">Select classification...</option>
            <option value="TRUE_POSITIVE">True Positive</option>
            <option value="FALSE_POSITIVE">False Positive</option>
            <option value="UNKNOWN">Unknown / Needs Investigation</option>
          </select>
          <textarea
            rows={3}
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none resize-none"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
            placeholder="Notes (optional)"
            value={overrideNotes}
            onChange={(e) => setOverrideNotes(e.target.value)}
          />
          <Btn variant="primary" size="sm" loading={submitting} disabled={!overrideValue || submitting} onClick={handleOverride}>
            Submit Override
          </Btn>
          {overrideError && (
            <p className="text-xs" style={{ color: "var(--sev-critical)" }}>{overrideError}</p>
          )}
        </div>
      </div>

      {/* Playbook Response Engine */}
      <div className="card">
        <div className="card-head">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="zap" size={16} style={{ color: "#f59e0b" }} />
            <span className="font-semibold text-sm">Playbook Response</span>
          </div>
        </div>
        <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="row" style={{ gap: 8 }}>
            <select
              className="rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ flex: 1, maxWidth: 360, backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
              value={selectedPlaybook}
              onChange={(e) => setSelectedPlaybook(e.target.value)}
            >
              <option value="">Auto-select matching playbook</option>
              <option value="brute_force_response">Brute Force Response</option>
              <option value="web_attack_response">Web Attack Response</option>
              <option value="malware_response">Malware Detection Response</option>
              <option value="privilege_escalation_response">Privilege Escalation Response</option>
            </select>
            <Btn size="sm" icon="zap" loading={triggering} onClick={handleTriggerPlaybook}>
              Trigger
            </Btn>
          </div>

          {playbookError && (
            <div
              className="text-xs px-3 py-2.5 rounded-lg"
              style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "var(--sev-medium)" }}
            >
              {playbookError}
            </div>
          )}
          {playbooks.length === 0 ? (
            <p className="text-sm py-4 text-center dim">No playbooks triggered for this alert yet.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {playbooks.map((pb) => (
                <div key={pb.id} style={{ borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)" }}>
                  <button
                    className="w-full between"
                    style={{ padding: "10px 16px", background: "none", border: "none", cursor: "pointer" }}
                    onClick={() => setExpandedExecution(expandedExecution === pb.id ? null : pb.id)}
                  >
                    <div className="row" style={{ gap: 12 }}>
                      <span style={{
                        fontSize: 11, padding: "2px 8px", borderRadius: 4, fontWeight: 500,
                        background: pb.status === "completed" ? "rgba(34,197,94,0.1)" : "rgba(245,158,11,0.1)",
                        color: pb.status === "completed" ? "var(--sev-low)" : "var(--sev-medium)",
                      }}>
                        {pb.status}
                      </span>
                      <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{pb.playbook_name}</span>
                      <span className="text-xs dim">{pb.trigger_rule}</span>
                    </div>
                    <Icon name={expandedExecution === pb.id ? "chevU" : "chevD"} size={14} style={{ color: "var(--text-3)" }} />
                  </button>
                  {expandedExecution === pb.id && (
                    <div style={{ padding: "0 16px 12px", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
                      {pb.actions.map((action) => (
                        <div key={action.step} className="row" style={{ gap: 12, alignItems: "flex-start", paddingTop: 8 }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                            display: "grid", placeItems: "center",
                            fontSize: 10, fontWeight: 700,
                            background: action.executed ? "rgba(34,197,94,0.15)" : "rgba(71,85,105,0.3)",
                            color: action.executed ? "var(--sev-low)" : "var(--text-3)",
                          }}>
                            {action.step}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p className="text-sm" style={{ color: "var(--text-1)" }}>{action.description}</p>
                            <div className="row" style={{ gap: 8, marginTop: 2 }}>
                              <span className="text-xs dim">{action.automated ? "Automated" : "Manual recommendation"}</span>
                              {action.result && (
                                <span className="text-xs mono dim">— {action.result}</span>
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
    </div>
  );
}
