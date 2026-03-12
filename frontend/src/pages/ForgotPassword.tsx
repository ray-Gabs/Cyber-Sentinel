/**
 * ForgotPassword page — user enters their email to receive a reset link.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Shield, Mail, ArrowLeft, AlertCircle, CheckCircle } from "lucide-react";
import { ROUTES } from "@/lib/constants";
import { forgotPassword } from "@/services/authService";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await forgotPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        || "Something went wrong. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(14,165,233,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(14,165,233,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-sentinel-500/5 rounded-full blur-3xl" />

      <div className="relative w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="relative mx-auto w-16 h-16 flex items-center justify-center">
            <div className="absolute inset-0 bg-sentinel-500/20 rounded-2xl rotate-6" />
            <div className="absolute inset-0 bg-sentinel-500/10 rounded-2xl -rotate-6" />
            <div className="relative bg-gray-900 rounded-2xl w-full h-full flex items-center justify-center border border-sentinel-500/30">
              <Shield className="h-8 w-8 text-sentinel-400" />
            </div>
          </div>
          <h1 className="mt-5 text-3xl font-bold text-white tracking-tight">Forgot Password</h1>
          <p className="mt-2 text-sm text-gray-500">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {success ? (
          <div className="card space-y-4 backdrop-blur-sm bg-gray-900/80">
            <div className="flex items-center gap-3 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-4 text-sm text-green-400">
              <CheckCircle className="h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">Check your email</p>
                <p className="text-green-400/70 text-xs mt-1">
                  If <strong>{email}</strong> is registered, you&apos;ll receive a password reset link shortly. Check your spam folder too.
                </p>
              </div>
            </div>
            <Link to={ROUTES.LOGIN} className="btn-secondary w-full">
              <ArrowLeft className="h-4 w-4" />
              Back to Sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-5 backdrop-blur-sm bg-gray-900/80">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="label">Email address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <input
                  id="email"
                  type="email"
                  className="input pl-10"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Sending...
                </span>
              ) : (
                "Send Reset Link"
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Remember your password?{" "}
              <Link to={ROUTES.LOGIN} className="text-sentinel-400 hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
