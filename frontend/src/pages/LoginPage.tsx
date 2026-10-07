import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ShieldCheck, User, Lock, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { api, errorMessage, setSession } from "../api";
import type { TokenResponse } from "../types";

export default function LoginPage(): ReactElement {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const resp = await api.post<TokenResponse>("/api/auth/login", { username, password });
      setSession(resp.data);
      navigate("/dashboard");
    } catch (err) {
      setError(errorMessage(err, "Login gagal. Periksa username dan password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-100 to-slate-200 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md px-4">
        {/* Brand Header */}
        <div className="flex justify-center mb-3">
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-tr from-emerald-800 to-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-700/20 ring-4 ring-emerald-50">
            <ShieldCheck className="h-9 w-9 text-emerald-100" />
          </div>
        </div>
        <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          kas-transparan
        </h1>
        <p className="mt-1 text-center text-sm text-slate-600">
          Platform Akuntabilitas Keuangan Komunitas & Warga
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-8 px-6 shadow-xl shadow-slate-900/5 rounded-2xl border border-slate-200/80 sm:px-10">
          <div className="mb-6 pb-4 border-b border-slate-100 text-center">
            <h2 className="text-base font-semibold text-slate-800">Masuk ke Portal Pengurus</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Admin &bull; Bendahara &bull; Ketua RT/RW
            </p>
          </div>

          <form className="space-y-5" onSubmit={handleSubmit}>
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm"
              >
                <AlertCircle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 text-xs leading-relaxed font-medium">{error}</div>
              </div>
            )}

            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Username
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <User className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Contoh: admin atau ketua"
                  required
                  className="block w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-slate-900 text-sm placeholder-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition duration-150"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5"
              >
                Password
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  required
                  className="block w-full rounded-xl border border-slate-300 pl-10 pr-3.5 py-2.5 text-slate-900 text-sm placeholder-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition duration-150"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white font-medium text-sm bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 disabled:opacity-70 disabled:cursor-not-allowed shadow-md shadow-emerald-700/20 transition duration-150"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Memproses...</span>
                </>
              ) : (
                <>
                  <span>Masuk Dashboard</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Public Access Civic Banner */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 text-center">
              <p className="text-xs font-semibold text-slate-800">Warga RT/RW Ingin Cek Kas?</p>
              <p className="text-xs text-slate-500 mt-1">
                Laporan kas terbuka untuk publik tanpa login:
              </p>
              <div className="mt-2 flex items-center justify-center">
                <Link
                  to="/public/rt01-sukamaju"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:underline bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200"
                >
                  <span>Buka portal: /public/rt01-sukamaju</span>
                  <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Inisiatif Tata Kelola Terbuka &copy; {new Date().getFullYear()} kas-transparan
        </p>
      </div>
    </div>
  );
}
