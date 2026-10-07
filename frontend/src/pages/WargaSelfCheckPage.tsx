import { useState, type FormEvent, type ReactElement } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ShieldCheck,
  Search,
  Phone,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Receipt,
  User,
  Home,
  CreditCard,
  Banknote,
  Loader2,
} from "lucide-react";
import { api, errorMessage, formatRupiah } from "../api";
import type { WargaSelfCheckResponse } from "../types";

function formatPeriodeLabel(periodeStr: string): string {
  const parts = periodeStr.split("-");
  if (parts.length !== 2) return periodeStr;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const d = new Date(year, month, 1);
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

export default function WargaSelfCheckPage(): ReactElement {
  const { slug } = useParams<{ slug: string }>();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WargaSelfCheckResponse | null>(null);
  const [searched, setSearched] = useState(false);

  async function handleSearch(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    setResult(null);
    setSearched(true);
    setLoading(true);

    try {
      const resp = await api.get<WargaSelfCheckResponse>(`/api/public/${slug}/cek-tagihan`, {
        params: { no_hp: phone.trim() },
      });
      setResult(resp.data);
    } catch (err) {
      setError(errorMessage(err, "Nomor HP tidak ditemukan atau belum terdaftar"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Header */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-20 backdrop-blur-sm bg-white/95">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-emerald-700/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-sm font-bold tracking-tight text-slate-900 block leading-tight">
                kas-transparan
              </span>
              <span className="text-[11px] font-medium text-emerald-700 block">
                Cek Tagihan Mandiri Warga
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/public/${slug}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition border border-slate-200"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Kembali ke Laporan Kas</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 sm:pt-10 space-y-6">
        {/* Card Form Pencarian */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-4">
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 mb-2">
              <Receipt className="w-6 h-6" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Cek Tagihan &amp; Iuran Anda
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto">
              Masukkan nomor HP (WhatsApp) yang terdaftar di RT/RW untuk melihat rincian tagihan
              Anda secara mandiri.
            </p>
          </div>

          <form onSubmit={handleSearch} className="space-y-3 pt-2">
            <div>
              <label
                htmlFor="phone-input"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1"
              >
                Nomor Telepon / WhatsApp
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  id="phone-input"
                  type="tel"
                  required
                  placeholder="Contoh: 08123456789 atau 628123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Privasi terjaga: hanya nomor terdaftar yang dapat melihat rincian tagihan terkait.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !phone.trim()}
              className="w-full min-h-[44px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white font-semibold text-sm bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 shadow-sm transition"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Memeriksa Tagihan...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Cari Tagihan Saya</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2.5 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm animate-in fade-in"
          >
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Search Results */}
        {result && (
          <div className="space-y-4 animate-in fade-in">
            {/* Warga Profile Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-lg shrink-0">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900 leading-tight">
                    {result.warga_nama}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    {result.no_rumah && (
                      <span className="inline-flex items-center gap-1">
                        <Home className="w-3.5 h-3.5 text-slate-400" />
                        No. {result.no_rumah}
                      </span>
                    )}
                    <span>&bull;</span>
                    <span>{result.komunitas_nama}</span>
                  </div>
                </div>
              </div>

              <div className="sm:text-right pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                <span className="text-xs text-slate-500 block">Total Tunggakan</span>
                <span
                  className={`text-xl font-bold font-mono ${
                    result.total_unpaid_nominal > 0 ? "text-rose-600" : "text-emerald-700"
                  }`}
                >
                  {formatRupiah(result.total_unpaid_nominal)}
                </span>
                {result.total_unpaid_count > 0 ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full mt-0.5">
                    <Clock className="w-3 h-3" />
                    {result.total_unpaid_count} tagihan belum lunas
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full mt-0.5">
                    <CheckCircle2 className="w-3 h-3" />
                    Semua tagihan lunas
                  </span>
                )}
              </div>
            </div>

            {/* List of Bills */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                  Riwayat Tagihan &amp; Pembayaran
                </h3>
                <span className="text-xs text-slate-400">{result.tagihan_list.length} catatan</span>
              </div>

              {result.tagihan_list.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  Belum ada tagihan yang diterbitkan untuk akun ini.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {result.tagihan_list.map((t) => (
                    <div
                      key={t.id}
                      className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 text-sm">
                            {t.iuran_nama}
                          </span>
                          <span className="text-xs text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded">
                            {formatPeriodeLabel(t.periode)}
                          </span>
                        </div>
                        {t.status === "lunas" && t.payment_method && (
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            {t.payment_method === "transfer" ? (
                              <CreditCard className="w-3 h-3 text-slate-400" />
                            ) : (
                              <Banknote className="w-3 h-3 text-slate-400" />
                            )}
                            <span className="capitalize">
                              Dibayar via {t.payment_method}
                              {t.paid_at &&
                                ` pada ${new Date(t.paid_at).toLocaleDateString("id-ID")}`}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                        <span className="font-mono font-bold text-slate-900 text-base">
                          {formatRupiah(t.nominal)}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                            t.status === "lunas"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {t.status === "lunas" ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>Lunas</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>Belum Bayar</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {searched && !loading && !result && !error && (
          <div className="bg-white rounded-2xl border border-slate-200/80 p-8 text-center text-slate-500 text-sm">
            Tidak ada data tagihan ditemukan untuk nomor ini.
          </div>
        )}
      </main>
    </div>
  );
}
