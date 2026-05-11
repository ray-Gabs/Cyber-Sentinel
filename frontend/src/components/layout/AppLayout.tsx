/**
 * AppLayout — main shell with collapsible sidebar and animated page transitions.
 * Desktop: persistent collapsible sidebar.
 * Mobile: overlay drawer triggered by hamburger in Header + bottom nav bar.
 * Sidebar state is persisted in localStorage.
 */
import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TransitionProvider } from "@/components/transitions/TransitionProvider";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";
import CommandPalette from "@/components/common/CommandPalette";
import GlobalToast from "@/components/common/GlobalToast";

const SIDEBAR_KEY = "cs_sidebar_open";

export default function AppLayout() {
  const location = useLocation();

  // Desktop: collapsed vs expanded
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  // Mobile: overlay drawer
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(sidebarOpen));
    } catch {
      // localStorage unavailable — ignore
    }
  }, [sidebarOpen]);

  const toggleSidebar = () => {
    if (window.innerWidth < 768) {
      setMobileOpen((prev) => !prev);
    } else {
      setSidebarOpen((prev) => !prev);
    }
  };

  const sidebarWidth = sidebarOpen ? 240 : 64;

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ backgroundColor: "var(--bg-base)" }}>

      {/* ── Sidebar (desktop fixed + mobile overlay drawer) ───────── */}
      <Sidebar
        collapsed={!sidebarOpen}
        onToggle={toggleSidebar}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      {/* ── Main content ──────────────────────────────────────────── */}
      {/*
        Desktop (md+):  margin-left tracks sidebar width via CSS var
        Mobile (<md):   no margin (sidebar is overlay), extra bottom padding for BottomNav
      */}
      <div
        className="relative z-10 flex flex-col min-h-screen layout-main"
        style={{ ["--sidebar-current-width" as string]: `${sidebarWidth}px` }}
      >
        <Header onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />

        <main className="flex-1 px-3 sm:px-5 md:px-6 lg:px-8 pt-4 sm:pt-5 md:pt-6 layout-main-content">
          <ErrorBoundary key={location.key}>
            <TransitionProvider>
              <Outlet />
            </TransitionProvider>
          </ErrorBoundary>

        </main>
      </div>

      {/* ── Bottom navigation — mobile only ───────────────────────── */}
      <BottomNav />

      {/* ── Global Cmd+K command palette ──────────────────────────── */}
      <CommandPalette />

      {/* ── Global toast notifications ────────────────────────────── */}
      <GlobalToast />
    </div>
  );
}
