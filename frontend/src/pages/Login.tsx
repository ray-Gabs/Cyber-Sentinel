/**
 * Login page — cybersecurity-themed sign-in form.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Shield, LogIn, AlertCircle, Eye, EyeOff, Lock, User } from "lucide-react";
import { ROUTES } from "@/lib/constants";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await login({ username, password });
      navigate(ROUTES.DASHBOARD);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Login failed. Check your credentials.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      {/* Background grid effect */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
      {/* Radial glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sentinel-500/5 rounded-full blur-3xl" />

      <div className="relative w-full max-w-md space-y-8">
        {/* Logo + branding */}
        <div className="text-center">
          <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 bg-sentinel-500/20 rounded-2xl rotate-6" />
            <div className="absolute inset-0 bg-sentinel-500/10 rounded-2xl -rotate-6" />
            <div className="relative bg-gray-900 rounded-2xl w-full h-full flex items-center justify-center border border-sentinel-500/30">
              <Shield className="h-8 w-8 text-sentinel-400" />
            </div>
          </div>
          <h1 className="mt-5 text-3xl font-bold text-white tracking-tight">Cyber Sentinel</h1>
          <p className="mt-2 text-sm text-gray-500">
            AI-Powered Pentesting &amp; SOC Platform
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="card space-y-5 backdrop-blur-sm bg-gray-900/80">
          <div>
            <h2 className="text-lg font-semibold text-white">Welcome back</h2>
            <p className="text-xs text-gray-500 mt-0.5">Sign in to access your dashboard</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="label">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                id="username"
                type="text"
                className="input pl-10"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                className="input pl-10 pr-10"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in...
              </span>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Sign in
              </>
            )}
          </button>

          <p className="text-center text-sm text-gray-500">
            <Link to={ROUTES.FORGOT_PASSWORD} className="text-sentinel-400 hover:underline">
              Forgot your password?
            </Link>
          </p>

          <p className="text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link to={ROUTES.REGISTER} className="text-sentinel-400 hover:underline">
              Register
            </Link>
          </p>
        </form>

        <p className="text-center text-xs text-gray-600">
          Cyber Sentinel v1.0 &mdash; ITS Cybersecurity Lab
        </p>
      </div>
    </div>
  );
}
