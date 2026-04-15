/**
 * AdminNotifications.tsx — Admin notification feed.
 * Shows platform notifications: new registrations, SOC alerts, scan events.
 * Route: /admin/notifications  (admin only)
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell, CheckCheck, RefreshCw,
  AlertTriangle, UserPlus, ShieldAlert, CheckCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { TOKEN_KEY } from "@/lib/constants";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

type FilterTab = "all" | "unread";

// ── Config ────────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  scan_complete:    { icon: CheckCircle,   color: "var(--sev-low)",      label: "Scan Complete"    },
  scan_failed:      { icon: AlertTriangle, color: "var(--sev-high)",     label: "Scan Failed"      },
  critical_finding: { icon: ShieldAlert,   color: "var(--sev-critical)", label: "Critical Finding" },
  soc_alert:        { icon: ShieldAlert,   color: "var(--sev-high)",     label: "SOC Alert"        },
  soc_critical:     { icon: ShieldAlert,   color: "var(--sev-critical)", label: "SOC Critical"     },
  new_registration: { icon: UserPlus,      color: "var(--accent)",       label: "New Registration" },
  user_approved:    { icon: CheckCircle,   color: "var(--sev-low)",      label: "User Approved"    },
  user_suspended:   { icon: AlertTriangle, color: "var(--sev-medium)",   label: "User Suspended"   },
};

const DEFAULT_CFG = { icon: Bell, color: "var(--accent)", label: "Notification" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminNotifications() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter]     = useState<FilterTab>("all");

  // Guard: redirect non-admins
  useEffect(() => {
    if (!loading && user && (user as { role?: string }).role !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const API   = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
      const token = localStorage.getItem(TOKEN_KEY);
      const qs    = filter === "unread" ? "?unread_only=true" : "";
      const res   = await fetch(`${API}/api/notifications${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setNotifications(await res.json());
    } catch {
      // non-critical
    } finally {
      setFetching(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    try {
      const API   = import.meta.env.VITE_API_URL ?? "http://localhost:8000";
      const token = localStorage.getItem(TOKEN_KEY);
      await fetch(`${API}/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
    } catch { /* non-critical */ }
  }

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.is_read);
    await Promise.allSettled(unread.map((n) => markRead(n.id)));
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "24px 32px", maxWidth: "900px", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "38px", height: "38px", borderRadius: "10px",
            background: "var(--accent-dim)", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}>
            <Bell size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <h1 style={{
              fontFamily: "Sora, sans-serif", fontSize: "20px",
              fontWeight: 700, color: "var(--text-base)", margin: 0,
            }}>
              Notifications
            </h1>
            <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "2px 0 0" }}>
              {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}` : "All caught up"}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "8px" }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="btn-ghost"
              style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
            >
              <CheckCheck size={13} /> Mark all read
            </button>
          )}
          <button
            onClick={load}
            className="btn-ghost"
            style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {/* ── Filter tabs ── */}
      <div style={{
        display: "flex", gap: "4px", marginBottom: "20px",
        borderBottom: "1px solid var(--border)", paddingBottom: "12px",
      }}>
        {(["all", "unread"] as FilterTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              padding: "5px 14px", borderRadius: "6px",
              fontSize: "13px", fontFamily: "IBM Plex Sans, sans-serif",
              border: "1px solid transparent", cursor: "pointer",
              background: filter === tab ? "var(--accent-dim)" : "transparent",
              color:      filter === tab ? "var(--accent)"     : "var(--text-muted)",
              borderColor: filter === tab ? "var(--accent)"    : "transparent",
            }}
          >
            {tab === "all"
              ? `All (${notifications.length})`
              : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {/* ── List ── */}
      {fetching ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: "76px", borderRadius: "8px",
                background: "var(--bg-card)",
                opacity: 1 - i * 0.15,
                animation: "pulse 1.5s ease infinite",
              }}
            />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0" }}>
          <Bell size={36} style={{ color: "var(--text-muted)", opacity: 0.3, marginBottom: "12px" }} />
          <p style={{ fontSize: "14px", color: "var(--text-muted)", fontFamily: "IBM Plex Sans, sans-serif" }}>
            No notifications
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {notifications.map((n) => {
            const cfg  = TYPE_CONFIG[n.type] ?? DEFAULT_CFG;
            const Icon = cfg.icon;
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                style={{
                  display: "flex", gap: "14px", alignItems: "flex-start",
                  padding: "14px 16px", borderRadius: "8px",
                  background: n.is_read ? "var(--bg-card)" : "var(--bg-surface)",
                  border: `1px solid ${n.is_read ? "var(--border)" : "var(--border-muted)"}`,
                  borderLeft: `3px solid ${n.is_read ? "var(--border)" : cfg.color}`,
                  cursor: n.is_read ? "default" : "pointer",
                  opacity: n.is_read ? 0.65 : 1,
                  transition: "opacity 0.15s ease, border-color 0.15s ease",
                }}
              >
                {/* Icon pill */}
                <div style={{
                  width: "32px", height: "32px", borderRadius: "8px",
                  background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Icon size={14} style={{ color: cfg.color }} />
                </div>

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "8px" }}>
                    <span style={{
                      fontSize: "13px", fontWeight: 600,
                      color: "var(--text-base)",
                      fontFamily: "IBM Plex Sans, sans-serif",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {n.title}
                    </span>
                    <span style={{
                      fontSize: "11px", color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                      fontFamily: "IBM Plex Mono, monospace",
                      flexShrink: 0,
                    }}>
                      {timeAgo(n.created_at)}
                    </span>
                  </div>

                  <p style={{
                    fontSize: "12px", color: "var(--text-muted)",
                    margin: "3px 0 6px",
                    fontFamily: "IBM Plex Sans, sans-serif",
                    lineHeight: 1.5,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                  } as React.CSSProperties}>
                    {n.body}
                  </p>

                  <span style={{
                    display: "inline-block",
                    fontSize: "10px", fontFamily: "IBM Plex Mono, monospace",
                    padding: "1px 7px", borderRadius: "4px",
                    background: `color-mix(in srgb, ${cfg.color} 12%, transparent)`,
                    color: cfg.color,
                    letterSpacing: "0.04em",
                  }}>
                    {cfg.label}
                  </span>
                </div>

                {/* Unread dot */}
                {!n.is_read && (
                  <div style={{
                    width: "7px", height: "7px", borderRadius: "50%",
                    background: "var(--accent)", flexShrink: 0, marginTop: "7px",
                  }} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
