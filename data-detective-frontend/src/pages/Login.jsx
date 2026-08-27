import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Terminal, Loader2 } from "lucide-react";
import { api } from "../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.login(email, password);
      navigate("/");
    } catch (err) {
      setError(
        err.response?.data?.detail || "Login failed. Check your credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <Terminal size={20} className="text-signal-400" />
          <span className="font-display font-semibold text-lg text-inktext-100">
            Data Detective
          </span>
        </div>

        <div className="bg-ink-800 border border-ink-700 rounded-xl p-6">
          <h1 className="font-display text-lg font-medium text-inktext-100 mb-1">
            Sign in
          </h1>
          <p className="text-sm text-inktext-400 mb-6">
            Access your analysis workspace.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs text-inktext-400 mb-1.5">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-ink-900 border border-ink-700 rounded-md px-3 py-2 text-sm text-inktext-100 focus:outline-none focus:border-signal-400 transition-colors"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="block text-xs text-inktext-400 mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-ink-900 border border-ink-700 rounded-md px-3 py-2 text-sm text-inktext-100 focus:outline-none focus:border-signal-400 transition-colors"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-danger-400 bg-danger-400/10 border border-danger-400/30 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full bg-signal-400 text-ink-950 font-medium text-sm rounded-md py-2 hover:bg-signal-500 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              Sign in
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-inktext-400 mt-6">
          No account yet?{" "}
          <Link to="/register" className="text-signal-400 hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
