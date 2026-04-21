/**
 * Sidebar — collapsible left navigation.
 * Desktop (md+): persistent collapsible sidebar, expanded 240px / collapsed 64px.
 * Mobile (<md): overlay drawer triggered by mobileOpen prop.
 */
import { NavLink } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Crosshair, ShieldAlert, BarChart3,
  Settings, ShieldCheck, Link2, X, Users, ClipboardList, Layers,
  Activity, SlidersHorizontal, Target, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/lib/constants";
import { useAuth } from "@/hooks/useAuth";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
  section: string | null;
  color: string;
  iconBg: string;
}

/** Nav for non-admin users — SOC + Pentest */
const navItems: NavItem[] = [
  {
    to: ROUTES.DASHBOARD,     label: "Dashboard",     icon: LayoutDashboard,
    section: null,              color: "#00d4ff", iconBg: "rgba(0,212,255,0.15)",
  },
  {
    to: ROUTES.ALERTS,        label: "SOC Alerts",    icon: ShieldAlert,
    section: "SOC Platform",   color: "#EF4444", iconBg: "rgba(239,68,68,0.18)",
  },
  {
    to: ROUTES.SOC_DASHBOARD, label: "SOC Dashboard", icon: Activity,
    section: null,              color: "#00d4ff", iconBg: "rgba(0,212,255,0.12)",
  },
  {
    to: ROUTES.SIEM_CONFIG,   label: "SIEM Config",   icon: SlidersHorizontal,
    section: null,              color: "#22C55E", iconBg: "rgba(34,197,94,0.18)",
  },
  {
    to: ROUTES.PROJECTS,      label: "Projects",      icon: Layers,
    section: null,              color: "#A78BFA", iconBg: "rgba(167,139,250,0.18)",
  },
  {
    to: ROUTES.ANALYTICS,     label: "Analytics",     icon: BarChart3,
    section: null,              color: "#A855F7", iconBg: "rgba(168,85,247,0.18)",
  },
  {
    to: ROUTES.SCANS,         label: "Scans",         icon: Crosshair,
    section: "Pentest Engine", color: "#F59E0B", iconBg: "rgba(245,158,11,0.18)",
  },
  {
    to: ROUTES.CORRELATIONS,  label: "Correlation",   icon: Link2,
    section: "Intelligence",   color: "#22C55E", iconBg: "rgba(34,197,94,0.18)",
  },
  {
    to: ROUTES.MITRE,           label: "MITRE ATT&CK",    icon: Target,
    section: null,               color: "#EF4444", iconBg: "rgba(239,68,68,0.18)",
  },
  {
    to: ROUTES.DETECTION_RULES, label: "Detection Rules",  icon: Filter,
    section: null,               color: "#F59E0B", iconBg: "rgba(245,158,11,0.18)",
  },
  {
    to: ROUTES.SETTINGS,        label: "Settings",         icon: Settings,
    section: "System",           color: "#94A3B8", iconBg: "rgba(148,163,184,0.15)",
  },
];

