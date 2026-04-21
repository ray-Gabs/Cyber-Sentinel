/**
 * DetectionRules — CRUD management for regex-based detection rules
 * that match against Wazuh alert descriptions.
 */
import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  listDetectionRules,
  createDetectionRule,
  updateDetectionRule,
  deleteDetectionRule,
} from "@/services/alertService";
import ConfirmModal from "@/components/common/ConfirmModal";
import StatusBadge from "@/components/common/StatusBadge";
import { Filter, Plus, Pencil, Trash2, ToggleLeft, ToggleRight, AlertCircle } from "lucide-react";
import type { DetectionRule, DetectionRuleCreate, DetectionRuleUpdate } from "@/types";

const SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
type Severity = typeof SEVERITIES[number];

const EMPTY_FORM: DetectionRuleCreate = {
  name: "",
  description: "",
  pattern: "",
  severity: "medium",
  enabled: true,
};

function isValidRegex(pattern: string): boolean {
  try { new RegExp(pattern); return true; }
  catch { return false; }
}

// ── Skeleton ──────────────────────────────────────────────────────────────
function RuleSkeleton() {
  return (
    <div className="card flex items-center gap-4" style={{ padding: "0.875rem 1.25rem" }}>
      <div className="skeleton h-3 w-40 rounded" />
      <div className="skeleton h-3 w-56 rounded flex-1" />
      <div className="skeleton h-5 w-16 rounded-full" />
      <div className="skeleton h-6 w-10 rounded-full" />
    </div>
  );
}

// ── Rule form modal ───────────────────────────────────────────────────────
interface RuleFormProps {
  initial: DetectionRuleCreate;
  onSave: (data: DetectionRuleCreate) => Promise<void>;
  onClose: () => void;
  saving: boolean;
  title: string;
}

