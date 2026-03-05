import { useRef, useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useTheme } from "@/providers/ThemeProvider";
import { useNotifications } from "@/hooks/useNotifications";
import { AnimatePresence } from "framer-motion";
import NotificationPanel, { NotificationBell } from "@/components/layout/NotificationPanel";
import { Icon } from "@/components/ui";

interface TopBarProps {
  onToggleSidebar: () => void;
}

// Maps pathname prefixes to breadcrumb arrays
const CRUMB_MAP: [string, string[]][] = [
  ["/dashboard",       ["Cyber Sentinel", "Dashboard"]],
  ["/alerts",          ["SOC", "Alerts"]],
  ["/soc/dashboard",   ["SOC", "Dashboard"]],
  ["/projects",        ["SOC", "Projects"]],
  ["/analytics",       ["SOC", "Analytics"]],
  ["/scans/new",       ["Pentest", "New Scan"]],
  ["/scans/",          ["Pentest", "Scans", "Detail"]],
  ["/scans",           ["Pentest", "Scans"]],
  ["/mitre",           ["Intelligence", "MITRE ATT&CK"]],
  ["/detection-rules", ["Intelligence", "Detection Rules"]],
  ["/correlations",    ["Intelligence", "Correlation Engine"]],
  ["/settings",        ["System", "Settings"]],
  ["/admin/notifications", ["Admin", "Notifications"]],
  ["/admin",           ["Admin", "Users"]],
  ["/agents",          ["Admin", "Agents"]],
  ["/audit",           ["Admin", "Audit Log"]],
];

function getCrumbs(pathname: string): string[] {
  for (const [prefix, crumbs] of CRUMB_MAP) {
    if (pathname === prefix || pathname.startsWith(prefix + "/") || (prefix.endsWith("/") && pathname.startsWith(prefix))) {
      return crumbs;
    }
  }
  return ["Cyber Sentinel"];
}

export default function TopBar({ onToggleSidebar }: TopBarProps) {
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const crumbs = getCrumbs(location.pathname);

  const { notifications, unreadCount, loading, markRead, markAllRead, deleteNotification, clearAll } = useNotifications();
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

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

  return (
    <header className="tb">
      {/* Sidebar toggle */}
      <button className="tb-iconbtn" onClick={onToggleSidebar} title="Toggle sidebar">
        <Icon name="menu" size={15} />
      </button>

      {/* Breadcrumbs */}
      <div className="tb-crumb">
        {crumbs.map((c, i) => (
          <span key={i} className="row" style={{ gap: 8 }}>
            {i > 0 && <Icon name="chevR" size={12} style={{ color: "var(--text-4)" }} />}
            {i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
          </span>
        ))}
      </div>

      <div className="tb-spacer" />

      {/* Theme toggle */}
      <button className="tb-iconbtn" title="Toggle theme" onClick={toggleTheme}>
        <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
      </button>

      {/* Notifications */}
      <div className="relative" ref={notifRef} style={{ position: "relative" }}>
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

      {/* Help */}
      <button className="tb-iconbtn" title="Help">
        <Icon name="helpCircle" size={15} />
      </button>
    </header>
  );
}
