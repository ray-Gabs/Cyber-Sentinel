/**
 * Register page — form for creating a new account.
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Shield, UserPlus, AlertCircle } from "lucide-react";
import { ROUTES } from "@/lib/constants";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await register({ username, email, password });
      navigate(ROUTES.DASHBOARD);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Registration failed. Try a different username.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-sentinel-500" />
          <h1 className="mt-4 text-2xl font-bold text-white">Cyber Sentinel</h1>
          <p className="mt-1 text-sm text-gray-500">Create your account</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5">
          <h2 className="text-lg font-semibold text-white">Register</h2>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="label">Username</label>
            <input id="username" type="text" className="input" placeholder="Choose a username"
              value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>

          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" type="email" className="input" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div>
            <label htmlFor="password" className="label">Password</label>
            <input id="password" type="password" className="input" placeholder="Min 8 characters"
              value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            <UserPlus className="h-4 w-4" />
            {loading ? "Creating account..." : "Create account"}
          </button>

          <p className="text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link to={ROUTES.LOGIN} className="text-sentinel-400 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
