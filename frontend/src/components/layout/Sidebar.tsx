/**
 * Sidebar — collapsible left navigation with animated transitions.
 * Expanded: 240px with icons + labels.
 * Collapsed: 64px with icons only + native tooltips.
 */
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  section: string | null;
}

const navItems: NavItem[] = [
  { to: ROUTES.DASHBOARD,    label: "Dashboard",    icon: LayoutDashboard, section: null },
  { to: ROUTES.SCANS,        label: "Scans",         icon: Crosshair,       section: "Pentest Engine" },
  { to: ROUTES.ALERTS,       label: "SOC Alerts",    icon: ShieldAlert,     section: "SOC Platform" },
  { to: ROUTES.ANALYTICS,    label: "Analytics",     icon: BarChart3,       section: null },
  { to: ROUTES.CORRELATIONS, label: "Correlation",   icon: Link2,           section: null },
  { to: ROUTES.SETTINGS,     label: "Settings",      icon: Settings,        section: "System" },
];

const labelVariants = {
  hidden: { opacity: 0, x: -8, width: 0 },
  show:   { opacity: 1, x: 0,  width: "auto", transition: { duration: 0.18, ease: "easeOut" as const } },
  exit:   { opacity: 0, x: -4, width: 0,      transition: { duration: 0.12, ease: "easeIn"  as const } },
};

const sectionVariants = {
  hidden: { opacity: 0, height: 0 },
  show:   { opacity: 1, height: "auto", transition: { duration: 0.18, ease: "easeOut" as const } },
  exit:   { opacity: 0, height: 0,      transition: { duration: 0.12, ease: "easeIn"  as const } },
};

export default function Sidebar({ collapsed }: SidebarProps) {
  // Track which sections have been rendered to avoid duplicate headers
  const renderedSections = new Set<string>();

  return (
    <motion.aside
      animate={{ width: collapsed ? 64 : 240 }}
      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 z-40 h-screen flex flex-col overflow-hidden border-r"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-3 border-b shrink-0 overflow-hidden"
        style={{
          borderColor: "var(--border)",
          padding: collapsed ? "1rem 0" : "1rem 1.25rem",
          justifyContent: collapsed ? "center" : "flex-start",
          transition: "padding 0.22s ease",
        }}
      >
        <div
          className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 border"
          style={{
            backgroundColor: "var(--accent-dim)",
            borderColor: "var(--accent-dim)",
          }}
        >
          <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
        </div>

        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.div
              key="logo-text"
              initial="hidden"
              animate="show"
              exit="exit"
              variants={labelVariants}
              className="overflow-hidden whitespace-nowrap"
            >
              <h1
                className="text-sm font-bold leading-tight tracking-tight"
                style={{ fontFamily: "Syne, sans-serif", color: "var(--text-base)" }}
              >
                Cyber Sentinel
              </h1>
              <p className="text-[9px] uppercase tracking-[0.15em] font-medium mt-0.5" style={{ color: "var(--text-subtle)" }}>
                Pentest &amp; SOC
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status indicator */}
      <div
        className="mx-3 mt-3 mb-1 flex items-center rounded-lg overflow-hidden shrink-0"
        style={{
          backgroundColor: "var(--bg-muted)",
          padding: collapsed ? "0.5rem" : "0.5rem 0.75rem",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: collapsed ? 0 : "0.5rem",
          transition: "padding 0.22s ease",
        }}
      >
        <div className="relative shrink-0 flex items-center justify-center">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "#22c55e" }}
          />
          <span
            className="absolute w-3 h-3 rounded-full animate-ping opacity-30"
            style={{ backgroundColor: "#22c55e" }}
          />
        </div>

        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              key="status-text"
              initial="hidden"
              animate="show"
              exit="exit"
              variants={labelVariants}
              className="text-[10px] font-medium whitespace-nowrap overflow-hidden"
              style={{ color: "var(--text-muted)" }}
            >
              Platform Online
            </motion.span>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!collapsed && (
            <motion.span
              key="activity-icon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="ml-auto"
            >
              <Activity size={10} style={{ color: "var(--accent)" }} />
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon, section }) => {
          const showSection = section && !renderedSections.has(section);
          if (section) renderedSections.add(section);

          return (
            <div key={to}>
              {/* Section header */}
              <AnimatePresence mode="wait">
                {showSection && !collapsed && (
                  <motion.p
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    variants={sectionVariants}
                    className="px-2 pb-1 pt-3 text-[9px] uppercase tracking-[0.14em] font-semibold overflow-hidden whitespace-nowrap"
                    style={{ color: "var(--text-subtle)" }}
                  >
                    {section}
                  </motion.p>
                )}
                {showSection && collapsed && (
                  <motion.div
                    key={`divider-${section}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
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
                    "group relative flex items-center rounded-lg overflow-hidden",
                    "transition-colors duration-150",
                    collapsed ? "justify-center p-2.5 mx-0.5" : "gap-2.5 px-2.5 py-2",
                    isActive
                      ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                      : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-base)]"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Active sliding indicator */}
                    {isActive && !collapsed && (
                      <motion.span
                        layoutId="sidebar-active-bar"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                        style={{ backgroundColor: "var(--accent)" }}
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}

                    <Icon
                      size={16}
                      className="shrink-0 transition-transform duration-150 group-hover:scale-105"
                      style={{
                        color: isActive ? "var(--accent)" : "inherit",
                        marginLeft: !collapsed && isActive ? "2px" : undefined,
                      }}
                    />

                    <AnimatePresence mode="wait">
                      {!collapsed && (
                        <motion.span
                          key={`label-${to}`}
                          initial="hidden"
                          animate="show"
                          exit="exit"
                          variants={labelVariants}
                          className="text-sm font-medium whitespace-nowrap overflow-hidden"
                          style={{ color: "inherit" }}
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

      {/* Footer */}
      <AnimatePresence mode="wait">
        {!collapsed && (
          <motion.div
            key="footer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="border-t px-4 py-3 shrink-0"
            style={{ borderColor: "var(--border)" }}
          >
            <p
              className="text-[9px] uppercase tracking-[0.14em] font-medium"
              style={{ color: "var(--text-subtle)" }}
            >
              v1.0.0 · ITS Cybersecurity Lab
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
