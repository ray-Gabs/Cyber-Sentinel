/**
 * Sidebar — collapsible left navigation.
 * Expanded: 240px — colored icon nav + section labels.
 * Collapsed: 64px — icon-only.
 * User identity and logout live in the Header, not here.
 */
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Crosshair, ShieldAlert, BarChart3,
  Settings, ShieldCheck, Link2, Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  section: string | null;
  color: string;
  iconBg: string;
}

const navItems: NavItem[] = [
  {
    to: ROUTES.DASHBOARD,    label: "Dashboard",  icon: LayoutDashboard,
    section: null,             color: "#3B82F6", iconBg: "rgba(59,130,246,0.18)",
  },
  // ── SOC Platform first ──
  {
    to: ROUTES.ALERTS,       label: "SOC Alerts",  icon: ShieldAlert,
    section: "SOC Platform",   color: "#EF4444", iconBg: "rgba(239,68,68,0.18)",
  },
  {
    to: ROUTES.AGENTS,       label: "Agents",      icon: Monitor,
    section: null,             color: "#22C55E", iconBg: "rgba(34,197,94,0.18)",
  },
  {
    to: ROUTES.ANALYTICS,    label: "Analytics",   icon: BarChart3,
    section: null,             color: "#A855F7", iconBg: "rgba(168,85,247,0.18)",
  },
  // ── Pentest Engine second ──
  {
    to: ROUTES.SCANS,        label: "Scans",       icon: Crosshair,
    section: "Pentest Engine", color: "#F59E0B", iconBg: "rgba(245,158,11,0.18)",
  },
  {
    to: ROUTES.CORRELATIONS, label: "Correlation", icon: Link2,
    section: "Intelligence",   color: "#22C55E", iconBg: "rgba(34,197,94,0.18)",
  },
  {
    to: ROUTES.SETTINGS,     label: "Settings",    icon: Settings,
    section: "System",         color: "#94A3B8", iconBg: "rgba(148,163,184,0.15)",
  },
];

const labelVariants = {
  hidden: { opacity: 0, x: -8, width: 0 },
  show:   { opacity: 1, x: 0, width: "auto", transition: { duration: 0.18, ease: "easeOut" as const } },
  exit:   { opacity: 0, x: -4, width: 0,     transition: { duration: 0.12, ease: "easeIn"  as const } },
};

const sectionVariants = {
  hidden: { opacity: 0, height: 0, marginTop: 0 },
  show:   { opacity: 1, height: "auto", marginTop: "0.75rem", transition: { duration: 0.18 } },
  exit:   { opacity: 0, height: 0, marginTop: 0, transition: { duration: 0.12 } },
};

export default function Sidebar({ collapsed }: SidebarProps) {
  const renderedSections = new Set<string>();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 z-40 h-screen flex flex-col overflow-hidden border-r"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      {/* ── Logo ─────────────────────────────────── */}
      <div
        className="flex items-center gap-3 border-b shrink-0 overflow-hidden"
        style={{
          borderColor: "var(--border)",
          padding: collapsed ? "1.125rem 0" : "1rem 1.125rem",
          justifyContent: collapsed ? "center" : "flex-start",
          transition: "padding 0.22s ease",
        }}
      >
        <div
          className="relative flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(59,130,246,0.25) 0%, rgba(168,85,247,0.2) 100%)",
            border: "1px solid rgba(59,130,246,0.35)",
            boxShadow: "0 0 16px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
        </div>

        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              key="logo-text"
              initial="hidden" animate="show" exit="exit"
              variants={labelVariants}
              className="overflow-hidden whitespace-nowrap"
            >
              <h1
                className="text-sm font-bold leading-tight"
                style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)", letterSpacing: "-0.02em" }}
              >
                Cyber Sentinel
              </h1>
              <p
                className="text-[9px] uppercase tracking-[0.2em] font-semibold mt-0.5"
                style={{ color: "var(--accent)", opacity: 0.65 }}
              >
                Pentest · SOC
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Navigation ───────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, section, color, iconBg }) => {
          const showSection = section && !renderedSections.has(section);
          if (section) renderedSections.add(section);

          return (
            <div key={to}>
              {/* Section label / divider */}
              <AnimatePresence mode="wait">
                {showSection && !collapsed && (
                  <motion.p
                    initial="hidden" animate="show" exit="exit"
                    variants={sectionVariants}
                    className="px-2 pb-1 text-[9px] uppercase tracking-[0.18em] font-semibold overflow-hidden whitespace-nowrap"
                    style={{ color: "var(--text-subtle)" }}
                  >
                    {section}
                  </motion.p>
                )}
                {showSection && collapsed && (
                  <motion.div
                    key={`div-${section}`}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="mx-2 my-2 h-px"
                    style={{ backgroundColor: "var(--border)" }}
                  />
                )}
              </AnimatePresence>

              {/* Nav link */}
              <NavLink
                to={to}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center rounded-lg overflow-hidden transition-colors duration-150",
                    collapsed ? "justify-center p-2 mx-0.5" : "gap-2.5 px-2 py-2",
                    isActive
                      ? "bg-[var(--bg-muted)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-base)]"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Colored active indicator bar */}
                    {isActive && !collapsed && (
                      <motion.span
                        layoutId="sidebar-active-bar"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                        style={{ backgroundColor: color }}
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}

                    {/* Icon with colored background when active */}
                    <div
                      className="nav-icon"
                      style={{
                        backgroundColor: isActive ? iconBg : "transparent",
                        marginLeft: isActive && !collapsed ? "2px" : undefined,
                      }}
                    >
                      <Icon
                        size={15}
                        style={{ color: isActive ? color : "currentColor" }}
                        className="transition-colors duration-150"
                      />
                    </div>

                    <AnimatePresence mode="wait">
                      {!collapsed && (
                        <motion.span
                          key={`label-${to}`}
                          initial="hidden" animate="show" exit="exit"
                          variants={labelVariants}
                          className="text-sm font-medium whitespace-nowrap overflow-hidden"
                          style={{ color: isActive ? "var(--text-base)" : "inherit" }}
                        >
                          {label}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </NavLink>
            </div>
          );
        })}
      </nav>

    </motion.aside>
  );
}
