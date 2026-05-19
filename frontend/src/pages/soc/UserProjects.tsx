/**
 * UserProjects — SOC project management page.
 * Each project maps to a monitored target + Wazuh agent deployment.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import api from "@/services/api";
import { Icon, PageHead, Btn, Status } from "@/components/ui";
import ConfirmModal from "@/components/common/ConfirmModal";
import { showToast } from "@/components/common/GlobalToast";

interface SocProject {
  id: string;
  name: string;
  slug: string;
  target_url: string;
  description?: string;
  wazuh_agent_registered: boolean;
  wazuh_agent_id?: string;
  wazuh_agent_name?: string;
  install_cmd?: string;
  created_at: string;
}

interface CreateForm {
  name: string;
  target_url: string;
  description: string;
  wazuh_agent_name: string;
}

export default function UserProjects() {
  const [projects, setProjects] = useState<SocProject[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm]         = useState<CreateForm>({ name: "", target_url: "", description: "", wazuh_agent_name: "" });
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleting, setDeleting]               = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [checking, setChecking]               = useState<string | null>(null);
  const [copied, setCopied]                   = useState<string | null>(null);

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

  // Auto-poll unregistered projects every 20s — one batch call instead of N individual ones
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    const pending = projects.filter((p) => !p.wazuh_agent_registered);
    if (pending.length === 0) {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
      return;
    }
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      const stillPending = projects.filter((p) => !p.wazuh_agent_registered);
      if (stillPending.length === 0) { clearInterval(pollingRef.current!); pollingRef.current = null; return; }
      try {
        const res = await api.post<{ results: { project_id: string; status: string; wazuh_agent_id?: string }[] }>(
          "/soc/batch-agent-status",
          { project_ids: stillPending.map((p) => p.id) },
        );
        for (const r of res.data.results) {
          if (r.status === "connected") {
            setProjects((prev) =>
              prev.map((p) => p.id === r.project_id ? { ...p, wazuh_agent_registered: true, wazuh_agent_id: r.wazuh_agent_id ?? p.wazuh_agent_id } : p)
            );
            const proj = stillPending.find((p) => p.id === r.project_id);
            if (proj) showToast(`Agent "${proj.wazuh_agent_name || proj.slug}" connected!`, "success");
          }
        }
      } catch { /* silent */ }
    }, 20_000);
    return () => { if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; } };
  }, [projects]);

  function openModal() {
    setForm({ name: "", target_url: "", description: "", wazuh_agent_name: "" });
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
        wazuh_agent_name: form.wazuh_agent_name.trim() || undefined,
      });
      setProjects((prev) => [...prev, res.data]);
      setShowModal(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create project.");
    } finally {
      setCreating(false);
    }
  }

  function handleDelete(id: string) {
    setConfirmDeleteId(id);
  }

  async function executeDelete() {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeleting(id);
    try {
      await api.delete(`/soc/${id}`);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  async function handleDownloadCompose(id: string, slug: string) {
    const res = await api.get(`/soc/${id}/agent-compose`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data as Blob);
    const a   = document.createElement("a");
    a.href     = url;
    a.download = `wazuh-agent-${slug}.yml`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleCopy(id: string, cmd: string) {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(cmd);
      } else {
        const el = document.createElement("textarea");
        el.value = cmd;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      }
    } catch {
      showToast("Copy failed. Please copy the command manually.", "warning");
    }
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleCheckStatus(id: string) {
    setChecking(id);
    try {
      const res = await api.get<{ status: string; wazuh_agent_id?: string }>(`/soc/${id}/agent-status`);
      if (res.data.status === "connected") {
        await api.patch(`/soc/${id}`, {
          wazuh_agent_registered: true,
          wazuh_agent_id: res.data.wazuh_agent_id || undefined,
        });
        setProjects((prev) =>
          prev.map((p) => p.id === id ? { ...p, wazuh_agent_registered: true } : p)
        );
      } else {
        showToast(`Agent status: ${res.data.status}. Make sure the agent container is running.`, "warning");
      }
    } catch {
      showToast("Could not reach the agent-status endpoint.", "error");
    } finally {
      setChecking(null);
    }
  }

  const connected = projects.filter((p) => p.wazuh_agent_registered).length;

  return (
    <>
    <ConfirmModal
      open={!!confirmDeleteId}
      title="Delete Project"
      message="Delete this project and its agent config?"
      detail="This action cannot be undone."
      confirmLabel="Delete"
      variant="danger"
      loading={!!deleting}
      onConfirm={executeDelete}
      onCancel={() => setConfirmDeleteId(null)}
    />
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Error banner */}
      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: 8, fontSize: 13,
          background: "rgba(239,68,68,0.08)", color: "#f87171",
          border: "1px solid rgba(239,68,68,0.2)",
        }}>
          {error}
        </div>
      )}

      <PageHead
        eyebrow={`MONITORED TARGETS · ${projects.length} PROJECT${projects.length !== 1 ? "S" : ""} · ${connected}/${projects.length} AGENTS CONNECTED`}
        title="My Projects"
        sub="Each project pairs a Wazuh agent group with a pentest target."
        actions={
          <div className="row" style={{ gap: 8 }}>
            <Btn size="sm" variant="primary" icon="plus" onClick={openModal}>New Project</Btn>
          </div>
        }
      />

      {/* Loading skeletons */}
      {loading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--gap-md)" }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{ height: 200, borderRadius: 12, background: "var(--surface)" }}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && projects.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ padding: "48px 0", textAlign: "center" }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, margin: "0 auto 12px",
              background: "var(--surface)", display: "grid", placeItems: "center",
            }}>
              <Icon name="server" size={20} style={{ color: "var(--text-3)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>No projects yet</p>
            <p className="text-xs" style={{ color: "var(--text-3)", marginTop: 4, marginBottom: 20 }}>
              A project links a monitored target to a Wazuh agent deployment.
            </p>
            <Btn variant="primary" size="sm" onClick={openModal}>Create your first project</Btn>
          </div>

          {/* Quick-start guide */}
          <div className="card">
            <div className="card-head">
              <span className="eyebrow">How it works</span>
            </div>
            <div style={{ padding: "0 var(--pad-card) var(--pad-card)" }}>
              <ol style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {([
                  ["1", "Create a project", "Give it a name and the target URL (e.g. http://192.168.1.x:3000)"],
                  ["2", "Download the agent compose", "Click \"Deploy Agent\" to get a pre-configured docker-compose.yml for that project"],
                  ["3", "Run it on the target host", "docker compose up -d on the machine running Juice Shop / DVWA"],
                  ["4", "Alerts flow in automatically", "The Wazuh agent monitors the host and pushes events to Cyber Sentinel via webhook"],
                ] as const).map(([num, title, desc]) => (
                  <li key={num} className="row" style={{ gap: 12, alignItems: "flex-start" }}>
                    <span style={{
                      width: 20, height: 20, borderRadius: "50%", flexShrink: 0, marginTop: 2,
                      background: "rgba(59,130,246,0.15)", color: "var(--accent)",
                      fontSize: 10, fontWeight: 700, display: "grid", placeItems: "center",
                    }}>
                      {num}
                    </span>
                    <div>
                      <p className="text-xs font-medium" style={{ color: "var(--text-1)" }}>{title}</p>
                      <p className="text-xs" style={{ color: "var(--text-3)", marginTop: 2 }}>{desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Projects grid */}
      {!loading && projects.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "var(--gap-md)" }}>
          {projects.map((project) => (
            <div key={project.id} className="card" style={{ overflow: "hidden", padding: 0 }}>
              <div style={{ padding: "var(--pad-card)" }}>
                {/* Header row */}
                <div className="between" style={{ marginBottom: 12 }}>
                  <div className="row" style={{ gap: 10, minWidth: 0 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                      background: project.wazuh_agent_registered ? "var(--sev-low-bg)" : "var(--sev-medium-bg)",
                      color: project.wazuh_agent_registered ? "var(--sev-low)" : "var(--sev-medium)",
                      display: "grid", placeItems: "center",
                      border: `1px solid ${project.wazuh_agent_registered ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.25)"}`,
                    }}>
                      <Icon name="cube" size={16} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p className="text-sm font-semibold" style={{ color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {project.name}
                      </p>
                      <a
                        href={project.target_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono"
                        style={{ fontSize: 11, color: "var(--text-3)", textDecoration: "none" }}
                      >
                        {project.target_url}
                      </a>
                    </div>
                  </div>
                  <Status tone={project.wazuh_agent_registered ? "low" : "medium"}>
                    {project.wazuh_agent_registered ? "CONNECTED" : "PENDING"}
                  </Status>
                </div>

                {/* Description */}
                <p style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.55, margin: "4px 0 14px", minHeight: 32 }}>
                  {project.description || "No description."}
                </p>

                {/* Stats grid */}
                <div style={{
                  display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
                  background: "var(--bg-2)", border: "1px solid var(--border)",
                  borderRadius: 8, padding: 12, marginBottom: 14,
                }}>
                  <div style={{ borderRight: "1px solid var(--border)" }}>
                    <div className="eyebrow">Agent</div>
                    <div className="mono" style={{ fontSize: 11, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {project.wazuh_agent_name || project.slug || "—"}
                    </div>
                  </div>
                  <div style={{ borderRight: "1px solid var(--border)", paddingLeft: 12 }}>
                    <div className="eyebrow">ID</div>
                    <div className="mono" style={{ fontSize: 11, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {project.wazuh_agent_id || "—"}
                    </div>
                  </div>
                  <div style={{ paddingLeft: 12 }}>
                    <div className="eyebrow">Added</div>
                    <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-2)" }}>
                      {formatRelative(project.created_at)}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="row" style={{ gap: 6, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                  {project.wazuh_agent_registered ? (
                    <Link
                      to={`/alerts?agent_name=${encodeURIComponent(project.wazuh_agent_name || project.slug)}`}
                      className="btn btn-sm row"
                      style={{
                        flex: 1, justifyContent: "center", gap: 6,
                        background: "rgba(245,158,11,0.08)", color: "#fbbf24",
                        border: "1px solid rgba(245,158,11,0.2)",
                      }}
                    >
                      <Icon name="alert" size={12} />
                      View Alerts
                      <Icon name="chevR" size={11} />
                    </Link>
                  ) : (
                    <>
                      {project.install_cmd && (
                        <button
                          onClick={() => handleCopy(project.id, project.install_cmd!)}
                          className="btn btn-sm row"
                          style={{
                            flex: 1, justifyContent: "center", gap: 6,
                            background: copied === project.id ? "rgba(34,197,94,0.08)" : "rgba(59,130,246,0.08)",
                            color: copied === project.id ? "var(--sev-low)" : "var(--accent)",
                            border: `1px solid ${copied === project.id ? "rgba(34,197,94,0.2)" : "rgba(59,130,246,0.2)"}`,
                          }}
                        >
                          <Icon name={copied === project.id ? "check" : "copy"} size={11} />
                          {copied === project.id ? "Copied!" : "Copy Install Cmd"}
                        </button>
                      )}
                      <button
                        onClick={() => handleCheckStatus(project.id)}
                        disabled={checking === project.id}
                        className="btn btn-sm"
                        title="Check if agent is connected"
                      >
                        <Icon
                          name="refresh"
                          size={13}
                          style={{ animation: checking === project.id ? "spin 1s linear infinite" : "none" }}
                        />
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => handleDownloadCompose(project.id, project.slug)}
                    className="btn btn-sm"
                    title="Download agent compose"
                  >
                    <Icon name="download" size={13} />
                  </button>
                  <button
                    onClick={() => handleDelete(project.id)}
                    disabled={deleting === project.id}
                    className="btn btn-sm"
                    title="Delete project"
                  >
                    {deleting === project.id
                      ? <div className="animate-spin rounded-full" style={{ width: 13, height: 13, border: "2px solid var(--border)", borderTopColor: "var(--sev-critical)" }} />
                      : <Icon name="trash" size={13} />
                    }
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Add new card */}
          <button
            className="card"
            onClick={openModal}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              minHeight: 240, cursor: "pointer", borderStyle: "dashed",
              background: "transparent", width: "100%",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div style={{
                width: 44, height: 44, borderRadius: 10, margin: "0 auto 12px",
                background: "var(--accent-soft)", color: "var(--accent)",
                display: "grid", placeItems: "center",
              }}>
                <Icon name="plus" size={18} />
              </div>
              <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>Add new project</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--text-3)", marginTop: 4 }}>PAIR AGENT + TARGET</div>
            </div>
          </button>
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="card w-full max-w-md" style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.5)" }}>
            <div className="card-head between">
              <div className="row" style={{ gap: 8 }}>
                <Icon name="plus" size={15} style={{ color: "var(--accent)" }} />
                <span className="text-sm font-semibold">New Project</span>
              </div>
              <button onClick={() => setShowModal(false)} className="btn btn-sm" style={{ padding: "4px 6px" }}>
                <Icon name="x" size={13} />
              </button>
            </div>

            <div style={{ padding: "var(--pad-card)", display: "flex", flexDirection: "column", gap: 16 }}>
              <FormField label="Project Name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Juice Shop"
                  autoFocus
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
                />
              </FormField>

              <FormField label="Target URL">
                <input
                  type="url"
                  value={form.target_url}
                  onChange={(e) => setForm((f) => ({ ...f, target_url: e.target.value }))}
                  placeholder="http://192.168.1.x:3000"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
                />
              </FormField>

              <FormField label="Description" optional>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="What are you monitoring?"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
                />
              </FormField>

              <FormField label="Agent Name" optional>
                <input
                  type="text"
                  value={form.wazuh_agent_name}
                  onChange={(e) => setForm((f) => ({ ...f, wazuh_agent_name: e.target.value }))}
                  placeholder={form.name ? form.name.toLowerCase().replace(/\s+/g, "-") : "e.g. dvwa or juice-shop"}
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
                  style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--text-1)" }}
                />
                <p className="text-[11px]" style={{ marginTop: 4, color: "var(--text-3)" }}>
                  Hostname of an existing Wazuh agent. Leave blank to use the project name.
                </p>
              </FormField>

              {formError && (
                <p className="text-xs" style={{ color: "#f87171" }}>{formError}</p>
              )}

              <div className="row" style={{ gap: 8, paddingTop: 4 }}>
                <button
                  onClick={() => setShowModal(false)}
                  className="btn btn-sm"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <Btn
                  variant="primary"
                  size="sm"
                  loading={creating}
                  disabled={creating}
                  onClick={handleCreate}
                  style={{ flex: 1 }}
                >
                  Create
                </Btn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
}

/* ── Helpers ──────────────────────────────────────────── */

function parseUtcDate(iso: string): Date {
  if (!iso.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(iso)) return new Date(iso + "Z");
  return new Date(iso);
}

function formatRelative(iso: string): string {
  const diff = Date.now() - parseUtcDate(iso).getTime();
  const days  = Math.floor(diff / 86_400_000);
  if (days === 0)  return "today";
  if (days === 1)  return "yesterday";
  if (days < 30)   return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

function FormField({
  label,
  optional,
  children,
}: {
  label: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label className="eyebrow">
        {label}
        {optional && <span style={{ fontWeight: 400, color: "var(--text-3)", marginLeft: 4 }}>(optional)</span>}
      </label>
      {children}
    </div>
  );
}
