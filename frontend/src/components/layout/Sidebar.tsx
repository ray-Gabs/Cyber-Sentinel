/**
 * Sidebar — the left navigation panel.
 *
 * TypeScript tip: NavLink from react-router gives us `isActive` to highlight
 * the currently active route. The `cn()` helper merges Tailwind classes cleanly.
 */
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Crosshair,
  ShieldAlert,
  BarChart3,
  Settings,
  Shield,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

// Each nav item: path to navigate to, label to show, icon to display
const navItems = [
  { to: ROUTES.DASHBOARD, label: "Dashboard", icon: LayoutDashboard },
  { to: ROUTES.SCANS, label: "Scans", icon: Crosshair },
  { to: ROUTES.ALERTS, label: "Alerts", icon: ShieldAlert },
  { to: ROUTES.ANALYTICS, label: "Analytics", icon: BarChart3 },
  { to: ROUTES.CORRELATIONS, label: "Correlation", icon: Link2 },
  { to: ROUTES.SETTINGS, label: "Settings", icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-gray-800 bg-gray-950 flex flex-col">
      {/* ── Logo ── */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
        <Shield className="h-8 w-8 text-sentinel-500" />
        <div>
          <h1 className="text-lg font-bold text-white">Cyber Sentinel</h1>
          <p className="text-xs text-gray-500">Pentest &amp; SOC</p>
        </div>
      </div>

      {/* ── Navigation ── */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sentinel-600/20 text-sentinel-400"
                  : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ── */}
      <div className="border-t border-gray-800 px-6 py-4">
        <p className="text-xs text-gray-600">v1.0.0 — ITS Cybersecurity Lab</p>
      </div>
    </aside>
  );
}
