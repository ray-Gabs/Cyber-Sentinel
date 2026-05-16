/**
 * AgentsMonitor — live view of all registered Wazuh agents.
 * Shows connection status, OS, IP, last heartbeat per agent.
 * Clicking an agent navigates to alerts filtered by that agent.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getWazuhAgents, type WazuhAgent } from "@/services/alertService";
import { formatDate } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { Icon, PageHead, KPI } from "@/components/ui";

function Spin() {
  return (
    <div
      className="animate-spin rounded-full"
      style={{ width: 24, height: 24, border: "2px solid var(--border)", borderTopColor: "var(--accent)" }}
    />
  );
}

function statusTone(s: string) {
  if (s === "active") return "low";
  if (s === "disconnected") return "critical";
  if (s === "pending") return "medium";
  return "info";
}

function statusLabel(s: string) {
  if (s === "active") return "Active";
  if (s === "disconnected") return "Disconnected";
  if (s === "pending") return "Pending";
  if (s === "never_connected") return "Never connected";
  return s;
}

function AgentRow({ agent, onClick }: { agent: WazuhAgent; onClick: () => void }) {
  const tone = statusTone(agent.status);
  const osLabel = agent.os?.name ?? agent.os?.platform ?? "—";
  const dotColor = agent.status === "active" ? "var(--sev-low)" : "var(--sev-critical)";

  return (
    <div
      className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-white/5 transition-colors"
      style={{ borderBottom: "1px solid var(--border)" }}
      onClick={onClick}
    >
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ background: dotColor, boxShadow: agent.status === "active" ? `0 0 6px ${dotColor}` : "none" }}
      />
      <div className="w-10 shrink-0">
        <span className="mono" style={{ fontSize: 11, color: "var(--text-3)" }}>#{agent.id}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate mono" style={{ color: "var(--text)" }}>{agent.name}</p>
        <p className="text-xs truncate" style={{ color: "var(--text-3)" }}>
          {osLabel}{agent.version ? ` · v${agent.version.replace("Wazuh v", "")}` : ""}
        </p>
      </div>
      <div className="hidden sm:block w-32 shrink-0">
        <span className="mono" style={{ fontSize: 11, color: "var(--text-2)" }}>{agent.ip ?? "—"}</span>
      </div>
      <div className="hidden md:flex items-center gap-1 w-28 shrink-0 flex-wrap">
        {(agent.group ?? []).slice(0, 2).map((g) => (
          <span key={g} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "color-mix(in oklab, var(--accent) 12%, transparent)", color: "var(--accent)" }}>
            {g}
          </span>
        ))}
      </div>
      <div className="hidden lg:block w-36 shrink-0">
        <span className="text-xs" style={{ color: "var(--text-3)" }}>
          {agent.lastKeepAlive ? formatDate(agent.lastKeepAlive) : "—"}
        </span>
      </div>
      <span
        className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
        style={{
          background: `color-mix(in oklab, var(--sev-${tone}) 12%, transparent)`,
          color: `var(--sev-${tone})`,
        }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: `var(--sev-${tone})` }} />
        {statusLabel(agent.status)}
      </span>
      <Icon name="chevR" size={14} style={{ color: "var(--text-3)", flexShrink: 0 }} />
    </div>
  );
}

const AGENTS_PER_PAGE = 10;

export default function AgentsMonitor() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<WazuhAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { agents: data } = await getWazuhAgents();
      setAgents(data.sort((a, b) => {
        if (a.status === "active" && b.status !== "active") return -1;
        if (b.status === "active" && a.status !== "active") return 1;
        return a.name.localeCompare(b.name);
      }));
    } catch {
      setError("Could not reach Wazuh. Check your connection in Settings.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

  const active       = agents.filter((a) => a.status === "active").length;
  const disconnected = agents.filter((a) => a.status === "disconnected").length;
  const pending      = agents.filter((a) => a.status === "pending" || a.status === "never_connected").length;
  const totalPages   = Math.max(1, Math.ceil(agents.length / AGENTS_PER_PAGE));
  const pagedAgents  = agents.slice((page - 1) * AGENTS_PER_PAGE, page * AGENTS_PER_PAGE);

  const handleAgentClick = (agent: WazuhAgent) => {
    navigate(`${ROUTES.ALERTS}?agent_name=${encodeURIComponent(agent.name)}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHead
        eyebrow="WAZUH MANAGER"
        title="Agents Monitor"
        sub="Endpoints reporting to your Wazuh manager · agent groups, OS, version, last keep-alive."
        actions={
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="btn btn-sm flex items-center gap-1.5"
          >
            {refreshing ? <div className="animate-spin rounded-full" style={{ width: 12, height: 12, border: "2px solid var(--border)", borderTopColor: "var(--accent)" }} /> : <Icon name="refresh" size={13} />}
            Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPI label="TOTAL"           value={String(agents.length)} icon="cube" />
        <KPI label="ACTIVE"          value={String(active)}        icon="check"      accent="low" />
        <KPI label="DISCONNECTED"    value={String(disconnected)}  icon="xCircle"    accent="critical" />
        <KPI label="NEVER CONNECTED" value={String(pending)}       icon="minusCircle" accent="medium" />
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {/* Column headers */}
        <div
          className="hidden sm:grid items-center px-4 py-2.5 text-xs font-medium uppercase tracking-wide border-b"
          style={{
            gridTemplateColumns: "0.75rem 2.5rem 1fr 8rem 7rem 9rem 8rem 1rem",
            gap: "1rem",
            color: "var(--text-3)",
            borderColor: "var(--border)",
            background: "var(--bg-2)",
          }}
        >
          <span />
          <span>ID</span>
          <span>Agent</span>
          <span className="hidden sm:block">IP</span>
          <span className="hidden md:block">Groups</span>
          <span className="hidden lg:block">Last Seen</span>
          <span>Status</span>
          <span />
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Spin /></div>
        ) : error ? (
          <div className="flex flex-col items-center py-10 px-4 text-center gap-3">
            <Icon name="server" size={28} style={{ color: "var(--text-3)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>Wazuh unavailable</p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>{error}</p>
            <button onClick={() => navigate(ROUTES.SETTINGS)} className="btn btn-sm">
              Configure in Settings
            </button>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center py-10 gap-2">
            <Icon name="server" size={28} style={{ color: "var(--text-3)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--text-2)" }}>No agents registered</p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              Install the Wazuh agent on your lab hosts to see them here
            </p>
          </div>
        ) : (
          pagedAgents.map((agent) => (
            <AgentRow key={agent.id} agent={agent} onClick={() => handleAgentClick(agent)} />
          ))
        )}

        {!loading && !error && agents.length > 0 && (
          <div
            className="px-4 py-2.5 text-xs border-t flex items-center justify-between"
            style={{ color: "var(--text-3)", borderColor: "var(--border)", background: "var(--bg-2)" }}
          >
            <span>{agents.length} agent{agents.length !== 1 ? "s" : ""} total · click a row to filter alerts by agent</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page === 1}
                  className="btn btn-sm disabled:opacity-40"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                >← Prev</button>
                <span className="mono" style={{ fontSize: 11 }}>
                  {page}/{totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= totalPages}
                  className="btn btn-sm disabled:opacity-40"
                  style={{ fontSize: 11, padding: "2px 8px" }}
                >Next →</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
