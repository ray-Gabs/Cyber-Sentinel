/**
 * Admin.tsx — User management panel (admin role only).
 *
 * Features:
 *   - Stats bar: total / admin / analyst / viewer counts
 *   - Filter tabs by role
 *   - User cards with role badge + promote / demote actions
 *   - Responsive: cards stack on mobile, grid on desktop
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  Users, ShieldCheck, Activity,
  RefreshCw, CheckCircle2, AlertCircle, Clock,
  UserX, Search, Wifi, WifiOff, UserCheck, UserMinus, Download,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listUsers, updateUserRole, toggleUserStatus, approveUser, suspendUser, getUserAgentConfigs } from "@/services/authService";
import { downloadAgentCompose } from "@/services/socService";
import type { UserResponse, UserRole } from "@/types";
import { ROUTES, TOKEN_KEY } from "@/lib/constants";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string }> = {
  admin:   { label: "Admin",   color: "#f87171", bg: "rgba(239,68,68,0.10)"   },
  analyst: { label: "Analyst", color: "#00d4ff", bg: "rgba(0,212,255,0.10)"   },
  viewer:  { label: "Viewer",  color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
};

function RoleBadge({ role }: { role: UserRole }) {
  const { label, color, bg } = ROLE_CONFIG[role];
  return (
    <span
      className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ color, background: bg, border: `1px solid ${color}30` }}
    >
      {label}
    </span>
  );
}

function UserInitial({ username }: { username: string }) {
  return (
    <div
      className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0"
      style={{
        background: "rgba(0,212,255,0.10)",
        border: "1px solid rgba(0,212,255,0.20)",
        color: "#00d4ff",
        fontFamily: "Syne, sans-serif",
      }}
    >
      {username[0].toUpperCase()}
    </div>
  );
}

function formatDate(iso?: string): string {
  if (!iso) return "Never";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Admin() {
  const { user: me } = useAuth();
  const navigate      = useNavigate();

  const [users,      setUsers]      = useState<UserResponse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [filter,     setFilter]     = useState<FilterTab>("all");
  const [search,     setSearch]     = useState("");
  const [busy,       setBusy]       = useState<Record<string, boolean>>({});
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null);
  const [adminStats, setAdminStats] = useState<{
    scans:  { total: number; today: number; period: number; trend_pct: number; by_day: {date:string;count:number}[] };
    alerts: { total: number; today: number; critical: number; period: number; trend_pct: number; by_severity: {name:string;count:number}[]; by_day?: {date:string;count:number}[] };
    users:  { total: number; pending: number; active: number; new_today: number; new_period: number; trend_pct: number };
    top_scan_users: {email:string;scans:number}[];
    top_alert_agents: {agent:string;count:number}[];
    range: string;
    generated_at: string;
  } | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsRange,   setStatsRange]   = useState<"7d"|"30d"|"90d">("7d");
  const [exporting,    setExporting]    = useState(false);

  // Redirect non-admins immediately
  useEffect(() => {
    if (me && me.role !== "admin") navigate(ROUTES.DASHBOARD, { replace: true });
  }, [me, navigate]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch {
      setError("Could not load users. Check your connection.");
    } finally {
      setLoading(false);
    }
  }

  const loadStats = useCallback(async (range: "7d"|"30d"|"90d" = "7d") => {
    setStatsLoading(true);
    try {
      const API   = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
      const token = localStorage.getItem(TOKEN_KEY);
      const res   = await fetch(`${API}/api/analytics/admin-stats?range=${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAdminStats(await res.json());
    } catch { /* stats are non-critical */ }
    finally { setStatsLoading(false); }
  }, []);

  async function exportCSV() {
    setExporting(true);
    try {
      const API   = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
      const token = localStorage.getItem(TOKEN_KEY);
      const res   = await fetch(`${API}/api/analytics/admin-stats/export?range=${statsRange}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement("a");
        a.href     = url;
        a.download = `cyber-sentinel-stats-${statsRange}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch { /* non-critical */ }
    finally { setExporting(false); }
  }

  function handleRangeChange(r: "7d"|"30d"|"90d") {
    setStatsRange(r);
    loadStats(r);
  }

  useEffect(() => { load(); loadStats("7d"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  async function changeRole(userId: string, role: UserRole) {
    setBusy((b) => ({ ...b, [userId]: true }));
    try {
      const updated = await updateUserRole(userId, { role });
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      showToast(`${updated.username} is now ${role}`, true);
    } catch {
      showToast("Failed to update role", false);
    } finally {
      setBusy((b) => ({ ...b, [userId]: false }));
    }
  }

  async function toggleStatus(userId: string) {
    setBusy((b) => ({ ...b, [`status_${userId}`]: true }));
    try {
      const updated = await toggleUserStatus(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      showToast(`${updated.username} ${updated.is_active ? "activated" : "deactivated"}`, true);
    } catch {
      showToast("Failed to update account status", false);
    } finally {
      setBusy((b) => ({ ...b, [`status_${userId}`]: false }));
    }
  }

  async function handleApprove(userId: string) {
    setBusy((b) => ({ ...b, [`approve_${userId}`]: true }));
    try {
      const updated = await approveUser(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      showToast(`${updated.username} approved`, true);
    } catch {
      showToast("Failed to approve user", false);
    } finally {
      setBusy((b) => ({ ...b, [`approve_${userId}`]: false }));
    }
  }

  async function handleSuspend(userId: string) {
    setBusy((b) => ({ ...b, [`suspend_${userId}`]: true }));
    try {
      const updated = await suspendUser(userId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      showToast(`${updated.username} suspended`, true);
    } catch {
      showToast("Failed to suspend user", false);
    } finally {
      setBusy((b) => ({ ...b, [`suspend_${userId}`]: false }));
    }
  }

  async function handleDownloadAgentCompose(userId: string) {
    setBusy((b) => ({ ...b, [`agent_${userId}`]: true }));
    try {
      const configs = await getUserAgentConfigs(userId);
      const registered = configs.filter((c) => c.wazuh_agent_registered);
      if (registered.length === 0) {
        showToast("No registered Wazuh agents for this user", false);
        return;
      }
      for (const cfg of registered) {
        await downloadAgentCompose(cfg.project_id, cfg.slug);
      }
      showToast(`Downloaded ${registered.length} agent compose file${registered.length > 1 ? "s" : ""}`, true);
    } catch {
      showToast("Failed to download agent compose", false);
    } finally {
      setBusy((b) => ({ ...b, [`agent_${userId}`]: false }));
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const counts = {
    all:     users.length,
    admin:   users.filter((u) => u.role === "admin").length,
    analyst: users.filter((u) => u.role === "analyst").length,
    viewer:  users.filter((u) => u.role === "viewer").length,
    pending: users.filter((u) => u.status === "pending").length,
  };

  const STATS = [
    { label: "Total",    value: counts.all,     icon: Users,       color: "#64748b", borderLeft: undefined },
    { label: "Pending",  value: counts.pending, icon: Clock,       color: "#f59e0b", borderLeft: "3px solid #f59e0b" },
    { label: "Analysts", value: counts.analyst, icon: Activity,    color: "#00d4ff", borderLeft: "3px solid #00d4ff" },
    { label: "Admins",   value: counts.admin,   icon: ShieldCheck, color: "#f87171", borderLeft: "3px solid #f87171" },
  ];

  // ── Filter ─────────────────────────────────────────────────────────────────
  type FilterTab = "all" | UserRole | "pending";
  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all",     label: "All",     count: counts.all     },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "viewer",  label: "Viewers", count: counts.viewer  },
    { key: "analyst", label: "Analysts",count: counts.analyst },
    { key: "admin",   label: "Admins",  count: counts.admin   },
  ];

  const filtered = (
    filter === "all" ? users
    : filter === "pending" ? users.filter((u) => u.status === "pending")
    : users.filter((u) => u.role === (filter as UserRole))
  )
    .filter((u) =>
      !search ||
      u.username.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:p-8 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            className="text-xl sm:text-2xl font-bold tracking-tight"
            style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.02em" }}
          >
            Admin Panel
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--text-muted)" }}>
            Manage users · review platform analytics · export reports
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all self-start sm:self-auto"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#64748b",
          }}
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {STATS.map(({ label, value, icon: Icon, color, borderLeft }) => (
          <div
            key={label}
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderLeft: borderLeft ?? "1px solid rgba(255,255,255,0.06)",
            }}
          >
            <Icon size={16} style={{ color }} className="shrink-0" />
            <div>
              <p className="text-lg font-bold leading-none" style={{ color: "#c8d8f0" }}>{value}</p>
              <p className="text-[11px] mt-0.5" style={{ color: "#475569" }}>{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Analytics toolbar + charts */}
      <div style={{ marginTop: "28px" }}>
        {/* Toolbar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: "15px", fontWeight: 600, color: "var(--text-base)", margin: 0 }}>
            Platform Analytics
          </h3>
          <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
            {(["7d", "30d", "90d"] as const).map((r) => (
              <button
                key={r}
                onClick={() => handleRangeChange(r)}
                style={{
                  padding: "4px 10px", borderRadius: "5px",
                  fontSize: "11px", fontFamily: "IBM Plex Mono, monospace",
                  border: `1px solid ${statsRange === r ? "var(--accent)" : "var(--border)"}`,
                  background: statsRange === r ? "var(--accent-dim)" : "transparent",
                  color:      statsRange === r ? "var(--accent)"     : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >{r}</button>
            ))}
            <button
              onClick={exportCSV}
              disabled={exporting}
              style={{
                marginLeft: "8px", padding: "4px 12px", borderRadius: "5px",
                fontSize: "11px", fontFamily: "IBM Plex Sans, sans-serif",
                border: "1px solid var(--border)", background: "transparent",
                color: "var(--text-muted)", cursor: exporting ? "wait" : "pointer",
                display: "flex", alignItems: "center", gap: "4px",
              }}
            >
              ↓ {exporting ? "Exporting…" : "Export CSV"}
            </button>
          </div>
        </div>

        {/* Summary stat pills — new today */}
        {adminStats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ marginBottom: "16px" }}>
            {[
              { label: "Scans this period", value: adminStats.scans.period ?? 0,   trend: adminStats.scans.trend_pct,  color: "var(--accent)" },
              { label: "Alerts this period", value: adminStats.alerts.period ?? 0, trend: adminStats.alerts.trend_pct, color: "var(--sev-high)" },
              { label: "Critical alerts",    value: adminStats.alerts.critical ?? 0,trend: null,                       color: "var(--sev-critical)" },
              { label: "New users",          value: adminStats.users?.new_period ?? 0, trend: adminStats.users?.trend_pct, color: "var(--sev-low)" },
            ].map(({ label, value, trend, color }) => (
              <div key={label} style={{
                padding: "12px 14px", borderRadius: "8px",
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderLeft: `3px solid ${color}`,
              }}>
                <div style={{ fontSize: "22px", fontWeight: 700, fontFamily: "Sora, sans-serif", color }}>{value}</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>{label}</div>
                {trend != null && (
                  <div style={{ fontSize: "10px", marginTop: "4px", color: trend >= 0 ? "var(--sev-low)" : "var(--sev-critical)", fontFamily: "IBM Plex Mono, monospace" }}>
                    {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}% vs prev period
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Charts */}
        {!statsLoading && adminStats && (() => {
          const chartTheme = {
            grid: { strokeDasharray: "3 3", stroke: "#1e2730", vertical: false } as const,
            xAxis: { tick: { fill: "#8896a4", fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }, axisLine: { stroke: "#1e2730" }, tickLine: false },
            yAxis: { tick: { fill: "#8896a4", fontSize: 11, fontFamily: "IBM Plex Mono, monospace" }, axisLine: false, tickLine: false },
            tooltip: {
              contentStyle: { background: "#161c23", border: "1px solid #2a3540", borderRadius: "6px", fontFamily: "IBM Plex Mono, monospace", fontSize: "12px", color: "#e8edf2" },
              cursor: { fill: "rgba(0,212,255,0.04)" },
            },
          };
          const SEV_COLORS = ["#EF4444", "#F97316", "#EAB308", "#22C55E", "#00d4ff"];
          const allZero = adminStats.scans.by_day.every((d) => d.count === 0);
          return (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Bar chart — scans per day */}
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 14, fontWeight: 600, marginBottom: 14, color: "#c8d8f0" }}>
                    Scan Activity — {statsRange}
                  </h3>
                  {allZero ? (
                    <p className="text-xs text-center py-8" style={{ color: "#475569" }}>No scans in this period</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={adminStats.scans.by_day}>
                        <CartesianGrid {...chartTheme.grid} />
                        <XAxis dataKey="date" {...chartTheme.xAxis} />
                        <YAxis {...chartTheme.yAxis} />
                        <Tooltip {...chartTheme.tooltip} />
                        <Bar dataKey="count" fill="#00d4ff" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* Donut chart — alerts by severity */}
                <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: 14, fontWeight: 600, marginBottom: 14, color: "#c8d8f0" }}>
                    Alert Severity Breakdown
                  </h3>
                  <div className="flex justify-center">
                    <PieChart width={280} height={200}>
                      <Pie
                        data={adminStats.alerts.by_severity}
                        cx={130} cy={90}
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="count"
                        paddingAngle={2}
                      >
                        {adminStats.alerts.by_severity.map((_, idx) => (
                          <Cell key={idx} fill={SEV_COLORS[idx % SEV_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...chartTheme.tooltip} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        formatter={(value) => (
                          <span style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: "11px", color: "#8896a4" }}>
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </div>
                </div>
              </div>

              {/* Top active users table */}
              {adminStats.top_scan_users?.length > 0 && (
                <div style={{ marginTop: "20px" }}>
                  <h3 style={{ fontFamily: "Sora, sans-serif", fontSize: "14px", fontWeight: 600, color: "var(--text-base)", marginBottom: "10px" }}>
                    Top Active Users
                  </h3>
                  <div style={{ border: "1px solid var(--border)", borderRadius: "8px", overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "IBM Plex Sans, sans-serif", fontSize: "12px" }}>
                      <thead>
                        <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--border)" }}>
                          <th style={{ padding: "8px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>#</th>
                          <th style={{ padding: "8px 14px", textAlign: "left", color: "var(--text-muted)", fontWeight: 500 }}>User</th>
                          <th style={{ padding: "8px 14px", textAlign: "right", color: "var(--text-muted)", fontWeight: 500 }}>Scans</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminStats.top_scan_users.map((u, i) => (
                          <tr key={u.email} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)" }}>
                            <td style={{ padding: "8px 14px", color: "var(--text-muted)", fontFamily: "IBM Plex Mono, monospace" }}>{i + 1}</td>
                            <td style={{ padding: "8px 14px", color: "var(--text-base)" }}>{u.email}</td>
                            <td style={{ padding: "8px 14px", textAlign: "right", color: "var(--accent)", fontFamily: "IBM Plex Mono, monospace", fontWeight: 600 }}>{u.scans}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      {/* Search */}
      <div className="relative">
        <Search
          size={13}
          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
          style={{ color: "var(--text-subtle)" }}
        />
        <input
          type="text"
          placeholder="Search by username or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input pl-9 w-full"
          style={{ maxWidth: "360px" }}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
            style={
              filter === key
                ? { background: "rgba(0,212,255,0.12)", color: "#00d4ff", border: "1px solid rgba(0,212,255,0.28)" }
                : { background: "transparent", color: "#475569", border: "1px solid transparent" }
            }
          >
            {label}
            <span
              className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px]"
              style={{ background: "rgba(255,255,255,0.06)", color: "#64748b" }}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171" }}
        >
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* User list */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl animate-pulse"
              style={{ background: "rgba(255,255,255,0.03)" }}
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: "#334155" }}>
          <UserX size={32} />
          <p className="text-sm">No users in this category</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((u, i) => (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl px-4 py-3"
              style={{
                background: u.id === me?.id ? "rgba(0,212,255,0.05)" : "rgba(255,255,255,0.025)",
                border: u.id === me?.id ? "1px solid rgba(0,212,255,0.18)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* Avatar + info */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <UserInitial username={u.username} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="text-sm font-semibold truncate"
                      style={{ color: "#c8d8f0", fontFamily: "Syne, sans-serif" }}
                    >
                      {u.username}
                    </span>
                    {u.id === me?.id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.12)", color: "#00d4ff" }}>
                        you
                      </span>
                    )}
                    <RoleBadge role={u.role} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    <span className="text-xs truncate" style={{ color: "#475569" }}>{u.email}</span>
                    <span className="flex items-center gap-1 text-[11px]" style={{ color: "#334155" }}>
                      <Clock size={10} />
                      {formatDate(u.last_login)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0 pl-12 sm:pl-0 flex-wrap">
                {/* Wazuh agent badge */}
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={
                    u.wazuh_agent_name
                      ? { backgroundColor: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                      : { backgroundColor: "var(--bg-muted)", color: "var(--text-subtle)", border: "1px solid var(--border)" }
                  }
                >
                  {u.wazuh_agent_name ? <Wifi size={9} /> : <WifiOff size={9} />}
                  {u.wazuh_agent_name ?? "No agent"}
                </span>

                {/* Download agent compose — non-admin users only */}
                {u.id !== me?.id && u.role !== "admin" && (
                  <button
                    disabled={!!busy[`agent_${u.id}`]}
                    onClick={() => handleDownloadAgentCompose(u.id)}
                    title="Download Wazuh agent compose"
                    className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full transition-all disabled:opacity-50"
                    style={{ backgroundColor: "rgba(167,139,250,0.1)", color: "#a78bfa", border: "1px solid rgba(167,139,250,0.2)" }}
                  >
                    {busy[`agent_${u.id}`]
                      ? <RefreshCw size={9} className="animate-spin" />
                      : <Download size={9} />
                    }
                    Agent
                  </button>
                )}

                {/* Status badge */}
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={
                    u.status === "pending"
                      ? { backgroundColor: "rgba(245,158,11,0.1)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }
                      : u.status === "suspended"
                      ? { backgroundColor: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }
                      : { backgroundColor: "rgba(34,197,94,0.08)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                  }
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: u.status === "pending" ? "#fbbf24" : u.status === "suspended" ? "#f87171" : "#4ade80",
                    }}
                  />
                  {u.status === "pending" ? "Pending" : u.status === "suspended" ? "Suspended" : "Active"}
                </span>

                {/* Role dropdown — only for other users */}
                {u.id !== me?.id && (
                  <div className="relative">
                    {busy[u.id] ? (
                      <RefreshCw size={12} className="animate-spin" style={{ color: "var(--text-muted)" }} />
                    ) : (
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value as UserRole)}
                        className="text-xs font-medium px-2.5 py-1.5 rounded-lg cursor-pointer appearance-none pr-6"
                        style={{
                          backgroundColor: ROLE_CONFIG[u.role].bg,
                          color: ROLE_CONFIG[u.role].color,
                          border: `1px solid ${ROLE_CONFIG[u.role].color}30`,
                          outline: "none",
                        }}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="analyst">Analyst</option>
                        <option value="admin">Admin</option>
                      </select>
                    )}
                  </div>
                )}

                {/* Approve — pending users only */}
                {u.id !== me?.id && u.status === "pending" && (
                  <button
                    disabled={!!busy[`approve_${u.id}`]}
                    onClick={() => handleApprove(u.id)}
                    title="Approve account"
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    style={{ backgroundColor: "rgba(34,197,94,0.1)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.25)" }}
                  >
                    {busy[`approve_${u.id}`]
                      ? <RefreshCw size={11} className="animate-spin" />
                      : <UserCheck size={11} />
                    }
                    Approve
                  </button>
                )}

                {/* Suspend — active users only */}
                {u.id !== me?.id && u.status === "active" && (
                  <button
                    disabled={!!busy[`suspend_${u.id}`]}
                    onClick={() => handleSuspend(u.id)}
                    title="Suspend account"
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    style={{ backgroundColor: "rgba(239,68,68,0.08)", color: "#f87171", border: "1px solid rgba(239,68,68,0.2)" }}
                  >
                    {busy[`suspend_${u.id}`]
                      ? <RefreshCw size={11} className="animate-spin" />
                      : <UserMinus size={11} />
                    }
                    Suspend
                  </button>
                )}

                {/* Activate / Deactivate toggle — only for other users */}
                {u.id !== me?.id && (
                  <button
                    disabled={!!busy[`status_${u.id}`]}
                    onClick={() => toggleStatus(u.id)}
                    title={u.is_active ? "Deactivate account" : "Activate account"}
                    className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50"
                    style={
                      u.is_active
                        ? { backgroundColor: "rgba(100,116,139,0.08)", color: "#64748b", border: "1px solid rgba(100,116,139,0.2)" }
                        : { backgroundColor: "rgba(34,197,94,0.08)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }
                    }
                  >
                    {busy[`status_${u.id}`]
                      ? <RefreshCw size={11} className="animate-spin" />
                      : u.is_active ? <UserMinus size={11} /> : <UserCheck size={11} />
                    }
                    {u.is_active ? "Deactivate" : "Activate"}
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium z-50 shadow-lg"
          style={{
            background: toast.ok ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            border: `1px solid ${toast.ok ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            color: toast.ok ? "#4ade80" : "#f87171",
          }}
        >
          {toast.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {toast.msg}
        </motion.div>
      )}
    </div>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

interface ActionButtonProps {
  label: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  busy: boolean;
  onClick: () => void;
}

export function ActionButton({ label, icon, color, bg, border, busy, onClick }: ActionButtonProps) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
      style={{ color, background: bg, border: `1px solid ${border}` }}
    >
      {busy ? <RefreshCw size={11} className="animate-spin" /> : icon}
      {label}
    </button>
  );
}
