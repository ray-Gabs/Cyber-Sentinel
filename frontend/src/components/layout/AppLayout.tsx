/**
 * AppLayout — the main shell: sidebar on the left, header on top, content in the center.
 * Every authenticated page uses this layout.
 *
 * <Outlet /> is a react-router concept — it renders whatever child route is active.
 */
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";

export default function AppLayout() {
  return (
    <div className="min-h-screen">
      <Sidebar />
      {/* Main content area — offset by sidebar width (w-64 = 16rem) */}
      <div className="ml-64">
        <Header />
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
