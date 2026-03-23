/**
 * Sidebar — left navigation panel with animated nav items.
 * Responds to dark/light theme via CSS variables.
 */
import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  LayoutDashboard,
  Crosshair,
  ShieldAlert,
  BarChart3,
  Settings,
  ShieldCheck,
  Link2,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

const navItems = [
  { to: ROUTES.DASHBOARD,    label: "Dashboard",   icon: LayoutDashboard, section: null },
  { to: ROUTES.SCANS,        label: "Scans",        icon: Crosshair,       section: "Pentest Engine" },
  { to: ROUTES.ALERTS,       label: "SOC Alerts",   icon: ShieldAlert,     section: "SOC Platform" },
  { to: ROUTES.ANALYTICS,    label: "Analytics",    icon: BarChart3,       section: null },
  { to: ROUTES.CORRELATIONS, label: "Correlation",  icon: Link2,           section: null },
  { to: ROUTES.SETTINGS,     label: "Settings",     icon: Settings,        section: "System" },
];

const sidebarVariants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, x: -14 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.3, ease: "easeOut" as const } },
};

export default function Sidebar() {
  return (
    <aside
      className="fixed left-0 top-0 z-40 h-screen w-64 flex flex-col border-r"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 px-5 py-4 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex items-center justify-center w-9 h-9 rounded-lg"
          style={{ backgroundColor: "var(--accent-dim)" }}
        >
          <ShieldCheck size={20} style={{ color: "var(--accent)" }} />
        </div>
        <div>
          <h1
            className="text-base font-bold leading-tight"
            style={{ fontFamily: "Space Grotesk, sans-serif", color: "var(--text-base)" }}
          >
            Cyber Sentinel
          </h1>
          <p className="text-[10px] uppercase tracking-widest font-medium" style={{ color: "var(--text-subtle)" }}>
            Pentest &amp; SOC
          </p>
        </div>
      </div>

      {/* Status indicator */}
      <div
        className="mx-4 mt-3 mb-1 flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
        style={{ backgroundColor: "var(--bg-muted)", color: "var(--text-muted)" }}
      >
        <Activity size={11} style={{ color: "var(--accent)" }} />
        <span>Platform Online</span>
        <span
          className="ml-auto w-1.5 h-1.5 rounded-full animate-pulse-slow"
          style={{ backgroundColor: "#22c55e" }}
        />
      </div>

      {/* Navigation */}
      <motion.nav
        className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5"
        variants={sidebarVariants}
        initial="hidden"
        animate="show"
      >
        {navItems.map(({ to, label, icon: Icon }) => (
          <motion.div key={to} variants={itemVariants}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  "nav-item group relative overflow-hidden",
                  isActive && "active"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {/* Active indicator bar */}
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full"
                      style={{ backgroundColor: "var(--accent)" }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <Icon
                    size={16}
                    className="shrink-0 ml-1 transition-transform duration-150 group-hover:scale-110"
                    style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}
                  />
                  <span style={{ color: isActive ? "var(--accent)" : "var(--text-muted)" }}>
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </motion.div>
        ))}
      </motion.nav>

      {/* Footer */}
      <div
        className="border-t px-5 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <p
          className="text-[10px] uppercase tracking-widest font-medium"
          style={{ color: "var(--text-subtle)" }}
        >
          v1.0.0 · ITS Cybersecurity Lab
        </p>
      </div>
    </aside>
  );
}
