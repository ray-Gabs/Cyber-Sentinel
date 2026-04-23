/**
 * DetectionRules — per-user CRUD management for regex-based detection rules.
 *
 * Two sections:
 *   • Platform Rules  — user_id="system", read-only, shared across all users
 *   • My Rules        — owned by the current user, full CRUD
 *
 * Platform rules serve as a global baseline. Users add their own rules on top.
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
import {
  Filter, Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  AlertCircle, Globe, Lock, Info,
} from "lucide-react";
import type { DetectionRule, DetectionRuleCreate, DetectionRuleUpdate } from "@/types";
import { useAuth } from "@/hooks/useAuth";

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
  const [testInput, setTestInput] = useState("");

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

  const testStatus = (() => {
    if (!form.pattern.trim()) return null;
    try { new RegExp(form.pattern); }
    catch { return "invalid" as const; }
    if (!testInput.trim()) return null;
    return new RegExp(form.pattern).test(testInput) ? "match" as const : "no_match" as const;
  })();

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
            {/* Live regex tester */}
            {form.pattern.trim() && (
              <div className="mt-2 rounded-lg p-2.5" style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>Test input</span>
                  {testStatus && (
                    <span
                      className="text-[11px] font-semibold"
                      style={{
                        color: testStatus === "match" ? "#4ade80"
                          : testStatus === "no_match" ? "#fbbf24"
                          : "#f87171",
                      }}
                    >
                      {testStatus === "match" ? "Match" : testStatus === "no_match" ? "No match" : "Invalid regex"}
                    </span>
                  )}
                </div>
                <input
                  className="input text-xs font-mono w-full"
                  placeholder="Paste a sample log line to test…"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                />
              </div>
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

// ── Rule row — user-owned ─────────────────────────────────────────────────
interface UserRuleRowProps {
  rule: DetectionRule;
  onToggle: (rule: DetectionRule) => void;
  onEdit: (rule: DetectionRule) => void;
  onDelete: (rule: DetectionRule) => void;
}

function UserRuleRow({ rule, onToggle, onEdit, onDelete }: UserRuleRowProps) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } }}
      className="card flex items-center gap-4"
      style={{
        padding: "0.875rem 1.25rem",
        borderLeft: `3px solid ${rule.enabled ? "var(--accent)" : "var(--border)"}`,
        opacity: rule.enabled ? 1 : 0.6,
      }}
    >
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
      <StatusBadge value={rule.severity} variant="severity" />
      <button onClick={() => onToggle(rule)} title={rule.enabled ? "Disable" : "Enable"} className="p-1 rounded btn-ghost">
        {rule.enabled
          ? <ToggleRight size={20} style={{ color: "var(--accent)" }} />
          : <ToggleLeft  size={20} style={{ color: "var(--text-subtle)" }} />
        }
      </button>
      <button onClick={() => onEdit(rule)} className="p-1.5 rounded btn-ghost" title="Edit rule">
        <Pencil size={13} style={{ color: "var(--text-muted)" }} />
      </button>
      <button onClick={() => onDelete(rule)} className="p-1.5 rounded btn-ghost" title="Delete rule">
        <Trash2 size={13} style={{ color: "var(--sev-high-text)" }} />
      </button>
    </motion.div>
  );
}