function RuleFormModal({ initial, onSave, onClose, saving, title }: RuleFormProps) {
  const [form, setForm] = useState<DetectionRuleCreate>(initial);
  const [patternError, setPatternError] = useState("");

  const set = (field: keyof DetectionRuleCreate, value: unknown) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.pattern.trim()) return;
    if (!isValidRegex(form.pattern)) {
      setPatternError("Invalid regular expression.");
      return;
    }
    setPatternError("");
    await onSave(form);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="card w-full max-w-lg"
        style={{ padding: "1.5rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--text-base)" }}>{title}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
              Rule Name *
            </label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Brute Force Login"
              className="w-full input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
              Description
            </label>
            <input
              type="text"
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional short description"
              className="w-full input text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>
              Pattern (regex) *
            </label>
            <input
              required
              type="text"
              value={form.pattern}
              onChange={(e) => { set("pattern", e.target.value); setPatternError(""); }}
              placeholder="e.g. failed.*login|authentication.*failure"
              className="w-full input text-sm font-mono"
            />
            {patternError && (
              <p className="flex items-center gap-1 mt-1 text-xs" style={{ color: "var(--sev-critical-text)" }}>
                <AlertCircle size={11} /> {patternError}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Severity</label>
              <select
                value={form.severity}
                onChange={(e) => set("severity", e.target.value as Severity)}
                className="w-full input text-sm"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col justify-end pb-0.5">
              <label className="text-xs font-medium mb-1 block" style={{ color: "var(--text-muted)" }}>Enabled</label>
              <button
                type="button"
                onClick={() => set("enabled", !form.enabled)}
                className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: form.enabled ? "var(--accent-dim)" : "var(--bg-muted)",
                  color: form.enabled ? "var(--accent)" : "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}
              >
                {form.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                {form.enabled ? "On" : "Off"}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary text-sm" disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-primary text-sm" disabled={saving}>
              {saving ? "Saving…" : "Save Rule"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function DetectionRules() {
  const [rules, setRules] = useState<DetectionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<DetectionRule | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DetectionRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      const data = await listDetectionRules();
      setRules(data);
    } catch {
      setError("Failed to load detection rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleSave = async (form: DetectionRuleCreate) => {
    setSaving(true);
    try {
      if (modalMode === "edit" && editTarget) {
        const updated = await updateDetectionRule(editTarget.id, form as DetectionRuleUpdate);
        setRules((prev) => prev.map((r) => r.id === updated.id ? updated : r));
      } else {
        const created = await createDetectionRule(form);
        setRules((prev) => [created, ...prev]);
      }
      setModalMode(null);
      setEditTarget(null);
    } catch {
      setError("Failed to save rule.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (rule: DetectionRule) => {
    try {
      const updated = await updateDetectionRule(rule.id, { enabled: !rule.enabled });
      setRules((prev) => prev.map((r) => r.id === updated.id ? updated : r));
    } catch {
      setError("Failed to update rule.");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDetectionRule(deleteTarget.id);
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      setError("Failed to delete rule.");
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (rule: DetectionRule) => {
    setEditTarget(rule);
    setModalMode("edit");
  };

  const formInitial = modalMode === "edit" && editTarget
    ? { name: editTarget.name, description: editTarget.description ?? "", pattern: editTarget.pattern, severity: editTarget.severity, enabled: editTarget.enabled }
    : EMPTY_FORM;

  return (
    <>
      <ConfirmModal
        open={deleteTarget !== null}
        title="Delete Rule"
        message="This detection rule will be permanently removed."
        detail={deleteTarget?.name}
        confirmLabel="Delete Rule"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <AnimatePresence>
        {modalMode && (
          <RuleFormModal
            key="rule-form"
            title={modalMode === "edit" ? "Edit Detection Rule" : "New Detection Rule"}
            initial={formInitial}
            onSave={handleSave}
            onClose={() => { setModalMode(null); setEditTarget(null); }}
            saving={saving}
          />
        )}
      </AnimatePresence>

      <div className="space-y-5">
        {/* ── Header ──────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-start justify-between gap-4"
        >
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.02em" }}
            >
              Detection Rules
            </h1>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
              Regex patterns matched against incoming Wazuh alert descriptions
            </p>
          </div>
          <button className="btn-primary shrink-0" onClick={() => setModalMode("add")}>
            <Plus size={14} /> Add Rule
          </button>
        </motion.div>

        {/* ── Error banner ────────────────────────────────────── */}
        {error && (
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
            style={{ backgroundColor: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", color: "var(--sev-critical-text)" }}
          >
            <AlertCircle size={14} />
            {error}
            <button onClick={() => setError("")} className="ml-auto text-xs underline">Dismiss</button>
          </div>
        )}

        {/* ── Content ─────────────────────────────────────────── */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <RuleSkeleton key={i} />)}
          </div>
        ) : rules.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-16 text-center">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center mb-3"
              style={{ backgroundColor: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}
            >
              <Filter size={22} style={{ color: "#F59E0B" }} />
            </div>
            <p className="font-semibold text-sm" style={{ color: "var(--text-base)" }}>No detection rules yet</p>
            <p className="text-xs mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
              Create regex rules to auto-classify incoming alerts
            </p>
            <button className="btn-primary text-sm" onClick={() => setModalMode("add")}>
              <Plus size={13} /> Add First Rule
            </button>
          </div>
        ) : (
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.04 } } }}
            className="space-y-2"
          >
            {rules.map((rule) => (
              <motion.div
                key={rule.id}
                variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }}
                className="card flex items-center gap-4"
                style={{
                  padding: "0.875rem 1.25rem",
                  borderLeft: `3px solid ${rule.enabled ? "var(--accent)" : "var(--border)"}`,
                  opacity: rule.enabled ? 1 : 0.6,
                }}
              >
                {/* Name + pattern */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--text-base)" }}>{rule.name}</p>
                  {rule.description && (
                    <p className="text-xs truncate mt-0.5" style={{ color: "var(--text-muted)" }}>{rule.description}</p>
                  )}
                  <p
                    className="text-[11px] font-mono mt-1 truncate"
                    style={{ color: "var(--text-subtle)", backgroundColor: "var(--bg-muted)", padding: "1px 6px", borderRadius: "4px", display: "inline-block" }}
                  >
                    {rule.pattern}
                  </p>
                </div>

                {/* Severity */}
                <StatusBadge value={rule.severity} variant="severity" />

                {/* Toggle */}
                <button
                  onClick={() => handleToggle(rule)}
                  title={rule.enabled ? "Disable rule" : "Enable rule"}
                  className="p-1 rounded transition-colors btn-ghost"
                >
                  {rule.enabled
                    ? <ToggleRight size={20} style={{ color: "var(--accent)" }} />
                    : <ToggleLeft  size={20} style={{ color: "var(--text-subtle)" }} />
                  }
                </button>

                {/* Edit */}
                <button
                  onClick={() => openEdit(rule)}
                  className="p-1.5 rounded btn-ghost"
                  title="Edit rule"
                >
                  <Pencil size={13} style={{ color: "var(--text-muted)" }} />
                </button>

                {/* Delete */}
                <button
                  onClick={() => setDeleteTarget(rule)}
                  className="p-1.5 rounded btn-ghost"
                  title="Delete rule"
                >
                  <Trash2 size={13} style={{ color: "var(--sev-high-text)" }} />
                </button>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </>
  );
}
