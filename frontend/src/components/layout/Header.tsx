/**
 * Header — sticky top bar with sidebar toggle, global search,
 * theme toggle, notification bell, and user controls with story-ring avatar.
 */
import { useRef, useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/providers/ThemeProvider";
import { useNotifications } from "@/hooks/useNotifications";
import { AnimatePresence } from "framer-motion";
import NotificationPanel, { NotificationBell } from "@/components/layout/NotificationPanel";
import { LogOut, Sun, Moon, Menu, X, Search } from "lucide-react";

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

export default function Header({ onToggleSidebar, sidebarOpen }: HeaderProps) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };
  const { notifications, unreadCount, loading, markRead, markAllRead, deleteNotification, clearAll } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!notifOpen) return;
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notifOpen]);

  // Derive page title for the search placeholder
  const pageMap: Record<string, string> = {
    "/dashboard":    "scans, findings, alerts",
    "/scans":        "scans by target or type",
    "/alerts":       "alerts by severity",
    "/analytics":    "analytics",
    "/correlations": "correlations",
    "/settings":     "settings",
  };
  const searchPlaceholder = `Search ${pageMap[location.pathname] ?? "anything"}...`;
  const avatarLetter = user?.username?.charAt(0).toUpperCase() ?? "?";

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center px-4 gap-3 border-b"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* ── Sidebar toggle ──────────────────────── */}
      <button
        onClick={onToggleSidebar}
        className="btn-ghost p-1.5 rounded-lg shrink-0"
        title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
        aria-label="Toggle sidebar"
      >
        {sidebarOpen
          ? <X    size={15} style={{ color: "var(--text-muted)" }} />
          : <Menu size={15} style={{ color: "var(--text-muted)" }} />
        }
      </button>

      <div className="w-px h-4 shrink-0" style={{ backgroundColor: "var(--border-muted)" }} />

      {/* ── Global search ───────────────────────── */}
      <div className="search-bar flex-1 max-w-[10rem] sm:max-w-xs md:max-w-sm">
        <Search size={12} className="shrink-0" style={{ color: "var(--text-subtle)" }} />
        <input
          type="text"
          placeholder={searchPlaceholder}
          aria-label="Search"
        />
        <kbd
          className="hidden sm:flex items-center shrink-0 text-[10px] px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--bg-card)",
            color: "var(--text-subtle)",
            border: "1px solid var(--border-muted)",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          /
        </kbd>
      </div>

      {/* ── Spacer ──────────────────────────────── */}
      <div className="flex-1 min-w-0" />

      {/* ── Right controls ──────────────────────── */}
      <div className="flex items-center gap-0 sm:gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="btn-ghost p-2 rounded-lg"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {isDark
            ? <Sun  size={14} style={{ color: "var(--text-muted)" }} />
            : <Moon size={14} style={{ color: "var(--accent)" }} />
          }
        </button>

        {/* Notification bell + panel */}
        <div className="relative" ref={notifRef}>
          <NotificationBell
            unreadCount={unreadCount}
            isOpen={notifOpen}
            onClick={() => setNotifOpen((o) => !o)}
          />
          <AnimatePresence>
            {notifOpen && (
              <NotificationPanel
                notifications={notifications}
                unreadCount={unreadCount}
                loading={loading}
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
                onDelete={deleteNotification}
                onClearAll={clearAll}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--border-muted)" }} />

        {/* Story-ring avatar + username */}
        {user && (
          <div className="flex items-center gap-2 px-1">
            <div className="story-ring shrink-0">
              <div
                className="story-ring-inner w-7 h-7 flex items-center justify-center text-xs font-bold"
                style={{ color: "var(--accent)" }}
              >
                {avatarLetter}
              </div>
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-xs font-semibold" style={{ color: "var(--text-base)" }}>
                {user.username}
              </span>
              <span
                className="text-[9px] uppercase tracking-wider font-semibold"
                style={{ color: "var(--accent)", opacity: 0.65 }}
              >
                {user.role}
              </span>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="btn-ghost p-2 rounded-lg"
          title="Logout"
          aria-label="Logout"
        >
          <LogOut size={13} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
    </header>
  );
}
