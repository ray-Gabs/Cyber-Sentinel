/**
 * useAuth hook — manages authentication state across the app.
 *
 * TypeScript tip: React.createContext<AuthContextType | null>(null)
 * means "create a context that holds either an AuthContextType object or null."
 * The `!` in useAuth() means "I promise this won't be null" (because we wrap the app in AuthProvider).
 */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import type { UserResponse, LoginRequest, RegisterRequest } from "@/types";
import * as authService from "@/services/authService";

// Define what the auth context provides
interface AuthContextType {
  user: UserResponse | null; // current user (null if not logged in)
  loading: boolean;          // true while checking if user is authenticated
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
}

// Create the context (starts as null, gets filled by AuthProvider)
const AuthContext = createContext<AuthContextType | null>(null);

/**
 * AuthProvider — wraps the entire app to provide auth state everywhere.
 * Any component inside <AuthProvider> can call useAuth() to get the user.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // On mount: check if we have a valid token and fetch user info
  useEffect(() => {
    if (authService.isAuthenticated()) {
      authService
        .getMe()
        .then(setUser)
        .catch(() => {
          // Token is invalid/expired — clear it but do NOT redirect.
          // ProtectedRoute handles redirects for auth-gated pages.
          // Public routes like "/" must never be hijacked to "/login".
          authService.clearToken();
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    await authService.login(data);
    const me = await authService.getMe();
    setUser(me);
  }, []);

  const register = useCallback(async (data: RegisterRequest) => {
    await authService.register(data);
    // Registration creates a pending account — no token is issued.
    // The caller (Register page) handles navigation to success/login.
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    authService.logout();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

/** Hook to access auth state from any component */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>");
  }
  return context;
}
