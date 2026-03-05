import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { TransitionProvider } from "@/components/transitions/TransitionProvider";
import ErrorBoundary from "@/components/common/ErrorBoundary";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import BottomNav from "./BottomNav";
import CommandPalette from "@/components/common/CommandPalette";
import GlobalToast from "@/components/common/GlobalToast";

const SIDEBAR_KEY = "cs_sidebar_open";

export default function AppLayout() {
  const location = useLocation();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      return stored === null ? false : stored === "false";
    } catch {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(!collapsed));
    } catch { /* ignore */ }
  }, [collapsed]);

  const toggleSidebar = () => {
    if (window.innerWidth <= 900) {
      setMobileOpen((prev) => !prev);
    } else {
      setCollapsed((prev) => !prev);
    }
  };

  return (
    <div className={`app${collapsed ? " collapsed" : ""}`}>
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="main">
        <TopBar onToggleSidebar={toggleSidebar} />

        <main className="content">
          <ErrorBoundary key={location.key}>
            <TransitionProvider>
              <Outlet />
            </TransitionProvider>
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile bottom nav */}
      <BottomNav />

      {/* Global overlays */}
      <CommandPalette />
      <GlobalToast />
    </div>
  );
}