// ── Rule row — platform/global (read-only) ───────────────────────────────
function PlatformRuleRow({ rule }: { rule: DetectionRule }) {
  return (
    <div
      className="flex items-center gap-4 rounded-xl"
      style={{
        padding: "0.875rem 1.25rem",
        backgroundColor: "var(--bg-muted)",
        border: "1px solid var(--border)",
        borderLeft: "3px solid rgba(148,163,184,0.3)",
        opacity: rule.enabled ? 1 : 0.5,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text-muted)" }}>{rule.name}</p>
          <span
            className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0"
            style={{ backgroundColor: "rgba(148,163,184,0.12)", color: "var(--text-subtle)", border: "1px solid var(--border)" }}
          >
            <Globe size={9} /> Platform
          </span>
        </div>
        {rule.description && (
          <p className="text-xs truncate" style={{ color: "var(--text-subtle)" }}>{rule.description}</p>
        )}
        <p
          className="text-[11px] font-mono mt-1 truncate"
          style={{ color: "var(--text-subtle)", backgroundColor: "rgba(0,0,0,0.15)", padding: "1px 6px", borderRadius: "4px", display: "inline-block" }}
        >
          {rule.pattern}
        </p>
      </div>
      <StatusBadge value={rule.severity} variant="severity" />
      <div title="Platform rules cannot be modified" className="p-1.5 rounded" style={{ color: "var(--text-subtle)" }}>
        <Lock size={13} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function DetectionRules() {
  const { user } = useAuth();
  const [rules, setRules]           = useState<DetectionRule[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [modalMode, setModalMode]   = useState<"add" | "edit" | null>(null);
  const [editTarget, setEditTarget] = useState<DetectionRule | null>(null);
  const [saving, setSaving]         = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DetectionRule | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRules(await listDetectionRules());
    } catch {
      setError("Failed to load detection rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  // Split: platform rules (read-only) vs user-owned
  const platformRules = rules.filter((r) => r.user_id === "system");
  const myRules       = rules.filter((r) => r.user_id !== "system");

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

      <div className="space-y-6">
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

        {/* ── How it works ────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.25 }}
          className="flex items-start gap-3 rounded-xl px-4 py-3"
          style={{ backgroundColor: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.15)" }}
        >
          <Info size={14} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
          <div className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text-base)" }}>How detection rules work: </strong>
            When a Wazuh alert arrives via the webhook, its{" "}
            <code className="font-mono text-[11px] px-1 rounded" style={{ backgroundColor: "var(--bg-muted)" }}>rule_description</code>{" "}
            is matched against every enabled rule. Matched rules are stored on the alert and used to
            classify severity. <strong style={{ color: "var(--text-base)" }}>Platform Rules</strong> apply to
            all users. <strong style={{ color: "var(--text-base)" }}>My Rules</strong> are private to your account.
          </div>
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

        {/* ── Loading skeletons ────────────────────────────────── */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <RuleSkeleton key={i} />)}
          </div>
        )}

        {!loading && (
          <>
            {/* ── My Rules ──────────────────────────────────────── */}
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.25 }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-base)" }}>
                    My Rules
                  </h2>
                  {myRules.length > 0 && (
                    <span
                      className="text-[11px] px-1.5 py-0.5 rounded font-mono"
                      style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-subtle)", border: "1px solid var(--border)" }}
                    >
                      {myRules.length}
                    </span>
                  )}
                </div>
                <span className="text-xs" style={{ color: "var(--text-subtle)" }}>
                  Visible only to: <strong style={{ color: "var(--text-muted)" }}>{user?.username ?? "you"}</strong>
                </span>
              </div>

              {myRules.length === 0 ? (
                <div className="card flex flex-col items-center justify-center py-10 text-center">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                    style={{ backgroundColor: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.2)" }}
                  >
                    <Filter size={18} style={{ color: "#F59E0B" }} />
                  </div>
                  <p className="font-semibold text-sm" style={{ color: "var(--text-base)" }}>No rules yet</p>
                  <p className="text-xs mt-1 mb-4" style={{ color: "var(--text-muted)" }}>
                    Create your own regex rules to auto-classify alerts
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
                  {myRules.map((rule) => (
                    <UserRuleRow
                      key={rule.id}
                      rule={rule}
                      onToggle={handleToggle}
                      onEdit={openEdit}
                      onDelete={setDeleteTarget}
                    />
                  ))}
                </motion.div>
              )}
            </motion.section>

            {/* ── Platform Rules ─────────────────────────────────── */}
            {platformRules.length > 0 && (
              <motion.section
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.25 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Globe size={13} style={{ color: "var(--text-subtle)" }} />
                  <h2 className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
                    Platform Rules
                  </h2>
                  <span
                    className="text-[11px] px-1.5 py-0.5 rounded font-mono"
                    style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-subtle)", border: "1px solid var(--border)" }}
                  >
                    {platformRules.length}
                  </span>
                  <span className="text-xs ml-1" style={{ color: "var(--text-subtle)" }}>
                    · shared across all users · read-only
                  </span>
                </div>
                <div className="space-y-2">
                  {platformRules.map((rule) => (
                    <PlatformRuleRow key={rule.id} rule={rule} />
                  ))}
                </div>
              </motion.section>
            )}
          </>
        )}
      </div>
    </>
  );
}
