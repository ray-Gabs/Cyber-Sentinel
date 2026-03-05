/**
 * Login page — form for username + password login.
 *
 * TypeScript tip: `React.FormEvent<HTMLFormElement>` is the type for form submit events.
 * `useState<string>("")` means "this state holds a string, starting as empty."
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Shield, LogIn, AlertCircle } from "lucide-react";
import { ROUTES } from "@/lib/constants";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); // prevent page reload
    setError("");
    setLoading(true);

    try {
      await login({ username, password });
      navigate(ROUTES.DASHBOARD);
    } catch (err: unknown) {
      // Show error message from server, or a generic one
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Login failed. Check your credentials.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo */}
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-sentinel-500" />
          <h1 className="mt-4 text-2xl font-bold text-white">Cyber Sentinel</h1>
          <p className="mt-1 text-sm text-gray-500">
            AI-Powered Pentesting &amp; SOC Platform
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card space-y-5">
          <h2 className="text-lg font-semibold text-white">Sign in</h2>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="label">Username</label>
            <input
              id="username"
              type="text"
              className="input"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            <LogIn className="h-4 w-4" />
            {loading ? "Signing in..." : "Sign in"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link to={ROUTES.REGISTER} className="text-sentinel-400 hover:underline">
              Register
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