/** Nav for admin users — admin panel first, SOC monitor section */
const adminNavItems: NavItem[] = [
  {
    to: ROUTES.DASHBOARD,          label: "Dashboard",     icon: LayoutDashboard,
    section: null,                  color: "#00d4ff", iconBg: "rgba(0,212,255,0.15)",
  },
  {
    to: ROUTES.ADMIN,              label: "Users",         icon: Users,
    section: "Admin Panel",         color: "#F87171", iconBg: "rgba(239,68,68,0.15)",
  },
  {
    to: ROUTES.AUDIT,              label: "Audit Log",     icon: ClipboardList,
    section: null,                  color: "#F59E0B", iconBg: "rgba(245,158,11,0.15)",
  },
  {
    to: ROUTES.ALERTS,             label: "SOC Alerts",    icon: ShieldAlert,
    section: "SOC Monitor",         color: "#EF4444", iconBg: "rgba(239,68,68,0.18)",
  },
  {
    to: ROUTES.SOC_DASHBOARD,      label: "SOC Dashboard", icon: Activity,
    section: null,                  color: "#00d4ff", iconBg: "rgba(0,212,255,0.12)",
  },
  {
    to: ROUTES.SIEM_CONFIG,        label: "SIEM Config",   icon: SlidersHorizontal,
    section: null,                  color: "#22C55E", iconBg: "rgba(34,197,94,0.15)",
  },
  {
    to: ROUTES.MITRE,              label: "MITRE ATT&CK",    icon: Target,
    section: null,                  color: "#EF4444", iconBg: "rgba(239,68,68,0.15)",
  },
  {
    to: ROUTES.DETECTION_RULES,    label: "Detection Rules",  icon: Filter,
    section: null,                  color: "#F59E0B", iconBg: "rgba(245,158,11,0.15)",
  },
  {
    to: ROUTES.PROJECTS,           label: "Projects",         icon: Layers,
    section: null,                  color: "#A78BFA", iconBg: "rgba(167,139,250,0.15)",
  },
  {
    to: ROUTES.ANALYTICS,          label: "Analytics",     icon: BarChart3,
    section: null,                  color: "#A855F7", iconBg: "rgba(168,85,247,0.18)",
  },
  {
    to: ROUTES.SETTINGS,           label: "Settings",      icon: Settings,
    section: "System",              color: "#94A3B8", iconBg: "rgba(148,163,184,0.15)",
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

/** Shared nav content — used by both desktop and mobile drawers */
function SidebarNav({
  collapsed,
  onNavClick,
}: {
  collapsed: boolean;
  onNavClick?: () => void;
}) {
  const { user } = useAuth();
  const renderedSections = new Set<string>();
  // Admin gets admin-first nav (no pentest); everyone else gets standard nav
  const visibleItems = user?.role === "admin" ? adminNavItems : navItems;

  const ROLE_PILL: Record<string, { label: string; color: string; bg: string }> = {
    admin:   { label: "Admin",   color: "#f87171", bg: "rgba(239,68,68,0.12)"   },
    analyst: { label: "Analyst", color: "#00d4ff", bg: "rgba(0,212,255,0.10)"   },
    viewer:  { label: "Viewer",  color: "#94a3b8", bg: "rgba(148,163,184,0.10)" },
  };
  const rolePill = user ? ROLE_PILL[user.role] : null;

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-2.5 space-y-0.5 flex flex-col">
      <div className="flex-1 space-y-0.5">
      {visibleItems.map(({ to, label, icon: Icon, section, color, iconBg }) => {
        const showSection = section && !renderedSections.has(section);
        if (section) renderedSections.add(section);

        return (
          <div key={to}>
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

            <NavLink
              to={to}
              title={collapsed ? label : undefined}
              onClick={onNavClick}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center rounded-lg overflow-hidden transition-colors duration-150",
                  collapsed ? "justify-center p-2 mx-0.5" : "gap-2.5 px-2 py-2",
                  isActive
                    ? "bg-[var(--accent-dim)]"
                    : "text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-base)]"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !collapsed && (
                    <motion.span
                      layoutId="sidebar-active-bar"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full"
                      style={{ backgroundColor: color }}
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}

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
                        style={{ color: isActive ? "var(--accent)" : "inherit" }}
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
      </div>

      {/* Role indicator — label only, no username (user card lives in Header) */}
      {!collapsed && rolePill && (
        <div
          className="mx-2 mt-2 mb-1 px-3 py-1.5 rounded-lg flex items-center gap-2"
          style={{ backgroundColor: "var(--bg-muted)", border: "1px solid var(--border)" }}
        >
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: rolePill.color }}
          />
          <p className="text-[10px] uppercase tracking-[0.14em] font-semibold" style={{ color: rolePill.color }}>
            {rolePill.label}
          </p>
        </div>
      )}
    </nav>
  );
}

/** Logo header — shared between desktop and mobile */
function SidebarLogo({ collapsed, showClose, onClose }: { collapsed: boolean; showClose?: boolean; onClose?: () => void }) {
  return (
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
          background: "linear-gradient(135deg, rgba(0,212,255,0.20) 0%, rgba(168,85,247,0.18) 100%)",
          border: "1px solid rgba(0,212,255,0.30)",
          boxShadow: "0 0 16px rgba(0,212,255,0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
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
            className="overflow-hidden whitespace-nowrap flex-1"
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

      {showClose && (
        <button
          onClick={onClose}
          className="ml-auto p-1 rounded-lg transition-colors hover:bg-[var(--bg-muted)]"
          style={{ color: "var(--text-muted)" }}
          aria-label="Close sidebar"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, onToggle: _onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      {/* ── Desktop sidebar (md+) ─────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 64 : 240 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="fixed left-0 top-0 z-40 h-screen flex-col overflow-hidden border-r hidden md:flex"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <SidebarLogo collapsed={collapsed} />
        <SidebarNav collapsed={collapsed} />
      </motion.aside>

      {/* ── Mobile overlay backdrop ───────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            key="mobile-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/60 md:hidden"
            onClick={onMobileClose}
          />
        )}
      </AnimatePresence>

      {/* ── Mobile drawer ────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.aside
            key="mobile-drawer"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="fixed left-0 top-0 z-50 h-screen w-[75vw] max-w-[280px] flex flex-col overflow-hidden border-r md:hidden"
            style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            <SidebarLogo collapsed={false} showClose onClose={onMobileClose} />
            <SidebarNav collapsed={false} onNavClick={onMobileClose} />
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
