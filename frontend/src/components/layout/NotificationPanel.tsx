/**
 * NotificationPanel — popout notification list attached to the bell icon.
 * Opens/closes with Framer Motion. Shows unread badge count on bell.
 * Each row has an X delete button. Header has "Mark all read" + "Clear all".
 */
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCheck, ShieldAlert, CheckCircle2, AlertTriangle, X, Trash2 } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { Notification, NotificationType } from "@/types/notification";

// ── Icon per notification type ────────────────────────────────────────────
function NotifIcon({ type }: { type: NotificationType }) {
  if (type === "scan_complete")    return <CheckCircle2 size={14} style={{ color: "var(--sev-low-text)" }} />;
  if (type === "scan_failed")      return <AlertTriangle size={14} style={{ color: "var(--sev-critical-text)" }} />;
  if (type === "critical_finding") return <ShieldAlert size={14} style={{ color: "var(--sev-critical-text)" }} />;
  return <Bell size={14} style={{ color: "var(--text-muted)" }} />;
}

// ── Severity summary pills ────────────────────────────────────────────────
const SEV_COLORS: Record<string, string> = {
  critical: "var(--sev-critical-text)",
  high:     "var(--sev-high-text)",
  medium:   "var(--sev-medium-text)",
  low:      "var(--sev-low-text)",
  info:     "var(--sev-info-text)",
};

function SeveritySummary({ summary }: { summary: Record<string, number> }) {
  const entries = (["critical", "high", "medium", "low"] as const)
    .filter((k) => (summary[k] ?? 0) > 0);
  if (entries.length === 0) return null;
  return (
    <div className="flex gap-1 mt-1 flex-wrap">
      {entries.map((sev) => (
        <span
          key={sev}
          className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{
            backgroundColor: `${SEV_COLORS[sev]}18`,
            color: SEV_COLORS[sev],
          }}
        >
          {sev.charAt(0).toUpperCase()}: {summary[sev]}
        </span>
      ))}
    </div>
  );
}

// ── Single notification row ───────────────────────────────────────────────
function NotifRow({
  notif,
  onRead,
  onDelete,
}: {
  notif: Notification;
  onRead: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (!notif.is_read) onRead(notif.id);
    if (notif.scan_id) navigate(`/scans/${notif.scan_id}`);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(notif.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0, paddingTop: 0, paddingBottom: 0 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className="group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors relative"
      style={{
        backgroundColor: notif.is_read ? "transparent" : "rgba(59,130,246,0.04)",
        borderLeft: notif.is_read ? "2px solid transparent" : "2px solid var(--accent)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-muted)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.backgroundColor = notif.is_read
          ? "transparent"
          : "rgba(59,130,246,0.04)";
      }}
    >
      {/* Icon */}
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: "var(--bg-muted)" }}
      >
        <NotifIcon type={notif.type} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 pr-5">
        <p
          className="text-xs font-medium leading-snug"
          style={{ color: notif.is_read ? "var(--text-muted)" : "var(--text-base)" }}
        >
          {notif.title}
        </p>
        {notif.scan_target && (
          <p
            className="text-[11px] truncate mt-0.5 font-mono"
            style={{ color: "var(--text-subtle)" }}
          >
            {notif.scan_target}
          </p>
        )}
        {notif.severity_summary && <SeveritySummary summary={notif.severity_summary} />}
        <p className="text-[10px] mt-1" style={{ color: "var(--text-subtle)" }}>
          {timeAgo(notif.created_at)}
        </p>
      </div>

      {/* Delete button — visible on row hover */}
      <button
        onClick={handleDelete}
        title="Delete notification"
        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center
                   opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: "var(--text-subtle)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--sev-critical-text)";
          (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(239,68,68,0.1)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.color = "var(--text-subtle)";
          (e.currentTarget as HTMLElement).style.backgroundColor = "";
        }}
      >
        <X size={11} />
      </button>

      {/* Unread dot (hidden when delete button is shown on hover) */}
      {!notif.is_read && (
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 group-hover:opacity-0 transition-opacity"
          style={{ backgroundColor: "var(--accent)" }}
        />
      )}
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────
interface NotificationPanelProps {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export default function NotificationPanel({
  notifications,
  unreadCount,
  loading,
  onMarkRead,
  onMarkAllRead,
  onDelete,
  onClearAll,
}: NotificationPanelProps) {
  return (
    <>
      {/* Panel */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: -6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -6 }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        className="absolute right-0 top-full mt-2 w-80 rounded-xl overflow-hidden shadow-2xl"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-muted)",
          boxShadow: "0 20px 48px rgba(0,0,0,0.4), 0 0 0 1px rgba(59,130,246,0.08)",
          zIndex: 100,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2">
            <Bell size={13} style={{ color: "var(--text-muted)" }} />
            <span className="text-xs font-semibold" style={{ color: "var(--text-base)" }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <span
                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--accent)",
                  color: "white",
                  minWidth: "18px",
                  textAlign: "center",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="flex items-center gap-1 text-[10px] font-medium transition-opacity hover:opacity-70"
                style={{ color: "var(--accent)" }}
              >
                <CheckCheck size={11} />
                Mark all read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={onClearAll}
                className="flex items-center gap-1 text-[10px] font-medium transition-opacity hover:opacity-70"
                style={{ color: "var(--text-subtle)" }}
                title="Delete all notifications"
              >
                <Trash2 size={11} />
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* List */}
        <div style={{ maxHeight: "360px", overflowY: "auto" }}>
          {loading ? (
            <div className="space-y-px py-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="px-4 py-3 flex items-start gap-3">
                  <div className="skeleton w-7 h-7 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-2.5 w-40 rounded" />
                    <div className="skeleton h-2 w-24 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "var(--bg-muted)" }}
              >
                <CheckCheck size={18} style={{ color: "var(--text-subtle)" }} />
              </div>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>All caught up</p>
              <p className="text-[10px]" style={{ color: "var(--text-subtle)" }}>No notifications yet</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--border)" }}>
              <AnimatePresence>
                {notifications.map((n) => (
                  <NotifRow
                    key={n.id}
                    notif={n}
                    onRead={onMarkRead}
                    onDelete={onDelete}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}

// ── Bell button with badge ────────────────────────────────────────────────
export function NotificationBell({
  unreadCount,
  isOpen,
  onClick,
}: {
  unreadCount: number;
  isOpen: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="btn-ghost p-2 rounded-lg relative"
      title="Notifications"
      aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
      style={{
        backgroundColor: isOpen ? "var(--bg-muted)" : undefined,
      }}
    >
      <Bell size={14} style={{ color: isOpen ? "var(--accent)" : "var(--text-muted)" }} />
      <AnimatePresence>
        {unreadCount > 0 && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="absolute top-1 right-1 flex items-center justify-center rounded-full text-[8px] font-bold"
            style={{
              backgroundColor: "var(--sev-critical)",
              color: "white",
              minWidth: "14px",
              height: "14px",
              padding: "0 2px",
            }}
          >
            {unreadCount > 9 ? "9+" : unreadCount}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}
