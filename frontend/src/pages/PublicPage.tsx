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
  User,
  Layers,
  Filter,
  BookOpen,
  Loader2,
} from "lucide-react";
import { api, errorMessage, formatRupiah } from "../api";
import type { PublicSummary, PublicLedgerPagination } from "../types";
import Pagination from "../components/Pagination";

export default function PublicPage(): ReactElement {
  const { slug, bendahara } = useParams();
  const [summary, setSummary] = useState<PublicSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Public Ledger Feed state
  const [entriesData, setEntriesData] = useState<PublicLedgerPagination | null>(null);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [entryFilter, setEntryFilter] = useState<"semua" | "pemasukan" | "pengeluaran">("semua");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  useEffect(() => {
    setLoading(true);
    setError("");
    const summaryUrl = bendahara
      ? `/api/public/${slug}/${bendahara}/summary`
      : `/api/public/${slug}/summary`;

    api
      .get<PublicSummary>(summaryUrl)
      .then((resp) => setSummary(resp.data))
      .catch((err) => setError(errorMessage(err, "Komunitas atau bendahara tidak ditemukan")))
      .finally(() => setLoading(false));
  }, [slug, bendahara]);

  useEffect(() => {
    setEntriesLoading(true);
    const entriesUrl = bendahara
      ? `/api/public/${slug}/${bendahara}/entries`
      : `/api/public/${slug}/entries`;

    api
      .get<PublicLedgerPagination>(entriesUrl, {
        params: {
          page,
          page_size: pageSize,
          tipe: entryFilter !== "semua" ? entryFilter : undefined,
        },
      })
      .then((resp) => setEntriesData(resp.data))
      .catch(() => {})
      .finally(() => setEntriesLoading(false));
  }, [slug, bendahara, page, pageSize, entryFilter]);

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
          <h2 className="text-lg font-bold text-slate-900">Halaman Tidak Ditemukan</h2>
          <p className="text-sm text-slate-500 mt-1 mb-5">
            {error || "Tautan transparansi tidak valid atau bendahara tidak ditemukan."}
          </p>
          <div className="flex items-center justify-center gap-2">
            {bendahara && (
              <Link
                to={`/public/${slug}`}
                className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Lihat Kas Utama
              </Link>
            )}
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 px-4 py-2 rounded-xl border border-slate-200"
            >
              Ke Halaman Login
            </Link>
          </div>
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
        <div className="max-w-4xl mx-auto px-3 sm:px-6 py-2.5 sm:h-16 sm:py-0 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-emerald-700/20">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <span className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 block leading-tight truncate">
                kas-transparan
              </span>
              <span className="text-[10px] sm:text-[11px] font-medium text-emerald-700 block truncate">
                Portal Transparansi Warga
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <Link
              to={`/public/${slug}/cek-tagihan`}
              title="Cek Tagihan Saya"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 sm:py-1.5 rounded-lg text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 transition border border-emerald-200"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
              <span className="hidden sm:inline">Cek Tagihan Saya</span>
            </Link>
            <button
              onClick={handleShare}
              title="Salin tautan untuk dibagikan ke WhatsApp"
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition border border-slate-200"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span className="hidden sm:inline text-emerald-700">Tersalin!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">Bagi Link</span>
                </>
              )}
            </button>
            <Link
              to="/login"
              title="Login Pengurus"
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition border border-slate-200"
            >
              <Lock className="w-3.5 h-3.5 shrink-0 sm:hidden" />
              <span className="hidden sm:inline">Login Pengurus</span>
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

        {/* Bendahara Selector Tabs / Pills */}
        {summary.available_bendaharas && summary.available_bendaharas.length > 0 && (
          <div className="bg-white p-2 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-1.5 overflow-x-auto">
            <Link
              to={`/public/${slug}`}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                !bendahara
                  ? "bg-emerald-700 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Semua Kas (Gabungan)</span>
            </Link>
            {summary.available_bendaharas.map((b) => {
              const isSelected = bendahara === b.username;
              return (
                <Link
                  key={b.username}
                  to={`/public/${slug}/${b.username}`}
                  className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-emerald-700 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  <User className="w-3.5 h-3.5" />
                  <span>
                    {b.iuran_nama ? `${b.iuran_nama}` : b.nama}
                    <span className="opacity-75 font-normal ml-1">(@{b.username})</span>
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Bendahara Scoped Header Notice */}
        {summary.bendahara_username && (
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm shrink-0">
                <User className="w-5 h-5 text-emerald-700" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                    Kas Dikelola Bendahara
                  </span>
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                    @{summary.bendahara_username}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 mt-0.5">
                  {summary.bendahara_nama}
                  {summary.bendahara_iuran && (
                    <span className="font-medium text-slate-600 text-sm ml-1.5">
                      &bull; PIC {summary.bendahara_iuran}
                    </span>
                  )}
                </h2>
              </div>
            </div>
            <Link
              to={`/public/${slug}`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-white px-3 py-1.5 rounded-xl border border-emerald-200 self-start sm:self-auto transition shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Lihat Kas Gabungan</span>
            </Link>
          </div>
        )}

        {/* Hero Card: Forest Emerald Gradient */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-800 via-emerald-700 to-emerald-900 text-white p-6 sm:p-8 shadow-xl shadow-emerald-950/15">
          <div className="absolute -right-8 -bottom-8 w-48 h-48 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
          <div className="absolute right-4 top-4 hidden sm:block opacity-10">
            <ShieldCheck className="w-32 h-32 text-white" />
          </div>

          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-600/60 pb-4 mb-5">
              <div className="flex items-center gap-2 text-emerald-100 text-xs font-semibold uppercase tracking-wider">
                <Wallet className="w-4 h-4 text-emerald-300" />
                <span>
                  {summary.bendahara_username
                    ? `Saldo Kas ${summary.bendahara_iuran || summary.bendahara_nama} Saat Ini`
                    : "Saldo Kas Komunitas Saat Ini"}
                </span>
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
                {summary.bendahara_username
                  ? `Total dana kas bersih yang dikelola oleh ${summary.bendahara_nama}.`
                  : "Total dana kas bersih yang tercatat dalam pembukuan resmi warga."}
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
                    Iuran &amp; penerimaan terverifikasi
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

        {/* Public Kas Ledger Feed & Detail Transaksi */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-emerald-700" />
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Riwayat Arus Kas Terbuka
                </h2>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                Daftar mutasi kas resmi tanpa menampilkan identitas pribadi warga
              </p>
            </div>

            {/* Filter pills */}
            <div className="flex items-center gap-1.5 self-start sm:self-auto">
              <Filter className="w-4 h-4 text-slate-400 mr-1" />
              <button
                type="button"
                onClick={() => {
                  setEntryFilter("semua");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  entryFilter === "semua"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryFilter("pemasukan");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  entryFilter === "pemasukan"
                    ? "bg-emerald-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Pemasukan
              </button>
              <button
                type="button"
                onClick={() => {
                  setEntryFilter("pengeluaran");
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  entryFilter === "pengeluaran"
                    ? "bg-rose-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Pengeluaran
              </button>
            </div>
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Tipe</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {entriesLoading ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-500">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                      <span>Memuat riwayat transaksi kas...</span>
                    </td>
                  </tr>
                ) : !entriesData || entriesData.items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">
                        Belum ada transaksi kas tercatat
                      </p>
                    </td>
                  </tr>
                ) : (
                  entriesData.items.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3.5 px-4 text-xs font-mono text-slate-600">{e.tanggal}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            e.tipe === "pemasukan"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}
                        >
                          {e.tipe === "pemasukan" ? (
                            <>
                              <TrendingUp className="w-3 h-3" />
                              <span>Masuk</span>
                            </>
                          ) : (
                            <>
                              <TrendingDown className="w-3 h-3" />
                              <span>Keluar</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs font-semibold capitalize text-slate-700">
                        {e.kategori}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-800 font-medium">
                        {e.deskripsi || "-"}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        <span
                          className={e.tipe === "pemasukan" ? "text-emerald-700" : "text-rose-600"}
                        >
                          {e.tipe === "pemasukan" ? "+" : "-"}
                          {formatRupiah(e.nominal)}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="block md:hidden divide-y divide-slate-100 p-3">
            {entriesLoading ? (
              <div className="py-8 text-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                <span className="text-xs">Memuat riwayat transaksi...</span>
              </div>
            ) : !entriesData || entriesData.items.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs">
                Belum ada transaksi kas tercatat
              </div>
            ) : (
              entriesData.items.map((e) => (
                <div key={e.id} className="py-3 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-slate-500">{e.tanggal}</span>
                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                        e.tipe === "pemasukan"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-rose-50 text-rose-700 border border-rose-200"
                      }`}
                    >
                      {e.tipe === "pemasukan" ? "Masuk" : "Keluar"}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-slate-800 font-medium leading-snug">
                      {e.deskripsi || e.kategori}
                    </span>
                    <span
                      className={`font-mono font-bold text-xs shrink-0 ${
                        e.tipe === "pemasukan" ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {e.tipe === "pemasukan" ? "+" : "-"}
                      {formatRupiah(e.nominal)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination */}
          {entriesData && entriesData.total > 0 && (
            <Pagination
              currentPage={page}
              totalPages={entriesData.total_pages}
              totalItems={entriesData.total}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
              pageSizeOptions={[15, 30, 50]}
              itemLabel="transaksi"
            />
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
                tidak dipublikasikan ke ranah publik &mdash; hanya ringkasan agregat dan arus kas
                terbuka.
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
