/**
 * Header — minimal top bar with sidebar toggle, breadcrumb, theme + user controls.
 */
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { LogOut, Sun, Moon, ChevronRight, Menu, X } from "lucide-react";

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard":    "Dashboard",
  "/scans":        "Scans",
  "/scans/new":    "New Scan",
  "/alerts":       "SOC Alerts",
  "/analytics":    "Analytics",
  "/correlations": "Correlation Engine",
  "/settings":     "Settings",
};

function getBreadcrumb(pathname: string): string {
  if (pathname.startsWith("/scans/") && pathname !== "/scans/new") return "Scan Detail";
  if (pathname.startsWith("/alerts/")) return "Alert Detail";
  return ROUTE_LABELS[pathname] ?? "Cyber Sentinel";
}

export default function Header({ onToggleSidebar, sidebarOpen }: HeaderProps) {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();

  const breadcrumb = getBreadcrumb(location.pathname);

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center px-4 border-b"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {/* Left: burger + breadcrumb */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        {/* Burger toggle */}
        <button
          onClick={onToggleSidebar}
          className="btn-ghost p-1.5 rounded-lg shrink-0"
          title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? (
            <X size={16} style={{ color: "var(--text-muted)" }} />
          ) : (
            <Menu size={16} style={{ color: "var(--text-muted)" }} />
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-4 shrink-0" style={{ backgroundColor: "var(--border-muted)" }} />

        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm min-w-0" style={{ color: "var(--text-muted)" }}>
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.12em] shrink-0"
            style={{ color: "var(--text-subtle)" }}
          >
            Cyber Sentinel
          </span>
          <ChevronRight size={11} className="shrink-0" style={{ color: "var(--text-subtle)" }} />
          <span
            className="font-semibold truncate"
            style={{ color: "var(--text-base)", fontFamily: "Syne, sans-serif", fontSize: "0.875rem" }}
          >
            {breadcrumb}
          </span>
        </div>
      </div>

      {/* Right: theme + user + logout */}
      <div className="flex items-center gap-1">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="btn-ghost p-2 rounded-lg"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun size={15} style={{ color: "var(--text-muted)" }} />
          ) : (
            <Moon size={15} style={{ color: "var(--text-muted)" }} />
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-4 mx-1" style={{ backgroundColor: "var(--border-muted)" }} />

        {/* User info */}
        {user && (
          <div className="flex items-center gap-2 px-2">
            {/* Avatar */}
            <div
              className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0"
              style={{ backgroundColor: "var(--accent-dim)", color: "var(--accent)" }}
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
            {/* Username + role */}
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="text-xs font-semibold" style={{ color: "var(--text-base)" }}>
                {user.username}
              </span>
              <span
                className="text-[9px] uppercase tracking-wider font-medium"
                style={{ color: "var(--accent)" }}
              >
                {user.role}
              </span>
            </div>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className="btn-ghost p-2 rounded-lg"
          title="Logout"
          aria-label="Logout"
        >
          <LogOut size={14} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
    </header>
  );
}
