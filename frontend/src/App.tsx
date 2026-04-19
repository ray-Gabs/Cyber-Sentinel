/**
 * App.tsx — The root component. Sets up routing (which URL shows which page).
 *
 * Route structure:
 *   /            → Landing page (public)
 *   /login       → Login page
 *   /register    → Register page
 *   /dashboard   → Dashboard (requires login)
 *   /scans       → Scan list
 *   /scans/new   → New scan form
 *   /scans/:id   → Scan detail
 *   /alerts      → Alert feed
 *   /alerts/:id  → Alert detail
 *   /analytics   → Charts
 *   /settings    → Settings
 *   /admin       → User management (admin only)
 */
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { ThemeProvider } from "@/providers/ThemeProvider";
import AppLayout from "@/components/layout/AppLayout";
import { PageLoader } from "@/components/common/LoadingSpinner";
import ErrorBoundary from "@/components/common/ErrorBoundary";

// Pages (lazy-loaded later if you want, but fine as direct imports for now)
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import ScanList from "@/pages/pentest/ScanList";
import ScanConfig from "@/pages/pentest/ScanConfig";
import ScanDetail from "@/pages/pentest/ScanDetail";
import ScanDiff from "@/pages/pentest/ScanDiff";
import AlertFeed from "@/pages/soc/AlertFeed";
import AlertDetail from "@/pages/soc/AlertDetail";
import Analytics from "@/pages/soc/Analytics";
import AgentsMonitor from "@/pages/soc/AgentsMonitor";
import UserProjects from "@/pages/soc/UserProjects";
import Settings from "@/pages/Settings";
import Correlation from "@/pages/Correlation";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Admin from "@/pages/Admin";
import AuditLog from "@/pages/AuditLog";
import Onboarding from "@/pages/Onboarding";
import AdminNotifications from "@/pages/AdminNotifications";
import SocDashboard from "@/pages/soc/SocDashboard";
import SiemConfig from "@/pages/soc/SiemConfig";
import MitreNavigator from "@/pages/soc/MitreNavigator";

// React Query client — used for data fetching/caching (you'll use this later)
const queryClient = new QueryClient();

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

/**
 * ProtectedRoute — redirects to /login if user is not authenticated.
 */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/**
 * RoleRoute — redirects to /dashboard with state if user lacks required role.
 * Role hierarchy: viewer (0) < analyst (1) < admin (2)
 */
function RoleRoute({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole: "analyst" | "admin";
}) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;

  const roleLevel: Record<string, number> = { viewer: 0, analyst: 1, admin: 2 };
  const userLevel = roleLevel[user.role] ?? 0;
  const requiredLevel = roleLevel[requiredRole];

  if (userLevel < requiredLevel) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{ roleBlocked: true, requiredRole }}
      />
    );
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/onboarding" element={<Onboarding />} />

      {/* Protected routes — wrapped in the sidebar/header layout */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/scans" element={<ScanList />} />
        <Route path="/scans/new" element={<RoleRoute requiredRole="analyst"><ScanConfig /></RoleRoute>} />
        <Route path="/scans/:id" element={<ScanDetail />} />
        <Route path="/scans/:id/diff" element={<ScanDiff />} />
        <Route path="/alerts" element={<AlertFeed />} />
        <Route path="/alerts/:id" element={<AlertDetail />} />
        <Route path="/agents" element={<AgentsMonitor />} />
        <Route path="/projects" element={<UserProjects />} />
        <Route path="/soc/dashboard" element={<SocDashboard />} />
        <Route path="/soc/siem-config" element={<SiemConfig />} />
        <Route path="/mitre" element={<MitreNavigator />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/correlations" element={<Correlation />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<RoleRoute requiredRole="admin"><Admin /></RoleRoute>} />
        <Route path="/audit" element={<RoleRoute requiredRole="admin"><AuditLog /></RoleRoute>} />
        <Route path="/admin/notifications" element={<RoleRoute requiredRole="admin"><AdminNotifications /></RoleRoute>} />
      </Route>

      {/* Default: redirect to landing */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
