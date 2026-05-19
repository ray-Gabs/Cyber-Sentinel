import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Icon } from "@/components/ui";
import { ROUTES } from "@/lib/constants";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
  section: string | null;
  badge?: string;
  adminOnly?: boolean;
  roles?: string[];
}

const NAV_ITEMS: NavItem[] = [
  { to: ROUTES.DASHBOARD,       label: "Dashboard",       icon: "dashboard", section: null },
  { to: ROUTES.SOC_DASHBOARD,   label: "SOC Dashboard",   icon: "activity",  section: "SOC Platform" },
  { to: ROUTES.ALERTS,          label: "SOC Alerts",      icon: "bell",      section: null },
  { to: ROUTES.PROJECTS,        label: "Projects",        icon: "folder",    section: null },
  { to: ROUTES.ANALYTICS,       label: "Analytics",       icon: "chart",     section: null },
  { to: ROUTES.SCANS,           label: "Scans",           icon: "scan",      section: "Pentest Engine" },
  { to: ROUTES.SCANS_SCHEDULED, label: "Scheduled",       icon: "calendar",  section: null, roles: ["analyst"] },
  { to: ROUTES.CORRELATIONS,    label: "Correlation",     icon: "network",   section: "Intelligence" },
  { to: ROUTES.MITRE,           label: "MITRE ATT&CK",   icon: "target",    section: null },
  { to: ROUTES.DETECTION_RULES, label: "Detection Rules", icon: "rules",     section: null },
  { to: ROUTES.AGENTS,          label: "Agents",          icon: "database",  section: "SOC Platform", roles: ["analyst"] },
  { to: ROUTES.ADMIN,           label: "Users",           icon: "users",     section: "Admin", adminOnly: true },
  { to: ROUTES.AUDIT,           label: "Audit Log",       icon: "logs",      section: null, adminOnly: true },
  { to: ROUTES.SETTINGS,        label: "Settings",        icon: "settings",  section: "System" },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { to: ROUTES.DASHBOARD,       label: "Dashboard",       icon: "dashboard", section: null },
  { to: ROUTES.ADMIN,           label: "Users",           icon: "users",     section: "Admin Panel" },
  { to: ROUTES.AUDIT,           label: "Audit Log",       icon: "logs",      section: null },
  { to: ROUTES.SCANS,           label: "Scans",           icon: "scan",      section: "Pentest Engine" },
  { to: ROUTES.SCANS_SCHEDULED, label: "Scheduled",       icon: "calendar",  section: null },
  { to: ROUTES.CORRELATIONS,    label: "Correlation",     icon: "network",   section: "Intelligence" },
  { to: ROUTES.SOC_DASHBOARD,   label: "SOC Dashboard",   icon: "activity",  section: "SOC Monitor" },
  { to: ROUTES.ALERTS,          label: "SOC Alerts",      icon: "bell",      section: null },
  { to: ROUTES.PROJECTS,        label: "Projects",        icon: "folder",    section: null },
  { to: ROUTES.ANALYTICS,       label: "Analytics",       icon: "chart",     section: null },
  { to: ROUTES.MITRE,           label: "MITRE ATT&CK",   icon: "target",    section: null },
  { to: ROUTES.DETECTION_RULES, label: "Detection Rules", icon: "rules",     section: null },
  { to: ROUTES.AGENTS,          label: "Agents",          icon: "database",  section: "Admin" },
  { to: ROUTES.SETTINGS,        label: "Settings",        icon: "settings",  section: "System" },
];

function SidebarContent({
  collapsed,
  onNavClick,
  showClose,
  onClose,
}: {
  collapsed: boolean;
  onNavClick?: () => void;
  showClose?: boolean;
  onClose?: () => void;
}) {
  const { user, logout } = useAuth();
  const renderedSections = new Set<string>();
  const rawItems = user?.role === "admin" ? ADMIN_NAV_ITEMS : NAV_ITEMS;
  const items = rawItems.filter((item) => {
    if (item.adminOnly) return false;
    if (item.roles && !item.roles.includes(user?.role ?? "")) return false;
    return true;
  });
  const avatarLetter = user?.username?.charAt(0).toUpperCase() ?? "?";

  return (
    <>
      {/* Brand */}
      <div className="sb-brand">
        <div className="sb-brand-mark" />
        {!collapsed && (
          <div style={{ lineHeight: 1.1, flex: 1, minWidth: 0 }}>
            <div className="sb-brand-name">Cyber Sentinel</div>
            <div className="sb-brand-tag">PENTEST · SOC</div>
          </div>
        )}
        {showClose && (
          <button className="tb-iconbtn" onClick={onClose} style={{ marginLeft: "auto" }}>
            <Icon name="x" size={14} />
          </button>
        )}
        {!showClose && !collapsed && (
          <button className="tb-iconbtn" title="Collapse sidebar">
            {/* placeholder to maintain layout */}
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="sb-nav">
        {items.map((item) => {
          const showSection = item.section && !renderedSections.has(item.section);
          if (item.section) renderedSections.add(item.section);

          return (
            <div key={item.to}>
              {showSection && !collapsed && (
                <div className="sb-section">{item.section}</div>
              )}
              {showSection && collapsed && (
                <div style={{ margin: "8px 4px", height: 1, background: "var(--border)" }} />
              )}
              <NavLink
                to={item.to}
                end
                title={collapsed ? item.label : undefined}
                onClick={onNavClick}
                className={({ isActive }) => `sb-item${isActive ? " active" : ""}`}
              >
                <Icon name={item.icon} size={15} />
                {!collapsed && <span>{item.label}</span>}
                {!collapsed && item.badge && (
                  <span className="sb-item-badge">{item.badge}</span>
                )}
              </NavLink>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="sb-foot">
        <div className="sb-foot-avatar">{avatarLetter}</div>
        {!collapsed && (
          <div className="sb-foot-meta">
            <div className="sb-foot-name">{user?.username ?? "—"}</div>
            <div className="sb-foot-role">{user?.role?.toUpperCase() ?? "—"}</div>
          </div>
        )}
        <button
          className="tb-iconbtn"
          title="Sign out"
          onClick={() => logout()}
        >
          <Icon name="arrowOut" size={15} />
        </button>
      </div>
    </>
  );
}

export default function Sidebar({ collapsed, onToggle: _onToggle, mobileOpen, onMobileClose }: SidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className={`sb${collapsed ? " sb--collapsed" : ""}`}>
        <SidebarContent collapsed={collapsed} />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 99 }}
            onClick={onMobileClose}
          />
          <aside
            style={{
              position: "fixed", left: 0, top: 0, bottom: 0, width: 232, zIndex: 100,
              background: "var(--bg-2)", borderRight: "1px solid var(--border)",
              display: "flex", flexDirection: "column",
            }}
          >
            <SidebarContent collapsed={false} onNavClick={onMobileClose} showClose onClose={onMobileClose} />
          </aside>
        </>
      )}
    </>
  );
}
