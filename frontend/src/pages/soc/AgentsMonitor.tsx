/**
 * AgentsMonitor — live view of all registered Wazuh agents.
 * Shows connection status, OS, IP, last heartbeat per agent.
 * Clicking an agent navigates to alerts filtered by that agent.
 */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { getWazuhAgents, type WazuhAgent } from "@/services/alertService";
import LoadingSpinner from "@/components/common/LoadingSpinner";
import { formatDate } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import {
  Monitor,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Wifi,
  WifiOff,
  ChevronRight,
  Server,
} from "lucide-react";

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  active:       { label: "Active",       color: "#4ade80", bg: "rgba(34,197,94,0.1)",   icon: CheckCircle2 },
  disconnected: { label: "Disconnected", color: "#f87171", bg: "rgba(239,68,68,0.1)",   icon: XCircle },
  pending:      { label: "Pending",      color: "#fbbf24", bg: "rgba(251,191,36,0.1)",  icon: Clock },
  never_connected: { label: "Never connected", color: "#94a3b8", bg: "rgba(148,163,184,0.1)", icon: WifiOff },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.disconnected;
  const Icon = cfg.icon;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      <Icon size={10} />
      {cfg.label}
    </span>
  );
}

function AgentRow({ agent, onClick }: { agent: WazuhAgent; onClick: () => void }) {
  const isActive = agent.status === "active";
  const osLabel = agent.os?.name ?? agent.os?.platform ?? "—";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      className="group flex items-center gap-4 px-4 py-3 rounded-lg cursor-pointer transition-colors"
      style={{ border: "1px solid var(--border)", backgroundColor: "var(--bg-surface)" }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-muted)")}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface)")}
    >
      {/* Agent status indicator */}
      <div
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: isActive ? "#4ade80" : "#f87171", boxShadow: isActive ? "0 0 6px rgba(74,222,128,0.5)" : "none" }}
      />

      {/* Agent ID + name */}
      <div className="w-10 shrink-0">
        <p className="text-[11px] font-mono font-medium" style={{ color: "var(--text-subtle)" }}>
          #{agent.id}
        </p>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" style={{ color: "var(--text-base)" }}>
          {agent.name}
        </p>
        <p className="text-xs truncate" style={{ color: "var(--text-subtle)" }}>
          {osLabel}
          {agent.version ? ` · v${agent.version.replace("Wazuh v", "")}` : ""}
        </p>
      </div>

      {/* IP */}
      <div className="hidden sm:block w-32 shrink-0">
        <p className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
          {agent.ip ?? "—"}
        </p>
      </div>

      {/* Groups */}
      <div className="hidden md:flex items-center gap-1 w-28 shrink-0 flex-wrap">
        {(agent.group ?? []).slice(0, 2).map((g) => (
          <span
            key={g}
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{ backgroundColor: "rgba(59,130,246,0.1)", color: "var(--accent)" }}
          >
            {g}
          </span>
        ))}
      </div>

      {/* Last heartbeat */}
      <div className="hidden lg:block w-36 shrink-0">
        <p className="text-xs" style={{ color: "var(--text-subtle)" }}>
          {agent.lastKeepAlive ? formatDate(agent.lastKeepAlive) : "—"}
        </p>
      </div>

      {/* Status pill */}
      <StatusPill status={agent.status} />

      <ChevronRight
        size={14}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--text-subtle)" }}
      />
    </motion.div>
  );
}

export default function AgentsMonitor() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState<WazuhAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const { agents: data } = await getWazuhAgents();
      // Sort: active first, then by name
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

  const active = agents.filter((a) => a.status === "active").length;
  const disconnected = agents.filter((a) => a.status === "disconnected").length;
  const pending = agents.filter((a) => a.status === "pending" || a.status === "never_connected").length;

  const handleAgentClick = (agent: WazuhAgent) => {
    navigate(`${ROUTES.ALERTS}?agent_name=${encodeURIComponent(agent.name)}`);
  };

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-xl"
            style={{ backgroundColor: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.18)" }}
          >
            <Monitor size={16} style={{ color: "#22c55e" }} />
          </div>
          <div>
            <h1
              className="text-2xl font-bold"
              style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
            >
              Agent Monitor
            </h1>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Wazuh agents registered to this manager
            </p>
          </div>
        </div>

        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="btn-secondary gap-1.5"
          style={{ fontSize: "0.8125rem" }}
        >
          {refreshing ? <LoadingSpinner size="sm" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </motion.div>

      {/* Stats row */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.25 }}
        className="grid grid-cols-3 gap-3"
      >
        {[
          { label: "Active",       value: active,       color: "#4ade80", icon: Wifi },
          { label: "Disconnected", value: disconnected,  color: "#f87171", icon: WifiOff },
          { label: "Pending",      value: pending,       color: "#fbbf24", icon: Clock },
        ].map(({ label, value, color, icon: Icon }) => (
          <div
            key={label}
            className="card flex items-center gap-3"
            style={{ padding: "0.75rem 1rem" }}
          >
            <div
              className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0"
              style={{ backgroundColor: `${color}14`, border: `1px solid ${color}30` }}
            >
              <Icon size={14} style={{ color }} />
            </div>
            <div>
              <p className="text-xl font-bold leading-none" style={{ color: "var(--text-base)" }}>
                {loading ? "—" : value}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{label}</p>
            </div>
          </div>
        ))}
      </motion.div>

      {/* Agent list */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.25 }}
        className="card"
        style={{ padding: 0, overflow: "hidden" }}
      >
        {/* Table header */}
        <div
          className="hidden sm:grid grid-cols-[1.5rem_2.5rem_1fr_8rem_7rem_9rem_6.5rem_1.5rem] gap-4 items-center px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide border-b"
          style={{ color: "var(--text-subtle)", borderColor: "var(--border)", backgroundColor: "var(--bg-muted)" }}
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

        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner size="lg" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center py-10 px-4 text-center">
              <Server size={28} className="mb-3" style={{ color: "var(--text-subtle)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
                Wazuh unavailable
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>{error}</p>
              <button
                onClick={() => navigate(ROUTES.SETTINGS)}
                className="btn-secondary mt-4 gap-1.5"
                style={{ fontSize: "0.8125rem" }}
              >
                Configure in Settings
              </button>
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center py-10">
              <Monitor size={28} className="mb-3" style={{ color: "var(--text-subtle)" }} />
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>No agents registered</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-subtle)" }}>
                Install the Wazuh agent on your lab hosts to see them here
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {agents.map((agent, i) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03, duration: 0.2 }}
                >
                  <AgentRow agent={agent} onClick={() => handleAgentClick(agent)} />
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {!loading && !error && agents.length > 0 && (
          <div
            className="px-4 py-2.5 text-xs border-t"
            style={{ color: "var(--text-subtle)", borderColor: "var(--border)", backgroundColor: "var(--bg-muted)" }}
          >
            {agents.length} agent{agents.length !== 1 ? "s" : ""} total · click a row to filter alerts by agent
          </div>
        )}
      </motion.div>
    </div>
  );
}
