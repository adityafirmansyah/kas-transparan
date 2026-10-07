import { useEffect, useState, type ReactElement } from "react";
import { useParams, Link } from "react-router-dom";
import {
  ShieldCheck,
  Share2,
  Calendar,
  Wallet,
  TrendingUp,
  TrendingDown,
  PieChart,
  Lock,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Building2,
  Check,
  Receipt,
} from "lucide-react";
import { api, errorMessage, formatRupiah } from "../api";
import type { PublicSummary } from "../types";

export default function PublicPage(): ReactElement {
  const { slug } = useParams();
  const [summary, setSummary] = useState<PublicSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .get<PublicSummary>(`/api/public/${slug}/summary`)
      .then((resp) => setSummary(resp.data))
      .catch((err) => setError(errorMessage(err, "Komunitas tidak ditemukan")))
      .finally(() => setLoading(false));
  }, [slug]);

  function handleShare(): void {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 animate-pulse mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <p className="text-sm font-medium text-slate-600">Memuat laporan transparansi...</p>
        </div>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl p-6 shadow-sm border border-slate-200 text-center">
          <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">Komunitas Tidak Ditemukan</h2>
          <p className="text-sm text-slate-500 mt-1 mb-5">
            {error || "Tautan transparansi tidak valid atau komunitas belum terdaftar."}
          </p>
          <Link
            to="/login"
            className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Login
          </Link>
        </div>
      </div>
    );
  }

  // Calculate total categorized expenses and percentages
  const categoryEntries = Object.entries(summary.pengeluaran_per_kategori);
  const totalCategorized = categoryEntries.reduce((acc, [, val]) => acc + val, 0);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Civic Navigation / Header */}
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
                Portal Transparansi Warga
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to={`/public/${slug}/cek-tagihan`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition border border-emerald-200"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-700" />
              <span>Cek Tagihan Saya</span>
            </Link>
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition border border-slate-200"
              title="Salin tautan untuk dibagikan ke WhatsApp"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-700">Tersalin!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Bagi Link</span>
                </>
              )}
            </button>
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition border border-slate-200"
            >
              <span>Login Pengurus</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 space-y-6">
        {/* Community Info & Verified Civic Badge */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Laporan Resmi Komunitas &bull; Terverifikasi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-emerald-700 inline-block sm:hidden" />
              {summary.komunitas_nama}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>
                Periode Pembukuan: <strong>{summary.periode}</strong>
              </span>
            </p>
          </div>

          <div className="sm:text-right">
            <Link
              to={`/public/${slug}/cek-tagihan`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold shadow-md shadow-emerald-700/20 transition"
            >
              <Receipt className="w-4 h-4" />
              <span>Cek Tagihan Saya &rarr;</span>
            </Link>
          </div>
        </div>

        {/* Hero Card: Forest Emerald Gradient */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 text-white p-6 sm:p-8 shadow-xl shadow-emerald-950/15">
          {/* Subtle civic watermark ornament */}
          <div className="absolute -right-8 -bottom-8 w-48 h-48 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
          <div className="absolute right-4 top-4 hidden sm:block opacity-10">
            <ShieldCheck className="w-32 h-32 text-white" />
          </div>

          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-600/60 pb-4 mb-5">
              <div className="flex items-center gap-2 text-emerald-100 text-xs font-semibold uppercase tracking-wider">
                <Wallet className="w-4 h-4 text-emerald-300" />
                <span>Saldo Kas Komunitas Saat Ini</span>
              </div>
              <div className="inline-flex items-center gap-1.5 bg-emerald-900/60 backdrop-blur-sm text-emerald-200 text-xs px-2.5 py-1 rounded-full border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Pencatatan Terverifikasi & Akuntabel</span>
              </div>
            </div>

            {/* Main Saldo Figure */}
            <div className="mb-6">
              <div className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white font-mono">
                {formatRupiah(summary.saldo_akhir)}
              </div>
              <p className="text-xs sm:text-sm text-emerald-200/90 mt-1">
                Total dana kas bersih yang tercatat dalam pembukuan resmi warga.
              </p>
            </div>

            {/* Monthly In/Out Breakdown Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-4 border-t border-emerald-600/60">
              <div className="bg-emerald-900/40 rounded-2xl p-4 border border-emerald-500/20 backdrop-blur-sm flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-200">
                  <TrendingUp className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <span className="text-xs text-emerald-200 block font-medium">
                    Pemasukan Bulan Ini
                  </span>
                  <span className="text-lg sm:text-xl font-bold text-white font-mono block mt-0.5">
                    +{formatRupiah(summary.total_masuk_bulan_ini)}
                  </span>
                  <span className="text-[11px] text-emerald-300/80 mt-0.5 block">
                    Iuran &amp; donasi warga
                  </span>
                </div>
              </div>

              <div className="bg-emerald-900/40 rounded-2xl p-4 border border-emerald-500/20 backdrop-blur-sm flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-rose-500/20 text-rose-200">
                  <TrendingDown className="w-5 h-5 text-rose-300" />
                </div>
                <div>
                  <span className="text-xs text-emerald-200 block font-medium">
                    Pengeluaran Disetujui
                  </span>
                  <span className="text-lg sm:text-xl font-bold text-white font-mono block mt-0.5">
                    -{formatRupiah(summary.total_keluar_bulan_ini)}
                  </span>
                  <span className="text-[11px] text-emerald-300/80 mt-0.5 block">
                    Operasional &amp; fasilitas
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Monthly Category Breakdown Cards */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <PieChart className="w-5 h-5 text-emerald-700" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Rincian Pengeluaran per Kategori
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Alokasi dana kas yang telah disetujui untuk periode {summary.periode}
              </p>
            </div>
            <div className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 self-start sm:self-auto">
              Total Keluar:{" "}
              <strong className="text-slate-900">
                {formatRupiah(summary.total_keluar_bulan_ini)}
              </strong>
            </div>
          </div>

          {categoryEntries.length === 0 ? (
            <div className="text-center py-10 px-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto mb-2 opacity-80" />
              <p className="text-sm font-semibold text-slate-800">
                Belum Ada Pengeluaran Bulan Ini
              </p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Tidak ada pengeluaran kas yang disetujui pada periode {summary.periode}. Seluruh
                dana warga tetap terjaga utuh.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {categoryEntries.map(([kategori, nominal]) => {
                const percent =
                  totalCategorized > 0 ? Math.round((nominal / totalCategorized) * 100) : 0;
                return (
                  <div
                    key={kategori}
                    className="p-4 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center justify-between text-sm mb-2">
                      <div className="flex items-center gap-2">
                        <span className="capitalize font-semibold text-slate-900">{kategori}</span>
                        <span className="inline-flex items-center text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {percent}%
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">
                        {formatRupiah(nominal)}
                      </span>
                    </div>

                    {/* Clean Progress Bar */}
                    <div className="w-full bg-slate-200/80 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${Math.max(percent, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Verified Expense Transparency Feed & Civic Governance Card */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <h3 className="text-base font-bold text-slate-900">
              Pilar Tata Kelola &amp; Privasi Warga
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-emerald-50/70 border border-emerald-200 text-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-800 font-semibold text-xs uppercase tracking-wide">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Pencatatan Ganda &amp; Persetujuan Ketua</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Setiap rupiah pengeluaran kas dicatat oleh Bendahara dan diverifikasi secara
                independen oleh Ketua RT/RW sebelum dicairkan dan dilaporkan.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 space-y-1.5">
              <div className="flex items-center gap-2 text-slate-800 font-semibold text-xs uppercase tracking-wide">
                <Lock className="w-4 h-4 text-slate-600 shrink-0" />
                <span>Perlindungan Data Pribadi (PDP)</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Untuk menjaga kenyamanan dan privasi warga, nama perorangan dan status tagihan warga
                tidak dipublikasikan ke ranah publik &mdash; hanya ringkasan agregat.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Civic Footer */}
      <footer className="max-w-4xl mx-auto px-4 sm:px-6 mt-12 pt-6 border-t border-slate-200 text-center text-xs text-slate-500">
        <p className="leading-relaxed">
          Dikelola secara transparan menggunakan <strong>kas-transparan</strong> &bull; Platform
          Open-Source Tata Kelola Kas RT/RW.
        </p>
        <p className="mt-1 text-slate-400">Transparansi membangun kepercayaan komunitas warga.</p>
      </footer>
    </div>
  );
}
