/**
 * AppLayout — main shell with collapsible sidebar, animated page transitions,
 * and AnimatedGridPattern background behind all content.
 * Desktop: persistent collapsible sidebar.
 * Mobile: overlay drawer triggered by hamburger in Header + bottom nav bar.
 * Sidebar state is persisted in localStorage.
 */
import { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useTheme } from "@/providers/ThemeProvider";
import { TransitionProvider } from "@/components/transitions/TransitionProvider";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BottomNav from "./BottomNav";
import { AnimatedGridPattern } from "@/components/ui/AnimatedGridPattern";
import { ScrollVelocity } from "@/components/ui/reactbits/ScrollVelocity";
import { cn } from "@/lib/utils";

const SECURITY_TOOLS = [
  "Nmap", "Nuclei", "SSLyze", "WhatWeb", "OWASP ZAP",
  "Wazuh", "EPSS", "MITRE ATT&CK", "CVE Scanner", "OWASP Top 10",
];

const SIDEBAR_KEY = "cs_sidebar_open";

export default function AppLayout() {
  const { isDark } = useTheme();
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
    <div className="min-h-screen relative" style={{ backgroundColor: "var(--bg-base)" }}>

      {/* ── Animated grid — full-screen fixed background ─────────── */}
      <div
        className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
        style={{ color: isDark ? "rgba(59,130,246,0.22)" : "rgba(37,99,235,0.12)" }}
      >
        <AnimatedGridPattern
          width={44}
          height={44}
          numSquares={35}
          maxOpacity={0.85}
          duration={4}
          repeatDelay={0.5}
          className={cn(
            "[mask-image:radial-gradient(ellipse_90%_85%_at_50%_50%,white,transparent)]",
            "stroke-current fill-current"
          )}
        />
      </div>

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
          <TransitionProvider>
            <Outlet />
          </TransitionProvider>

          {/* Decorative security-tools marquee strip */}
          <div className="mt-8 mb-2 hidden md:block" style={{ opacity: 0.18 }}>
            <ScrollVelocity items={SECURITY_TOOLS} baseSpeed={0.8} direction="left"  className="mb-1" />
            <ScrollVelocity items={SECURITY_TOOLS} baseSpeed={0.8} direction="right" />
          </div>
        </main>
      </div>

      {/* ── Bottom navigation — mobile only ───────────────────────── */}
      <BottomNav />
    </div>
  );
}
