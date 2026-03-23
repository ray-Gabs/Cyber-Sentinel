/**
 * Header — top bar with breadcrumb, theme toggle, and user info.
 */
import { useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/contexts/ThemeContext";
import { LogOut, Sun, Moon, ChevronRight } from "lucide-react";

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

export default function Header() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const location = useLocation();

  const breadcrumb = getBreadcrumb(location.pathname);

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between px-6 border-b"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border)",
        backdropFilter: "blur(8px)",
      }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-subtle)" }}>
          Cyber Sentinel
        </span>
        <ChevronRight size={12} style={{ color: "var(--text-subtle)" }} />
        <span className="font-semibold" style={{ color: "var(--text-base)" }}>
          {breadcrumb}
        </span>
      </div>

      {/* Right: theme toggle + user + logout */}
      <div className="flex items-center gap-2">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="btn-ghost p-2 rounded-lg"
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          aria-label="Toggle theme"
        >
          {isDark ? (
            <Sun size={16} style={{ color: "var(--text-muted)" }} />
          ) : (
            <Moon size={16} style={{ color: "var(--text-muted)" }} />
          )}
        </button>

        {/* Divider */}
        <div className="w-px h-5 mx-1" style={{ backgroundColor: "var(--border-muted)" }} />

        {/* User info */}
        {user && (
          <div className="flex items-center gap-2 text-sm px-2" style={{ color: "var(--text-muted)" }}>
            <div
              className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold"
              style={{ backgroundColor: "var(--accent-dim)", color: "var(--accent)" }}
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span className="hidden sm:block font-medium" style={{ color: "var(--text-base)" }}>
              {user.username}
            </span>
            <span
              className="hidden sm:block text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "var(--accent-dim)", color: "var(--accent)" }}
            >
              {user.role}
            </span>
          </div>
        )}

        {/* Logout */}
        <button
          onClick={logout}
          className="btn-ghost p-2 rounded-lg"
          title="Logout"
          aria-label="Logout"
        >
          <LogOut size={15} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
    </header>
  );
}
