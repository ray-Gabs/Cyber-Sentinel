/**
 * BottomNav — mobile-only bottom navigation bar.
 * Visible only on screens smaller than md (768px).
 * Provides quick access to the 5 primary routes.
 */
import { NavLink } from "react-router-dom";
import { LayoutDashboard, Crosshair, ShieldAlert, BarChart3, Settings } from "lucide-react";
import { ROUTES } from "@/lib/constants";

const NAV_ITEMS = [
  { to: ROUTES.DASHBOARD,    label: "Home",      icon: LayoutDashboard, color: "#3B82F6" },
  { to: ROUTES.ALERTS,       label: "Alerts",    icon: ShieldAlert,     color: "#EF4444" },
  { to: ROUTES.SCANS,        label: "Scans",     icon: Crosshair,       color: "#F59E0B" },
  { to: ROUTES.ANALYTICS,    label: "Analytics", icon: BarChart3,       color: "#A855F7" },
  { to: ROUTES.SETTINGS,     label: "Settings",  icon: Settings,        color: "#94A3B8" },
] as const;

export default function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex md:hidden border-t"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon, color }) => (
        <NavLink
          key={to}
          to={to}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 min-h-[3.25rem] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/50"
        >
          {({ isActive }) => (
            <>
              <Icon size={20} style={{ color: isActive ? color : "var(--text-muted)" }} />
              <span
                className="text-[10px] font-medium"
                style={{ color: isActive ? color : "var(--text-muted)" }}
              >
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
