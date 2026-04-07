/**
 * Admin.tsx — User management panel (admin role only).
 *
 * Features:
 *   - Stats bar: total / admin / analyst / viewer counts
 *   - Filter tabs by role
 *   - User cards with role badge + promote / demote actions
 *   - Responsive: cards stack on mobile, grid on desktop
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Users, ShieldCheck, Eye, Activity,
  RefreshCw, CheckCircle2, AlertCircle, Clock,
  ChevronUp, ChevronDown, UserX,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listUsers, updateUserRole } from "@/services/authService";
import type { UserResponse, UserRole } from "@/types";
import { ROUTES } from "@/lib/constants";

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROLE_CONFIG: Record<UserRole, { label: string; color: string; bg: string }> = {
  admin:   { label: "Admin",   color: "#f87171", bg: "rgba(239,68,68,0.10)"   },
  analyst: { label: "Analyst", color: "#60a5fa", bg: "rgba(59,130,246,0.10)"  },
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
        background: "rgba(59,130,246,0.12)",
        border: "1px solid rgba(59,130,246,0.2)",
        color: "#60a5fa",
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

type FilterTab = "all" | UserRole;

export default function Admin() {
  const { user: me } = useAuth();
  const navigate      = useNavigate();

  const [users,   setUsers]   = useState<UserResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filter,  setFilter]  = useState<FilterTab>("all");
  const [busy,    setBusy]    = useState<Record<string, boolean>>({});
  const [toast,   setToast]   = useState<{ msg: string; ok: boolean } | null>(null);

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

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Stats ──────────────────────────────────────────────────────────────────
  const counts = {
    all:     users.length,
    admin:   users.filter((u) => u.role === "admin").length,
    analyst: users.filter((u) => u.role === "analyst").length,
    viewer:  users.filter((u) => u.role === "viewer").length,
  };

  const STATS = [
    { label: "Total",    value: counts.all,     icon: Users,      color: "#64748b" },
    { label: "Admins",   value: counts.admin,   icon: ShieldCheck, color: "#f87171" },
    { label: "Analysts", value: counts.analyst, icon: Activity,   color: "#60a5fa" },
    { label: "Viewers",  value: counts.viewer,  icon: Eye,        color: "#94a3b8" },
  ];

  // ── Filter ─────────────────────────────────────────────────────────────────
  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all",     label: "All",     count: counts.all     },
    { key: "viewer",  label: "Viewers", count: counts.viewer  },
    { key: "analyst", label: "Analysts",count: counts.analyst },
    { key: "admin",   label: "Admins",  count: counts.admin   },
  ];

  const filtered = filter === "all" ? users : users.filter((u) => u.role === filter);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 md:p-8 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1
            className="text-xl sm:text-2xl font-bold tracking-tight"
            style={{ fontFamily: "Syne, sans-serif", color: "#E4EEFF", letterSpacing: "-0.02em" }}
          >
            User Management
          </h1>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Approve accounts · promote students to analyst
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
        {STATS.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl px-4 py-3 flex items-center gap-3"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.06)",
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

      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {TABS.map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all"
            style={
              filter === key
                ? { background: "rgba(59,130,246,0.15)", color: "#60a5fa", border: "1px solid rgba(59,130,246,0.3)" }
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
                background: u.id === me?.id ? "rgba(59,130,246,0.05)" : "rgba(255,255,255,0.025)",
                border: u.id === me?.id ? "1px solid rgba(59,130,246,0.18)" : "1px solid rgba(255,255,255,0.06)",
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
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(59,130,246,0.15)", color: "#60a5fa" }}>
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

              {/* Actions — only for other users */}
              {u.id !== me?.id && (
                <div className="flex items-center gap-2 flex-shrink-0 pl-12 sm:pl-0">
                  {u.role === "viewer" && (
                    <ActionButton
                      label="Promote to Analyst"
                      icon={<ChevronUp size={12} />}
                      color="#60a5fa"
                      bg="rgba(59,130,246,0.10)"
                      border="rgba(59,130,246,0.25)"
                      busy={!!busy[u.id]}
                      onClick={() => changeRole(u.id, "analyst")}
                    />
                  )}
                  {u.role === "analyst" && (
                    <>
                      <ActionButton
                        label="Make Admin"
                        icon={<ShieldCheck size={12} />}
                        color="#f87171"
                        bg="rgba(239,68,68,0.08)"
                        border="rgba(239,68,68,0.2)"
                        busy={!!busy[u.id]}
                        onClick={() => changeRole(u.id, "admin")}
                      />
                      <ActionButton
                        label="Demote"
                        icon={<ChevronDown size={12} />}
                        color="#64748b"
                        bg="rgba(100,116,139,0.08)"
                        border="rgba(100,116,139,0.2)"
                        busy={!!busy[u.id]}
                        onClick={() => changeRole(u.id, "viewer")}
                      />
                    </>
                  )}
                  {u.role === "admin" && (
                    <ActionButton
                      label="Demote to Analyst"
                      icon={<ChevronDown size={12} />}
                      color="#64748b"
                      bg="rgba(100,116,139,0.08)"
                      border="rgba(100,116,139,0.2)"
                      busy={!!busy[u.id]}
                      onClick={() => changeRole(u.id, "analyst")}
                    />
                  )}
                </div>
              )}
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

function ActionButton({ label, icon, color, bg, border, busy, onClick }: ActionButtonProps) {
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
