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
import { getSocProjects, type SocProject } from "@/services/socService";
import { formatDate } from "@/lib/utils";
import { Icon, PageHead, Btn } from "@/components/ui";
import type { Alert, DetectionRuleCreate } from "@/types";

/* ── Helpers ──────────────────────────────────────────── */

function severityFromLevel(level: number): DetectionRuleCreate["severity"] {
  if (level >= 13) return "critical";
  if (level >= 10) return "high";
  if (level >= 7)  return "medium";
  return "low";
}

function isValidRegex(p: string): boolean {
  try { new RegExp(p); return true; }
  catch { return false; }
}

type PatternMode = "groups" | "terms" | "ruleid" | "custom";

const STOP_WORDS = new Set([
  "from", "the", "a", "an", "of", "to", "for", "in", "at", "by", "or", "and",
  "on", "with", "as", "is", "be", "was", "are", "has", "have", "this", "that",
  "not", "no", "its", "via", "due", "too", "but", "when",
]);

function extractKeyTerms(description: string): string {
  const words = description.toLowerCase()
    .split(/[\s,._\-:;()[\]{}'"/\\|]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));
  const unique = [...new Set(words)];
  return unique.slice(0, 6).join("|") || description.trim();
}

function patternForMode(mode: PatternMode, alert: Alert): string {
  switch (mode) {
    case "groups": {
      const groups = (alert.rule_groups ?? []).filter((g) => g.length > 2);
      return groups.length > 0 ? groups.join("|") : extractKeyTerms(alert.rule_description);
    }
    case "terms":
      return extractKeyTerms(alert.rule_description);
    case "ruleid":
      return `\\b${alert.rule_id}\\b`;
    case "custom":
      return "";
  }}

function buildThreatSummary(intel: NonNullable<Alert["threat_intel"]>): {
  text: string;
  tone: "danger" | "warn" | "ok" | "info";
} {
  const errors     = intel.errors ?? [];
  const vtResults  = intel.virustotal ?? [];
  const abResults  = intel.abuseipdb ?? [];

  if (errors.includes("no_api_keys")) {
    return {
      text: "No API keys configured — set VIRUSTOTAL_API_KEY or ABUSEIPDB_API_KEY in .env to enable enrichment.",
      tone: "info",
    };
  }
  if (errors.includes("only_private_ips")) {
    const skipped = intel.private_ips_skipped ?? 0;
    return {
      text: `${skipped > 0 ? `${skipped} private IP${skipped !== 1 ? "s" : ""} found — ` : ""}private/internal addresses are not indexed by threat intel services.`,
      tone: "info",
    };
  }
  if (errors.includes("no_indicators")) {
    return { text: "No IPs, domains, or hashes found in this alert to enrich.", tone: "info" };
  }

  const vtMalicious = vtResults.filter((v) => v.malicious > 0);
  const abusiveIPs  = abResults.filter((a) => a.abuse_confidence >= 50);
  const torIPs      = abResults.filter((a) => a.is_tor);
  const parts: string[] = [];

  if (vtMalicious.length > 0)
    parts.push(`${vtMalicious.length} indicator${vtMalicious.length !== 1 ? "s" : ""} flagged malicious`);
  if (abusiveIPs.length > 0) {
    const maxConf = Math.max(...abusiveIPs.map((a) => a.abuse_confidence));
    parts.push(`${abusiveIPs.length} IP${abusiveIPs.length !== 1 ? "s" : ""} with high abuse score (up to ${maxConf}%)`);
  }
  if (torIPs.length > 0)
    parts.push(`${torIPs.length} TOR exit node${torIPs.length !== 1 ? "s" : ""}`);

  const checked = intel.indicators_checked ?? (vtResults.length + abResults.length);

  if (parts.length === 0) {
    const rateLimited = errors.includes("rate_limited");
    const baseText = checked > 0
      ? `${checked} indicator${checked !== 1 ? "s" : ""} checked — no known threats`
      : "No results returned";
    return {
      text: rateLimited ? `${baseText} (some lookups were rate-limited — try again shortly)` : baseText,
      tone: rateLimited ? "warn" : "ok",
    };
  }

  return {
    text: parts.join(" · ") + (errors.includes("rate_limited") ? " (partial — rate limited)" : ""),
    tone: "danger",
  };
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

const PATTERN_MODES: { key: PatternMode; label: string; desc: string }[] = [
  { key: "groups",  label: "Rule Groups",  desc: "Tags from Wazuh's own classification (e.g. web|attack|sqli)" },
  { key: "terms",   label: "Key Terms",    desc: "Significant words extracted from the rule description" },
  { key: "ruleid",  label: "Rule ID",      desc: "Matches alerts with the exact same Wazuh rule ID" },
  { key: "custom",  label: "Custom",       desc: "Write your own regex from scratch" },
];

interface CreateRuleFromAlertModalProps {
  alert: Alert;
  onClose: () => void;
}

function CreateRuleFromAlertModal({ alert, onClose }: CreateRuleFromAlertModalProps) {
  const defaultMode: PatternMode = (alert.rule_groups ?? []).filter((g) => g.length > 2).length > 0
    ? "groups" : "terms";

  const [mode, setMode]               = useState<PatternMode>(defaultMode);
  const [pattern, setPattern]         = useState(() => patternForMode(defaultMode, alert));
  const [name, setName]               = useState(`From alert: ${alert.rule_description.slice(0, 55)}`);
  const [description, setDescription] = useState(
    `Created from Wazuh rule ${alert.rule_id} · level ${alert.rule_level} · ${alert.agent_name}`
  );
  const [severity, setSeverity]   = useState<DetectionRuleCreate["severity"]>(severityFromLevel(alert.rule_level));
  const [scope, setScope]         = useState<"personal" | "project">("personal");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects]   = useState<SocProject[]>([]);
  const [testInput, setTestInput] = useState(alert.full_log?.slice(0, 120) ?? "");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [saveError, setSaveError] = useState("");

  const patternValid = isValidRegex(pattern);
  const testMatch = (() => {
    if (!testInput || !pattern || !patternValid) return null;
    return new RegExp(pattern, "i").test(testInput);
  })();

  useEffect(() => {
    getSocProjects().then(setProjects).catch(() => {});
  }, []);

  const handleModeChange = (next: PatternMode) => {
    setMode(next);
    if (next !== "custom") setPattern(patternForMode(next, alert));
  };

  const handleSave = async () => {
    if (!name.trim() || !pattern.trim() || !patternValid) return;
    setSaving(true);
    setSaveError("");
    try {
      await createDetectionRule({
        name: name.trim(),
        description: description.trim(),
        pattern: pattern.trim(),
        severity,
        enabled: true,
        project_id: scope === "project" ? projectId : null,
        source_alert_id: alert.id,
        source_rule_id: alert.rule_id,
      });
      setSaved(true);
      setTimeout(onClose, 1000);
    } catch {
      setSaveError("Failed to create rule. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = {
    backgroundColor: "var(--surface)",
    borderColor: "var(--border)",
    color: "var(--text-1)",
  } as const;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="card w-full max-w-xl" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)", maxHeight: "92vh", overflowY: "auto" }}>

        {/* Header */}
        <div className="card-head between">
          <div className="row" style={{ gap: 8 }}>
            <Icon name="plus" size={15} style={{ color: "var(--accent)" }} />
            <span className="text-sm font-semibold">Create Detection Rule</span>
          </div>
          <button onClick={onClose} className="btn btn-sm" style={{ padding: "4px 6px" }}>
            <Icon name="x" size={13} />
          </button>
        </div>

        {/* Alert context strip */}
        <div
          style={{
            padding: "8px var(--pad-card)",
            borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--bg-2)",
            display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center",
          }}
        >
          <span className="mono text-xs" style={{ color: "var(--text-3)" }}>Source:</span>
          <span
            className="mono text-xs px-1.5 py-0.5 rounded"
            style={{ background: "rgba(59,130,246,0.1)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.2)" }}
          >
            Rule {alert.rule_id}
          </span>
          <span className="text-xs" style={{ color: "var(--text-2)" }}>{alert.rule_description.slice(0, 60)}</span>
          {(alert.rule_groups ?? []).slice(0, 4).map((g) => (
            <span
              key={g}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{ background: "rgba(168,85,247,0.1)", color: "#c084fc", border: "1px solid rgba(168,85,247,0.15)" }}
            >
              {g}
            </span>
          ))}
        </div>

        <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Rule Name */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">Rule Name *</label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={inputStyle}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Descriptive name for this rule"
            />
          </div>

          {/* Description */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">Description</label>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={inputStyle}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this rule tag?"
            />
          </div>

          {/* Pattern Mode */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label className="eyebrow">Pattern Source</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {PATTERN_MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => handleModeChange(m.key)}
                  style={{
                    padding: "8px 10px", borderRadius: 8, textAlign: "left", cursor: "pointer",
                    border: `1px solid ${mode === m.key ? "var(--accent)" : "var(--border)"}`,
                    backgroundColor: mode === m.key ? "color-mix(in oklab, var(--accent) 10%, transparent)" : "var(--surface)",
                    transition: "all 0.15s",
                  }}
                >
                  <p className="text-xs font-semibold" style={{ color: mode === m.key ? "var(--accent)" : "var(--text)" }}>{m.label}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-3)", lineHeight: 1.4 }}>{m.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Pattern textarea */}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="eyebrow">
              Pattern (regex, case-insensitive)
              {mode !== "custom" && (
                <span className="ml-2 text-[10px] font-normal" style={{ color: "var(--text-3)" }}>
                  — auto-generated, edit freely
                </span>
              )}
            </label>
            <textarea
              rows={2}
              className="w-full rounded-lg border px-3 py-2 text-sm mono outline-none resize-none"
              style={{ ...inputStyle, borderColor: !patternValid && pattern ? "var(--sev-critical)" : "var(--border)" }}
              value={pattern}
              onChange={(e) => { setPattern(e.target.value); if (mode !== "custom") setMode("custom"); }}
              placeholder="e.g. juiceshop|dvwa|sql_injection"
            />
            {!patternValid && pattern && (
              <p className="text-[11px]" style={{ color: "var(--sev-critical)" }}>Invalid regular expression</p>
            )}

            {/* Live tester */}
            <div className="rounded-lg border px-3 py-2.5" style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <p className="eyebrow">Live tester</p>
                {testInput && testMatch !== null && (
                  <span className="text-[11px] font-semibold" style={{ color: testMatch ? "#4ade80" : "#fbbf24" }}>
                    {testMatch ? "✓ Match" : "✗ No match"}
                  </span>
                )}
              </div>
              <textarea
                rows={2}
                className="w-full bg-transparent text-xs mono outline-none resize-none"
                style={{ color: "var(--text-1)" }}
                placeholder="Paste a sample log line to test the pattern…"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
              />
            </div>
          </div>

          {/* Scope + Severity row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="eyebrow">Scope</label>
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                {(["personal", "project"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setScope(s);
                      if (s === "personal") setProjectId(null);
                      else if (projects.length > 0) setProjectId(projects[0].id);
                    }}
                    className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: scope === s ? "color-mix(in oklab, var(--accent) 12%, transparent)" : "var(--surface)",
                      color: scope === s ? "var(--accent)" : "var(--text-2)",
                      borderRight: s === "personal" ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <Icon name={s === "personal" ? "user" : "folder"} size={11} />
                    {s === "personal" ? "Personal" : "Project"}
                  </button>
                ))}
              </div>
              {scope === "project" && (
                projects.length === 0
                  ? <p className="text-xs" style={{ color: "var(--text-3)" }}>No projects yet</p>
                  : <select
                      className="w-full input text-sm mt-1"
                      value={projectId ?? ""}
                      onChange={(e) => setProjectId(e.target.value || null)}
                    >
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label className="eyebrow">Severity</label>
              <select
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                style={inputStyle}
                value={severity}
                onChange={(e) => setSeverity(e.target.value as DetectionRuleCreate["severity"])}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {saveError && (
            <p className="text-xs" style={{ color: "var(--sev-critical)" }}>{saveError}</p>
          )}
        </div>

        <div className="between" style={{ padding: "12px var(--pad-card)", borderTop: "1px solid var(--border)" }}>
          <p className="text-[10px]" style={{ color: "var(--text-3)" }}>
            Linked to Wazuh rule {alert.rule_id} · matches at ingest time
          </p>
          <div className="row" style={{ gap: 8 }}>
            <button onClick={onClose} className="btn btn-sm" disabled={saving}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={saving || saved || !name.trim() || !pattern.trim() || !patternValid}
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

      {/* Investigation Guide — always shown after enrichment, works with private IPs */}
      {alert.threat_intel?.investigation_guide && (() => {
        const guide = alert.threat_intel!.investigation_guide!;
        const freq  = alert.threat_intel!.rule_frequency;
        const related = alert.threat_intel!.related_alerts ?? [];
        return (
          <div className="card">
            <div className="card-head between">
              <div className="row" style={{ gap: 8 }}>
                <Icon name="activity" size={16} style={{ color: "var(--accent)" }} />
                <span className="font-semibold text-sm">AI Investigation Guide</span>
              </div>
              {alert.threat_intel?.enriched_at && (
                <span className="dim mono" style={{ fontSize: 10 }}>
                  {new Date(alert.threat_intel.enriched_at).toLocaleString()}
                </span>
              )}
            </div>

            {/* Rule frequency callout */}
            {freq && (freq.same_rule_24h > 10 || freq.same_agent_24h > 50) && (
              <div style={{ padding: "8px var(--pad-card)", borderBottom: "1px solid var(--border)", background: "rgba(234,179,8,0.05)" }}>
                <p className="text-xs" style={{ color: "#facc15" }}>
                  ⚑ Noise signal: this rule fired <strong>{freq.same_rule_24h}</strong> times in 24 h
                  · agent sent <strong>{freq.same_agent_24h}</strong> alerts total.
                  High frequency may indicate a noisy rule — check false positive scenarios below before escalating.
                </p>
              </div>
            )}

            <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Investigation steps */}
              {guide.investigation_steps.length > 0 && (
                <div>
                  <p className="eyebrow" style={{ marginBottom: 10 }}>Investigation Steps</p>
                  <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
                    {guide.investigation_steps.map((step, i) => (
                      <li key={i} className="text-sm" style={{ color: "var(--text)", lineHeight: 1.5 }}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Host artifacts */}
              {guide.host_artifacts.length > 0 && (
                <div>
                  <p className="eyebrow" style={{ marginBottom: 8 }}>Artifacts to Examine</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {guide.host_artifacts.map((art, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, padding: "6px 10px", borderRadius: 6, background: "var(--surface)", fontSize: 12 }}>
                        <span style={{ color: "var(--accent)", flexShrink: 0 }}>→</span>
                        <span style={{ color: "var(--text)" }}>{art}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {/* False positive scenarios */}
                {guide.false_positive_scenarios.length > 0 && (
                  <div>
                    <p className="eyebrow" style={{ marginBottom: 8 }}>False Positive Scenarios</p>
                    <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                      {guide.false_positive_scenarios.map((s, i) => (
                        <li key={i} className="text-xs" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Escalation + MITRE */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {guide.escalation_criteria && (
                    <div style={{ padding: "8px 12px", borderRadius: 8, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)" }}>
                      <p className="eyebrow" style={{ color: "var(--sev-critical)", marginBottom: 4 }}>Escalate If</p>
                      <p className="text-xs" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>{guide.escalation_criteria}</p>
                    </div>
                  )}
                  {guide.mitre_context && (
                    <div style={{ padding: "8px 12px", borderRadius: 8, background: "var(--surface)" }}>
                      <p className="eyebrow" style={{ marginBottom: 4 }}>MITRE Context</p>
                      <p className="text-xs" style={{ color: "var(--text-2)", lineHeight: 1.5 }}>{guide.mitre_context}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Confidence note */}
              {guide.confidence_note && (
                <p className="text-xs" style={{ color: "var(--text-4)", fontStyle: "italic" }}>
                  Note: {guide.confidence_note}
                </p>
              )}

              {/* Related alerts */}
              {related.length > 0 && (
                <div>
                  <p className="eyebrow" style={{ marginBottom: 8 }}>
                    Same Rule · Same Agent · Last 24 h
                    {freq && <span className="mono" style={{ marginLeft: 6, color: "var(--text-3)", fontWeight: 400 }}>({freq.same_rule_24h} total)</span>}
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {related.map((r) => (
                      <div
                        key={r.id}
                        className="between"
                        style={{ padding: "6px 10px", borderRadius: 6, background: "var(--surface)", cursor: "pointer" }}
                        onClick={() => window.location.href = `/alerts/${r.id}`}
                      >
                        <span className="text-xs" style={{ color: "var(--text-2)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {new Date(r.timestamp).toLocaleString()}
                        </span>
                        {(r.analyst_override || r.ai_verdict) && (
                          <span className="mono text-xs" style={{
                            marginLeft: 8, flexShrink: 0, padding: "1px 6px", borderRadius: 4,
                            background: r.analyst_override === "FALSE_POSITIVE" || r.ai_verdict === "FALSE_POSITIVE"
                              ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
                            color: r.analyst_override === "FALSE_POSITIVE" || r.ai_verdict === "FALSE_POSITIVE"
                              ? "var(--sev-low)" : "var(--sev-critical)",
                          }}>
                            {r.analyst_override ?? r.ai_verdict ?? ""}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rule frequency (when no related alerts but still useful) */}
              {freq && related.length === 0 && (
                <p className="text-xs" style={{ color: "var(--text-3)" }}>
                  Rule {alert.rule_id} fired <strong>{freq.same_rule_24h}</strong> time{freq.same_rule_24h !== 1 ? "s" : ""} in 24 h ·
                  Agent sent <strong>{freq.same_agent_24h}</strong> alert{freq.same_agent_24h !== 1 ? "s" : ""} total.
                </p>
              )}
            </div>
          </div>
        );
      })()}

      {/* IP Reputation (VT + AbuseIPDB) — only render card if we have actual results or an error worth showing */}
      {alert.threat_intel && (() => {
        const intel   = alert.threat_intel!;
        const summary = buildThreatSummary(intel);
        const vtIPs   = (intel.virustotal ?? []).filter((v) => v.type === "ip");
        const vtDoms  = (intel.virustotal ?? []).filter((v) => v.type === "domain");
        const vtHash  = (intel.virustotal ?? []).filter((v) => v.type === "hash");
        const hasData = vtIPs.length > 0 || vtDoms.length > 0 || vtHash.length > 0 || (intel.abuseipdb ?? []).length > 0;
        // Only show the card if we have real VT/AbuseIPDB results OR an actionable error (not the trivial private-IP case)
        const errors = intel.errors ?? [];
        const showCard = hasData || errors.includes("no_api_keys") || errors.includes("rate_limited");
        if (!showCard) return null;
        const summaryBg = summary.tone === "danger" ? "rgba(239,68,68,0.06)"
          : summary.tone === "warn" ? "rgba(234,179,8,0.06)"
          : summary.tone === "ok"   ? "rgba(34,197,94,0.04)"
          : "rgba(99,102,241,0.04)";
        const summaryColor = summary.tone === "danger" ? "var(--sev-critical)"
          : summary.tone === "warn" ? "#facc15"
          : summary.tone === "ok"   ? "var(--sev-low)"
          : "var(--accent)";

        return (
          <div className="card">
            <div className="card-head between">
              <div className="row" style={{ gap: 8 }}>
                <Icon name="globe" size={16} style={{ color: "#fb923c" }} />
                <span className="font-semibold text-sm">Threat Intelligence</span>
                {intel.indicators_checked != null && intel.indicators_checked > 0 && (
                  <span className="mono dim" style={{ fontSize: 11 }}>
                    {intel.indicators_checked} indicator{intel.indicators_checked !== 1 ? "s" : ""} checked
                  </span>
                )}
              </div>
              {intel.enriched_at && (
                <span className="dim mono" style={{ fontSize: 10 }}>
                  enriched {new Date(intel.enriched_at).toLocaleString()}
                </span>
              )}
            </div>

            {/* Summary bar */}
            <div style={{ padding: "10px var(--pad-card)", borderBottom: "1px solid var(--border)", background: summaryBg }}>
              <p className="text-sm" style={{ color: "var(--text-2)", display: "flex", alignItems: "flex-start", gap: 6 }}>
                <span style={{ fontWeight: 700, color: summaryColor, flexShrink: 0 }}>
                  {summary.tone === "danger" ? "⚠ Threats found:" : summary.tone === "warn" ? "⚑ Warning:" : summary.tone === "ok" ? "✓ Clean:" : "ℹ"}
                </span>
                <span>{summary.text}</span>
              </p>
            </div>

            {/* Results */}
            {hasData && (
              <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 16 }}>

                {/* VT — IPs */}
                {vtIPs.length > 0 && (
                  <div>
                    <p className="eyebrow" style={{ marginBottom: 8 }}>VirusTotal · IPs</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {vtIPs.map((vt, i) => (
                        <div key={i} className="between" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)" }}>
                          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                            <span className="mono text-sm">{vt.ip}</span>
                            {vt.country  && <span className="dim text-xs">{vt.country}</span>}
                            {vt.as_owner && <span className="dim text-xs">{vt.as_owner}</span>}
                          </div>
                          <div className="row" style={{ gap: 10, flexShrink: 0 }}>
                            <span className="text-xs" style={{ color: vt.malicious > 0 ? "var(--sev-critical)" : "var(--text-4)" }}>{vt.malicious} mal.</span>
                            <span className="text-xs" style={{ color: vt.suspicious > 0 ? "var(--sev-medium)" : "var(--text-4)" }}>{vt.suspicious} sus.</span>
                            <span className="text-xs" style={{ color: "var(--sev-low)" }}>{vt.harmless} ok</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* VT — Domains */}
                {vtDoms.length > 0 && (
                  <div>
                    <p className="eyebrow" style={{ marginBottom: 8 }}>VirusTotal · Domains</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {vtDoms.map((vt, i) => (
                        <div key={i} className="between" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)" }}>
                          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                            <span className="mono text-sm">{vt.domain}</span>
                            {vt.registrar && <span className="dim text-xs">{vt.registrar}</span>}
                          </div>
                          <div className="row" style={{ gap: 10, flexShrink: 0 }}>
                            <span className="text-xs" style={{ color: vt.malicious > 0 ? "var(--sev-critical)" : "var(--text-4)" }}>{vt.malicious} mal.</span>
                            <span className="text-xs" style={{ color: vt.suspicious > 0 ? "var(--sev-medium)" : "var(--text-4)" }}>{vt.suspicious} sus.</span>
                            <span className="text-xs" style={{ color: "var(--sev-low)" }}>{vt.harmless} ok</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* VT — Hashes */}
                {vtHash.length > 0 && (
                  <div>
                    <p className="eyebrow" style={{ marginBottom: 8 }}>VirusTotal · File Hashes</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {vtHash.map((vt, i) => (
                        <div key={i} className="between" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)" }}>
                          <div className="row" style={{ gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                            <span className="mono text-xs" style={{ color: "var(--text-2)", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>{vt.hash}</span>
                            {vt.meaningful_name && <span className="dim text-xs">{vt.meaningful_name}</span>}
                            {vt.type_description && <span className="dim text-xs">{vt.type_description}</span>}
                          </div>
                          <div className="row" style={{ gap: 10, flexShrink: 0 }}>
                            <span className="text-xs" style={{ color: vt.malicious > 0 ? "var(--sev-critical)" : "var(--text-4)" }}>{vt.malicious} mal.</span>
                            <span className="text-xs" style={{ color: vt.suspicious > 0 ? "var(--sev-medium)" : "var(--text-4)" }}>{vt.suspicious} sus.</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* AbuseIPDB */}
                {(intel.abuseipdb ?? []).length > 0 && (
                  <div>
                    <p className="eyebrow" style={{ marginBottom: 8 }}>AbuseIPDB</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {intel.abuseipdb!.map((ab, i) => (
                        <div key={i} className="between" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)" }}>
                          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                            <span className="mono text-sm">{ab.ip}</span>
                            {ab.country_code && <span className="dim text-xs">{ab.country_code}</span>}
                            {ab.isp && <span className="dim text-xs">{ab.isp}</span>}
                            {ab.usage_type && <span className="dim text-xs">{ab.usage_type}</span>}
                            {ab.is_tor && (
                              <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "rgba(239,68,68,0.15)", color: "var(--sev-critical)", fontWeight: 700 }}>TOR</span>
                            )}
                          </div>
                          <div className="row" style={{ gap: 10, flexShrink: 0 }}>
                            <span className="text-xs" style={{
                              fontWeight: 600,
                              color: ab.abuse_confidence >= 80 ? "var(--sev-critical)"
                                   : ab.abuse_confidence >= 50 ? "var(--sev-medium)"
                                   : "var(--text-3)",
                            }}>
                              {ab.abuse_confidence}%
                            </span>
                            <span className="text-xs dim">{ab.total_reports} rpts</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })()}

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
