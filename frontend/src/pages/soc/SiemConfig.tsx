/**
 * SiemConfig — per-project SIEM configuration page.
 *
 * Layout:
 *   - Project selector dropdown
 *   - Top row: Manager health card + Agent status card
 *   - Bottom: two-panel — rules list (left) + XML rule editor (right)
 *   - Compose download button in agent status card
 *   - "Fetch from URL" section to import XML rule files
 */
import { useState, useEffect, useCallback } from "react";
import {
  SlidersHorizontal, RefreshCw, Download, Plus, Trash2,
  CheckCircle2, XCircle, AlertTriangle, Globe, ChevronDown,
  Code2, AlertCircle, Monitor, ToggleLeft, ToggleRight,
} from "lucide-react";
import {
  getSocProjects, getSiemConfig, getSocHealth, getAgentStatus,
  addSiemRule, replaceSiemRules, deleteSiemRule, fetchXmlRules,
  downloadAgentCompose,
  type SocProject, type SiemConfig as SiemConfigData, type CustomRule,
  type SocHealth, type AgentStatus, type XmlCandidate,
} from "@/services/socService";

// ── Helpers ───────────────────────────────────────────────────────────────────

const BLANK_RULE = { name: "", description: "", xml_content: "", enabled: true };

type EditingRule = { id?: string } & typeof BLANK_RULE;

