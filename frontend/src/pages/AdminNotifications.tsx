/**
 * AdminNotifications — Admin notification feed.
 * Shows platform notifications: new registrations, SOC alerts, scan events.
 * Route: /admin/notifications (admin only)
 */
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import api from "@/services/api";
import { Icon, PageHead, Tabs } from "@/components/ui";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

type FilterTab = "all" | "unread";

const TYPE_CONFIG: Record<string, { iconName: string; color: string; label: string }> = {
  scan_complete:    { iconName: "checkCircle", color: "var(--sev-low)",      label: "Scan Complete"    },
  scan_failed:      { iconName: "alert",       color: "var(--sev-high)",     label: "Scan Failed"      },
  critical_finding: { iconName: "shield",      color: "var(--sev-critical)", label: "Critical Finding" },
  soc_alert:        { iconName: "shield",      color: "var(--sev-high)",     label: "SOC Alert"        },
  soc_critical:     { iconName: "shield",      color: "var(--sev-critical)", label: "SOC Critical"     },
  new_registration: { iconName: "user",        color: "var(--accent)",       label: "New Registration" },
  user_approved:    { iconName: "checkCircle", color: "var(--sev-low)",      label: "User Approved"    },
  user_suspended:   { iconName: "alert",       color: "var(--sev-medium)",   label: "User Suspended"   },
};

const DEFAULT_CFG = { iconName: "bell", color: "var(--accent)", label: "Notification" };

function parseUtcDate(iso: string): Date {
  if (!iso.endsWith("Z") && !/[+-]\d{2}:\d{2}$/.test(iso)) return new Date(iso + "Z");
  return new Date(iso);
}

function timeAgo(iso: string): string {
  const diff  = Date.now() - parseUtcDate(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function AdminNotifications() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [fetching, setFetching] = useState(true);
  const [filter, setFilter]     = useState<FilterTab>("all");

  useEffect(() => {
    if (!loading && user && user.role !== "admin") {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, navigate]);

  const load = useCallback(async () => {
    setFetching(true);
    try {
      const params = filter === "unread" ? { unread_only: true } : {};
      const { data } = await api.get<Notification[]>("/notifications", { params });
      setNotifications(data);
    } catch {
      // non-critical
    } finally {
      setFetching(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function markRead(id: string) {
    try {
      await api.patch(`/notifications/${id}/read`);
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

  const filterTabs = [
    { id: "all",    label: "All",    count: notifications.length },
    { id: "unread", label: "Unread", count: unreadCount },
  ];

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto w-full">
      <PageHead
        eyebrow="ADMIN"
        title="Notifications"
        sub={unreadCount > 0
          ? `${unreadCount} unread notification${unreadCount !== 1 ? "s" : ""}`
          : "All caught up"}
        actions={
          <>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="btn btn-sm flex items-center gap-1.5">
                <Icon name="check" size={13} /> Mark all read
              </button>
            )}
            <button
              onClick={load}
              disabled={fetching}
              className="btn btn-primary btn-sm flex items-center gap-1.5"
            >
              <Icon name="refresh" size={13} className={fetching ? "animate-spin" : ""} />
              Refresh
            </button>
          </>
        }
      />

      {/* Filter tabs */}
      <div className="card" style={{ padding: "14px 18px" }}>
        <Tabs active={filter} onChange={(v) => setFilter(v as FilterTab)} tabs={filterTabs} />
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {fetching ? (
          [...Array(4)].map((_, i) => (
            <div
              key={i}
              className="card animate-pulse"
              style={{ height: 76, opacity: 1 - i * 0.15 }}
            />
          ))
        ) : notifications.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-14 gap-3">
            <Icon name="bell" size={32} style={{ color: "var(--text-3)", opacity: 0.3 }} />
            <p className="text-sm" style={{ color: "var(--text-2)" }}>No notifications</p>
          </div>
        ) : (
          notifications.map((n) => {
            const cfg = TYPE_CONFIG[n.type] ?? DEFAULT_CFG;
            return (
              <div
                key={n.id}
                onClick={() => !n.is_read && markRead(n.id)}
                className="flex gap-3 items-start rounded-xl border transition-opacity"
                style={{
                  padding: "14px 16px",
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  borderLeftWidth: 3,
                  borderLeftColor: n.is_read ? "var(--border)" : cfg.color,
                  cursor: n.is_read ? "default" : "pointer",
                  opacity: n.is_read ? 0.65 : 1,
                }}
              >
                {/* Icon pill */}
                <div
                  className="flex items-center justify-center rounded-lg shrink-0"
                  style={{
                    width: 32, height: 32,
                    background: `color-mix(in oklab, ${cfg.color} 12%, transparent)`,
                  }}
                >
                  <Icon name={cfg.iconName} size={14} style={{ color: cfg.color }} />
                </div>

                {/* Body */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>
                      {n.title}
                    </span>
                    <span className="mono shrink-0" style={{ fontSize: 11, color: "var(--text-2)" }}>
                      {timeAgo(n.created_at)}
                    </span>
                  </div>
                  <p
                    className="text-xs mt-0.5 mb-1.5 leading-relaxed"
                    style={{
                      color: "var(--text-2)",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    } as React.CSSProperties}
                  >
                    {n.body}
                  </p>
                  <span
                    className="inline-block mono"
                    style={{
                      fontSize: 10,
                      padding: "1px 7px",
                      borderRadius: 4,
                      background: `color-mix(in oklab, ${cfg.color} 12%, transparent)`,
                      color: cfg.color,
                    }}
                  >
                    {cfg.label}
                  </span>
                </div>

                {/* Unread dot */}
                {!n.is_read && (
                  <div
                    className="rounded-full shrink-0"
                    style={{ width: 7, height: 7, marginTop: 7, background: "var(--accent)" }}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
