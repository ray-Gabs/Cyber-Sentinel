/**
 * UserProjects — SOC project management page.
 * Each project maps to a monitored target + Wazuh agent deployment.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Download, ExternalLink, Server, RefreshCw, X,
} from "lucide-react";
import api from "@/services/api";

interface SocProject {
  id: string;
  name: string;
  slug: string;
  target_url: string;
  description?: string;
  wazuh_agent_registered: boolean;
  wazuh_agent_id?: string;
  wazuh_agent_name?: string;
  created_at: string;
}

interface CreateForm {
  name: string;
  target_url: string;
  description: string;
}

export default function UserProjects() {
  const [projects, setProjects]   = useState<SocProject[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]           = useState<CreateForm>({ name: "", target_url: "", description: "" });
  const [creating, setCreating]   = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<SocProject[]>("/soc/");
      setProjects(res.data);
    } catch {
      setError("Failed to load projects. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openModal() {
    setForm({ name: "", target_url: "", description: "" });
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate() {
    if (!form.name.trim() || !form.target_url.trim()) {
      setFormError("Name and target URL are required.");
      return;
    }
    setCreating(true);
    setFormError(null);
    try {
      const res = await api.post<SocProject>("/soc/", {
        name: form.name.trim(),
        target_url: form.target_url.trim(),
        description: form.description.trim() || undefined,
      });
      setProjects(prev => [...prev, res.data]);
      setShowModal(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to create project.";
      setFormError(msg);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this project and its agent config?")) return;
    setDeleting(id);
    try {
      await api.delete(`/soc/${id}`);
      setProjects(prev => prev.filter(p => p.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function handleDownloadCompose(id: string, slug: string) {
    const res = await api.get(`/soc/${id}/agent-compose`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const a   = document.createElement("a");
    a.href = url;
    a.download = `wazuh-agent-${slug}.yml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-xl font-semibold"
            style={{ color: "var(--text-base)", fontFamily: "Syne, sans-serif" }}
          >
            Projects
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Monitored targets and Wazuh agent deployments
          </p>
        </div>
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
          style={{ backgroundColor: "var(--accent)", color: "#000" }}
        >
          <Plus size={14} />
          New Project
        </button>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div
          className="mb-4 px-4 py-3 rounded-lg text-sm"
          style={{
            backgroundColor: "rgba(239,68,68,0.08)",
            color: "#f87171",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          {error}
        </div>
      )}

      {/* ── Loading skeletons ──────────────────────────────────────────────── */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <div
              key={i}
              className="h-44 rounded-xl animate-pulse"
              style={{ backgroundColor: "var(--bg-surface)" }}
            />
          ))}
        </div>
      )}

      {/* ── Empty state ────────────────────────────────────────────────────── */}
      {!loading && !error && projects.length === 0 && (
        <div className="py-20 text-center">
          <Server
            size={32}
            className="mx-auto mb-3 opacity-25"
            style={{ color: "var(--text-muted)" }}
          />
          <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
            No projects yet
          </p>
          <p
            className="text-xs mt-1 mb-5"
            style={{ color: "var(--text-subtle)" }}
          >
            Create a project, deploy a Wazuh agent, and start monitoring.
          </p>
          <button
            onClick={openModal}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90"
            style={{ backgroundColor: "var(--accent)", color: "#000" }}
          >
            Create your first project
          </button>
        </div>
      )}

      {/* ── Projects grid ──────────────────────────────────────────────────── */}
      {!loading && projects.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence>
            {projects.map(project => (
              <motion.div
                key={project.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.18 }}
                className="rounded-xl p-4 flex flex-col gap-3"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                }}
              >
                {/* Name + agent badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3
                      className="text-sm font-semibold truncate"
                      style={{ color: "var(--text-base)" }}
                    >
                      {project.name}
                    </h3>
                    <a
                      href={project.target_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-[11px] mt-0.5 hover:underline"
                      style={{ color: "var(--text-subtle)" }}
                    >
                      <ExternalLink size={9} />
                      {project.target_url}
                    </a>
                  </div>
                  <AgentBadge registered={project.wazuh_agent_registered} />
                </div>

                {/* Description */}
                {project.description && (
                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-subtle)" }}>
                    {project.description}
                  </p>
                )}

                {/* Agent name chip */}
                {project.wazuh_agent_name && (
                  <div
                    className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded"
                    style={{
                      backgroundColor: "rgba(34,197,94,0.07)",
                      color: "#4ade80",
                      border: "1px solid rgba(34,197,94,0.18)",
                    }}
                  >
                    <Server size={10} />
                    {project.wazuh_agent_name}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 mt-auto pt-1">
                  <button
                    onClick={() => handleDownloadCompose(project.id, project.slug)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium flex-1 justify-center transition-colors"
                    style={{
                      backgroundColor: "rgba(59,130,246,0.08)",
                      color: "#60a5fa",
                      border: "1px solid rgba(59,130,246,0.2)",
                    }}
                  >
                    <Download size={11} />
                    Deploy Agent
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    disabled={deleting === project.id}
                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--bg-muted)]"
                    style={{ color: "var(--text-subtle)" }}
                    title="Delete project"
                  >
                    {deleting === project.id
                      ? <RefreshCw size={13} className="animate-spin" />
                      : <Trash2 size={13} />}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Create modal ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowModal(false)}
            />
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="w-full max-w-md rounded-xl p-6 pointer-events-auto"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
                }}
              >
                <div className="flex items-center justify-between mb-5">
                  <h2
                    className="text-base font-semibold"
                    style={{ color: "var(--text-base)", fontFamily: "Syne, sans-serif" }}
                  >
                    New Project
                  </h2>
                  <button
                    onClick={() => setShowModal(false)}
                    className="p-1 rounded-lg transition-colors hover:bg-[var(--bg-muted)]"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <X size={15} />
                  </button>
                </div>

                <div className="space-y-4">
                  <Field label="Project Name">
                    <input
                      type="text"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="e.g. Juice Shop"
                      autoFocus
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Target URL">
                    <input
                      type="url"
                      value={form.target_url}
                      onChange={e => setForm(f => ({ ...f, target_url: e.target.value }))}
                      placeholder="http://192.168.1.x:3000"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </Field>

                  <Field label="Description" optional>
                    <input
                      type="text"
                      value={form.description}
                      onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What are you monitoring?"
                      className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                      style={inputStyle}
                    />
                  </Field>

                  {formError && (
                    <p className="text-xs" style={{ color: "#f87171" }}>
                      {formError}
                    </p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setShowModal(false)}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-muted)" }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreate}
                      disabled={creating}
                      className="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: "var(--accent)",
                        color: "#000",
                        opacity: creating ? 0.7 : 1,
                      }}
                    >
                      {creating && <RefreshCw size={13} className="animate-spin" />}
                      Create
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function AgentBadge({ registered }: { registered: boolean }) {
  return registered ? (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
      style={{
        backgroundColor: "rgba(34,197,94,0.1)",
        color: "#4ade80",
        border: "1px solid rgba(34,197,94,0.2)",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#4ade80" }} />
      Connected
    </span>
  ) : (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
      style={{
        backgroundColor: "rgba(245,158,11,0.1)",
        color: "#fbbf24",
        border: "1px solid rgba(245,158,11,0.2)",
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: "#fbbf24" }} />
      Pending
    </span>
  );
}

function Field({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        className="block text-xs font-medium mb-1.5"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
        {optional && (
          <span className="ml-1 font-normal" style={{ color: "var(--text-subtle)" }}>
            (optional)
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  backgroundColor: "var(--bg-base)",
  border: "1px solid var(--border)",
  color: "var(--text-base)",
};