function isValidXml(xml: string): boolean {
  if (!xml.trim()) return false;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml.trim(), "text/xml");
    return !doc.querySelector("parsererror");
  } catch {
    return false;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function HealthCard({ health, loading }: { health: SocHealth | null; loading: boolean }) {
  if (loading) {
    return (
      <div
        className="rounded-xl p-4 animate-pulse flex flex-col gap-2"
        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="h-2.5 w-28 rounded" style={{ backgroundColor: "var(--border)" }} />
        <div className="h-4 w-16 rounded mt-1" style={{ backgroundColor: "var(--border)" }} />
      </div>
    );
  }
  const ok = health?.manager_reachable ?? false;
  const color = ok ? "#22C55E" : "#EF4444";
  const Icon = ok ? CheckCircle2 : XCircle;
  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: `1px solid ${ok ? "rgba(34,197,94,0.22)" : "rgba(239,68,68,0.22)"}`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>
          Wazuh Manager
        </span>
        <Icon size={14} style={{ color }} />
      </div>
      <div className="flex items-center gap-2">
        <span
          className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
          style={{ backgroundColor: `${color}18`, color }}
        >
          {ok ? "Reachable" : "Unreachable"}
        </span>
      </div>
      {health && (
        <div className="text-[11px] space-y-0.5 pt-1" style={{ color: "var(--text-subtle)" }}>
          {health.total_registered_agents != null && (
            <p>{health.active_agents ?? 0} / {health.total_registered_agents} agents active</p>
          )}
          {health.error && (
            <p className="text-[10px]" style={{ color: "#EF4444" }}>{health.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

function AgentCard({
  status, loading, project, onDownload, downloading,
}: {
  status: AgentStatus | null;
  loading: boolean;
  project: SocProject | null;
  onDownload: () => void;
  downloading: boolean;
}) {
  if (loading) {
    return (
      <div
        className="rounded-xl p-4 animate-pulse flex flex-col gap-2"
        style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
      >
        <div className="h-2.5 w-24 rounded" style={{ backgroundColor: "var(--border)" }} />
        <div className="h-4 w-32 rounded mt-1" style={{ backgroundColor: "var(--border)" }} />
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    connected: "#22C55E",
    disconnected: "#EF4444",
    never_registered: "#F59E0B",
    unknown: "#94A3B8",
  };
  const st = status?.status ?? "unknown";
  const color = statusColors[st] ?? "#94A3B8";

  return (
    <div
      className="rounded-xl p-4 flex flex-col gap-2"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>
          Agent Status
        </span>
        <Monitor size={13} style={{ color: "var(--text-subtle)" }} />
      </div>

      <div className="flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: color, boxShadow: st === "connected" ? `0 0 5px ${color}80` : undefined }}
        />
        <span
          className="text-[10px] font-bold uppercase"
          style={{ color }}
        >
          {st.replace(/_/g, " ")}
        </span>
      </div>

      {status && (
        <div className="text-[11px] space-y-0.5" style={{ color: "var(--text-subtle)", fontFamily: "IBM Plex Mono, monospace" }}>
          {status.agent_name && <p>{status.agent_name}</p>}
          {status.ip && <p>{status.ip}</p>}
          {status.os && <p>{status.os}</p>}
          {status.wazuh_version && <p>v{status.wazuh_version}</p>}
        </div>
      )}

      {status?.health_issues && status.health_issues.length > 0 && (
        <div className="space-y-1 pt-1">
          {status.health_issues.map((issue, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 text-[10px] px-2 py-1.5 rounded"
              style={{ backgroundColor: "rgba(245,158,11,0.08)", color: "#F59E0B" }}
            >
              <AlertTriangle size={9} className="shrink-0 mt-0.5" />
              {issue}
            </div>
          ))}
        </div>
      )}

      {project && (
        <button
          onClick={onDownload}
          disabled={downloading}
          className="mt-auto flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors"
          style={{
            backgroundColor: "rgba(0,212,255,0.10)",
            border: "1px solid rgba(0,212,255,0.22)",
            color: "#00d4ff",
            opacity: downloading ? 0.6 : 1,
          }}
        >
          <Download size={11} />
          {downloading ? "Generating…" : "Download Agent Compose"}
        </button>
      )}
    </div>
  );
}

function RuleListItem({
  rule, selected, onSelect, onDelete, onToggle,
}: {
  rule: CustomRule;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className="group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
      style={{
        backgroundColor: selected ? "rgba(0,212,255,0.10)" : "transparent",
        border: selected ? "1px solid rgba(0,212,255,0.22)" : "1px solid transparent",
      }}
      onClick={onSelect}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="shrink-0 transition-colors"
        title={rule.enabled ? "Disable rule" : "Enable rule"}
      >
        {rule.enabled
          ? <ToggleRight size={16} style={{ color: "#22C55E" }} />
          : <ToggleLeft size={16} style={{ color: "#475569" }} />
        }
      </button>
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-medium truncate"
          style={{ color: selected ? "#00d4ff" : "var(--text-base)" }}
        >
          {rule.name || "(unnamed)"}
        </p>
        {rule.description && (
          <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--text-subtle)" }}>
            {rule.description}
          </p>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-[rgba(239,68,68,0.12)]"
        title="Delete rule"
      >
        <Trash2 size={12} style={{ color: "#EF4444" }} />
      </button>
    </div>
  );
}

function XmlEditor({
  rule, onChange, onSave, onCancel, saving,
}: {
  rule: EditingRule;
  onChange: (r: EditingRule) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const xmlValid = isValidXml(rule.xml_content);
  const canSave = rule.name.trim() && rule.xml_content.trim() && xmlValid;

  return (
    <div className="flex flex-col h-full gap-3">
      {/* Name + description */}
      <div className="space-y-2">
        <input
          value={rule.name}
          onChange={(e) => onChange({ ...rule, name: e.target.value })}
          placeholder="Rule name *"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
          style={{
            backgroundColor: "var(--bg-muted)",
            border: "1px solid var(--border)",
            color: "var(--text-base)",
          }}
        />
        <input
          value={rule.description}
          onChange={(e) => onChange({ ...rule, description: e.target.value })}
          placeholder="Description (optional)"
          className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
          style={{
            backgroundColor: "var(--bg-muted)",
            border: "1px solid var(--border)",
            color: "var(--text-base)",
          }}
        />
      </div>

      {/* XML textarea */}
      <div className="flex-1 flex flex-col">
        <div
          className="flex items-center justify-between px-3 py-1.5 rounded-t-lg"
          style={{ backgroundColor: "rgba(0,0,0,0.25)", borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-1.5">
            <Code2 size={11} style={{ color: "var(--text-subtle)" }} />
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
              XML
            </span>
          </div>
          {rule.xml_content.trim() && (
            <span
              className="text-[9px] font-semibold uppercase"
              style={{ color: xmlValid ? "#22C55E" : "#EF4444" }}
            >
              {xmlValid ? "Valid" : "Invalid XML"}
            </span>
          )}
        </div>
        <textarea
          value={rule.xml_content}
          onChange={(e) => onChange({ ...rule, xml_content: e.target.value })}
          placeholder={"<group name=\"custom_rules\">\n  <rule id=\"100001\" level=\"5\">\n    <description>Custom detection rule</description>\n  </rule>\n</group>"}
          className="flex-1 w-full px-3 py-2.5 text-xs resize-none outline-none rounded-b-lg"
          style={{
            backgroundColor: "rgba(0,0,0,0.30)",
            border: "1px solid var(--border)",
            borderTop: "none",
            color: "#E2E8F0",
            fontFamily: "IBM Plex Mono, 'JetBrains Mono', monospace",
            lineHeight: 1.6,
            minHeight: "200px",
          }}
          spellCheck={false}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
          style={{
            backgroundColor: "var(--bg-muted)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!canSave || saving}
          className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{
            backgroundColor: canSave && !saving ? "rgba(0,212,255,0.15)" : "var(--bg-muted)",
            border: canSave && !saving ? "1px solid rgba(0,212,255,0.30)" : "1px solid var(--border)",
            color: canSave && !saving ? "#00d4ff" : "var(--text-subtle)",
            cursor: canSave && !saving ? "pointer" : "not-allowed",
          }}
        >
          {saving ? "Saving…" : rule.id ? "Update Rule" : "Add Rule"}
        </button>
      </div>
    </div>
  );
}

function FetchXmlPanel({
  projectId, onImport,
}: {
  projectId: string;
  onImport: (candidates: XmlCandidate[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<XmlCandidate[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const doFetch = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setError(null);
    setCandidates([]);
    setSelected(new Set());
    try {
      const res = await fetchXmlRules(projectId, url.trim());
      setCandidates(res.candidates);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fetch failed");
    } finally {
      setLoading(false);
    }
  };

  const toggleCandidate = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const doImport = () => {
    const chosen = candidates.filter((_, i) => selected.has(i));
    if (chosen.length) onImport(chosen);
  };

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-2">
        <Globe size={13} style={{ color: "var(--text-subtle)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--text-muted)" }}>
          Import from URL
        </span>
      </div>

      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/rules.xml"
          className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
          style={{
            backgroundColor: "var(--bg-muted)",
            border: "1px solid var(--border)",
            color: "var(--text-base)",
            fontFamily: "IBM Plex Mono, monospace",
          }}
          onKeyDown={(e) => { if (e.key === "Enter") doFetch(); }}
        />
        <button
          onClick={doFetch}
          disabled={!url.trim() || loading}
          className="px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5"
          style={{
            backgroundColor: "rgba(0,212,255,0.10)",
            border: "1px solid rgba(0,212,255,0.22)",
            color: "#00d4ff",
            opacity: !url.trim() || loading ? 0.5 : 1,
          }}
        >
          {loading ? <RefreshCw size={11} className="animate-spin" /> : <Globe size={11} />}
          Fetch
        </button>
      </div>

      {error && (
        <p className="text-[11px]" style={{ color: "#EF4444" }}>{error}</p>
      )}

      {candidates.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-subtle)" }}>
            {candidates.length} rule(s) found
          </p>
          {candidates.map((c, i) => (
            <label
              key={i}
              className="flex items-start gap-2.5 cursor-pointer p-2.5 rounded-lg transition-colors"
              style={{
                backgroundColor: selected.has(i) ? "rgba(0,212,255,0.08)" : "var(--bg-muted)",
                border: `1px solid ${selected.has(i) ? "rgba(0,212,255,0.20)" : "var(--border)"}`,
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(i)}
                onChange={() => toggleCandidate(i)}
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0">
                <p className="text-xs font-medium" style={{ color: "var(--text-base)" }}>{c.name}</p>
                {c.description && (
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--text-subtle)" }}>{c.description}</p>
                )}
              </div>
            </label>
          ))}
          <button
            onClick={doImport}
            disabled={selected.size === 0}
            className="w-full py-2 rounded-lg text-xs font-semibold transition-colors"
            style={{
              backgroundColor: selected.size > 0 ? "rgba(0,212,255,0.12)" : "var(--bg-muted)",
              border: `1px solid ${selected.size > 0 ? "rgba(0,212,255,0.25)" : "var(--border)"}`,
              color: selected.size > 0 ? "#00d4ff" : "var(--text-subtle)",
              cursor: selected.size > 0 ? "pointer" : "not-allowed",
            }}
          >
            Import {selected.size > 0 ? `${selected.size} rule(s)` : "selected"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SiemConfig() {
  const [projects, setProjects]           = useState<SocProject[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [selectedId, setSelectedId]       = useState<string | null>(null);

  const [siemConfig, setSiemConfig]       = useState<SiemConfigData | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  const [health, setHealth]               = useState<SocHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  const [agentStatus, setAgentStatus]     = useState<AgentStatus | null>(null);
  const [agentLoading, setAgentLoading]   = useState(false);

  const [editing, setEditing]             = useState<EditingRule | null>(null);
  const [saving, setSaving]               = useState(false);
  const [saveError, setSaveError]         = useState<string | null>(null);

  const [downloading, setDownloading]     = useState(false);
  const [showFetch, setShowFetch]         = useState(false);
  const [projectOpen, setProjectOpen]     = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null;

  // Load project list and SOC health on mount
  useEffect(() => {
    const init = async () => {
      setProjectsLoading(true);
      try {
        const [projs, h] = await Promise.all([getSocProjects(), getSocHealth()]);
        setProjects(projs);
        setHealth(h);
        if (projs.length === 1) setSelectedId(projs[0].id);
      } catch {
        // projects list failure is silent; health failure too
      } finally {
        setProjectsLoading(false);
        setHealthLoading(false);
      }
    };
    init();
  }, []);

  // Load SIEM config + agent status whenever selected project changes
  const loadProjectData = useCallback(async (id: string) => {
    setConfigLoading(true);
    setAgentLoading(true);
    setSiemConfig(null);
    setAgentStatus(null);
    setEditing(null);
    setSaveError(null);

    const [cfg, agent] = await Promise.allSettled([
      getSiemConfig(id),
      getAgentStatus(id),
    ]);
    if (cfg.status === "fulfilled") setSiemConfig(cfg.value);
    if (agent.status === "fulfilled") setAgentStatus(agent.value);
    setConfigLoading(false);
    setAgentLoading(false);
  }, []);

  useEffect(() => {
    if (selectedId) loadProjectData(selectedId);
  }, [selectedId, loadProjectData]);

  // Handlers

  const handleSelectRule = (rule: CustomRule) => {
    setEditing({ id: rule.id, name: rule.name, description: rule.description, xml_content: rule.xml_content, enabled: rule.enabled });
    setSaveError(null);
  };

  const handleNewRule = () => {
    setEditing({ ...BLANK_RULE });
    setSaveError(null);
  };

  const handleToggleRule = async (rule: CustomRule) => {
    if (!selectedId || !siemConfig) return;
    const updated = siemConfig.custom_rules.map((r) =>
      r.id === rule.id ? { ...r, enabled: !r.enabled } : r,
    );
    const saved = await replaceSiemRules(selectedId, updated.map(({ name, description, xml_content, enabled }) => ({ name, description, xml_content, enabled })));
    setSiemConfig(saved);
  };

  const handleDeleteRule = async (rule: CustomRule) => {
    if (!selectedId) return;
    const saved = await deleteSiemRule(selectedId, rule.id);
    setSiemConfig(saved);
    if (editing?.id === rule.id) setEditing(null);
  };

  const handleSaveRule = async () => {
    if (!selectedId || !editing) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (editing.id) {
        // Update via replace-all (keeps other rules intact)
        if (!siemConfig) return;
        const updated = siemConfig.custom_rules.map((r) =>
          r.id === editing.id
            ? { name: editing.name, description: editing.description, xml_content: editing.xml_content, enabled: editing.enabled }
            : { name: r.name, description: r.description, xml_content: r.xml_content, enabled: r.enabled },
        );
        const saved = await replaceSiemRules(selectedId, updated);
        setSiemConfig(saved);
      } else {
        const saved = await addSiemRule(selectedId, {
          name: editing.name,
          description: editing.description,
          xml_content: editing.xml_content,
          enabled: editing.enabled,
        });
        setSiemConfig(saved);
      }
      setEditing(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleImportCandidates = async (candidates: XmlCandidate[]) => {
    if (!selectedId) return;
    const currentRules = siemConfig?.custom_rules.map(({ name, description, xml_content, enabled }) => ({ name, description, xml_content, enabled })) ?? [];
    const newRules = candidates.map(({ name, description, xml_content, enabled }) => ({ name, description, xml_content, enabled }));
    const saved = await replaceSiemRules(selectedId, [...currentRules, ...newRules]);
    setSiemConfig(saved);
    setShowFetch(false);
  };

  const handleDownload = async () => {
    if (!selectedProject) return;
    setDownloading(true);
    try {
      await downloadAgentCompose(selectedProject.id, selectedProject.slug);
    } finally {
      setDownloading(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      {/* Page header + project selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.22)" }}
          >
            <SlidersHorizontal size={16} style={{ color: "#22C55E" }} />
          </div>
          <div>
            <h1
              className="text-xl font-bold leading-none"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.02em" }}
            >
              SIEM Configuration
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-subtle)" }}>
              Custom detection rules per project
            </p>
          </div>
        </div>

        {/* Project selector */}
        <div className="relative">
          <button
            onClick={() => setProjectOpen((v) => !v)}
            disabled={projectsLoading}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border)",
              color: "var(--text-base)",
              minWidth: "180px",
            }}
          >
            <span className="flex-1 text-left truncate">
              {projectsLoading
                ? "Loading…"
                : selectedProject?.name ?? "Select project"}
            </span>
            <ChevronDown size={13} style={{ color: "var(--text-subtle)" }} />
          </button>
          {projectOpen && (
            <div
              className="absolute right-0 mt-1 z-20 rounded-xl py-1 shadow-xl min-w-[220px]"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
            >
              {projects.length === 0 ? (
                <p className="px-4 py-2.5 text-xs" style={{ color: "var(--text-subtle)" }}>No projects</p>
              ) : (
                projects.map((p) => {
                  // owner_username is present when admin fetches all projects
                  const ownerUsername = (p as Record<string, unknown>).owner_username as string | undefined;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { setSelectedId(p.id); setProjectOpen(false); }}
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left transition-colors hover:bg-[var(--bg-muted)]"
                      style={{ color: p.id === selectedId ? "#00d4ff" : "var(--text-base)" }}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${p.wazuh_agent_registered ? "bg-green-500" : "bg-slate-500"}`} />
                      <span className="flex-1 truncate">{p.name}</span>
                      {ownerUsername && (
                        <span className="text-[10px] font-medium shrink-0 px-1.5 py-0.5 rounded" style={{ color: "var(--accent)", background: "rgba(0,212,255,0.08)" }}>
                          {ownerUsername}
                        </span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* No project selected */}
      {!selectedId && !projectsLoading && (
        <div
          className="rounded-xl p-10 flex flex-col items-center gap-3 text-center"
          style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
        >
          <SlidersHorizontal size={32} style={{ color: "var(--text-subtle)" }} />
          <p className="font-medium" style={{ color: "var(--text-muted)" }}>Select a project to configure</p>
          <p className="text-sm" style={{ color: "var(--text-subtle)" }}>
            Use the dropdown above to choose which project's SIEM rules to edit.
          </p>
        </div>
      )}

      {/* Project config UI */}
      {selectedId && (
        <>
          {/* Top row: manager health + agent status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <HealthCard health={health} loading={healthLoading} />
            <AgentCard
              status={agentStatus}
              loading={agentLoading}
              project={selectedProject}
              onDownload={handleDownload}
              downloading={downloading}
            />
          </div>

          {/* Main panel: rules list + editor */}
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            {/* Left: rules list */}
            <div
              className="rounded-xl flex flex-col"
              style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)" }}
            >
              {/* Rules list header */}
              <div
                className="flex items-center justify-between px-4 py-3"
                style={{ borderBottom: "1px solid var(--border)" }}
              >
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                  Custom Rules {siemConfig ? `(${siemConfig.custom_rules.length})` : ""}
                </span>
                <button
                  onClick={handleNewRule}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium transition-colors"
                  style={{
                    backgroundColor: "rgba(0,212,255,0.10)",
                    border: "1px solid rgba(0,212,255,0.22)",
                    color: "#00d4ff",
                  }}
                >
                  <Plus size={11} />
                  New
                </button>
              </div>

              {/* Rules */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {configLoading && (
                  <div className="space-y-1.5 p-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-12 rounded-lg animate-pulse"
                        style={{ backgroundColor: "var(--bg-muted)" }}
                      />
                    ))}
                  </div>
                )}
                {!configLoading && siemConfig?.custom_rules.length === 0 && (
                  <div className="flex flex-col items-center gap-2 py-8 text-center px-4">
                    <Code2 size={24} style={{ color: "var(--text-subtle)" }} />
                    <p className="text-xs" style={{ color: "var(--text-subtle)" }}>No rules yet</p>
                  </div>
                )}
                {!configLoading && siemConfig?.custom_rules.map((rule) => (
                  <RuleListItem
                    key={rule.id}
                    rule={rule}
                    selected={editing?.id === rule.id}
                    onSelect={() => handleSelectRule(rule)}
                    onDelete={() => handleDeleteRule(rule)}
                    onToggle={() => handleToggleRule(rule)}
                  />
                ))}
              </div>

              {/* Import from URL toggle */}
              <div style={{ borderTop: "1px solid var(--border)" }} className="p-2">
                <button
                  onClick={() => setShowFetch((v) => !v)}
                  className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-[var(--bg-muted)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <Globe size={11} />
                  Import from URL
                </button>
              </div>
            </div>

            {/* Right: editor or empty prompt */}
            <div className="flex flex-col gap-4">
              {editing ? (
                <div
                  className="rounded-xl p-4 flex flex-col"
                  style={{ backgroundColor: "var(--bg-surface)", border: "1px solid var(--border)", minHeight: "420px" }}
                >
                  <div
                    className="flex items-center gap-2 pb-3 mb-3"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <Code2 size={13} style={{ color: "var(--text-subtle)" }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-subtle)" }}>
                      {editing.id ? "Edit Rule" : "New Rule"}
                    </span>
                  </div>
                  {saveError && (
                    <div
                      className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs mb-3"
                      style={{ backgroundColor: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.22)", color: "#EF4444" }}
                    >
                      <AlertCircle size={12} className="shrink-0 mt-0.5" />
                      {saveError}
                    </div>
                  )}
                  <div className="flex-1">
                    <XmlEditor
                      rule={editing}
                      onChange={setEditing}
                      onSave={handleSaveRule}
                      onCancel={() => setEditing(null)}
                      saving={saving}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-xl flex flex-col items-center justify-center text-center gap-3"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border)",
                    minHeight: "240px",
                  }}
                >
                  <Code2 size={28} style={{ color: "var(--text-subtle)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No rule selected</p>
                  <p className="text-xs max-w-[220px]" style={{ color: "var(--text-subtle)" }}>
                    Choose a rule from the list to edit it, or click New to create one.
                  </p>
                </div>
              )}

              {/* Fetch panel */}
              {showFetch && selectedId && (
                <FetchXmlPanel projectId={selectedId} onImport={handleImportCandidates} />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
