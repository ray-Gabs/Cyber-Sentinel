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

  // On mount: attempt to fetch the current user via the HttpOnly cookie.
  // The cookie is sent automatically — no token read from JS.
  // A 401 response means no valid session; ProtectedRoute handles redirects.
  useEffect(() => {
    authService
      .getMe()
      .then(setUser)
      .catch((err: unknown) => {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status !== 401) {
          authService.clearToken();
        }
        // 401 is handled by the api interceptor redirect — no extra action needed
      })
      .finally(() => setLoading(false));
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
