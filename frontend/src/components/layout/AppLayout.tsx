/**
 * AppLayout — main shell with collapsible sidebar, animated page transitions,
 * and AnimatedGridPattern background behind all content.
 * Sidebar state is persisted in localStorage.
 */
import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useTheme } from "@/providers/ThemeProvider";
import { TransitionProvider } from "@/components/transitions/TransitionProvider";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { AnimatedGridPattern } from "@/components/ui/AnimatedGridPattern";
import { cn } from "@/lib/utils";

const SIDEBAR_KEY = "cs_sidebar_open";

export default function AppLayout() {
  const { isDark } = useTheme();

  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(SIDEBAR_KEY);
      return stored === null ? true : stored === "true";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, String(sidebarOpen));
    } catch {
      // localStorage unavailable — ignore
    }
  }, [sidebarOpen]);

  const toggleSidebar = () => setSidebarOpen((prev) => !prev);
  const sidebarWidth  = sidebarOpen ? 240 : 64;

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

      {/* ── Sidebar ───────────────────────────────────────────────── */}
      <Sidebar collapsed={!sidebarOpen} onToggle={toggleSidebar} />

      {/* ── Main content ──────────────────────────────────────────── */}
      <div
        className="relative z-10 flex flex-col min-h-screen"
        style={{
          marginLeft: sidebarWidth,
          transition: "margin-left 0.22s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <Header onToggleSidebar={toggleSidebar} sidebarOpen={sidebarOpen} />

        <main className="flex-1 p-6">
          <TransitionProvider>
            <Outlet />
          </TransitionProvider>
        </main>
      </div>
    </div>
  );
}
