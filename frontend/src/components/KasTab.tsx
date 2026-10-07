import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import {
  BookOpen,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  Wallet,
  AlertCircle,
  X,
  Loader2,
  Check,
  Filter,
  Download,
  FileSpreadsheet,
} from "lucide-react";
import { api, downloadFile, errorMessage, formatRupiah, getSession } from "../api";
import type { ApprovalStatus, KasEntry, SaldoResponse } from "../types";

interface PemasukanFormState {
  kategori: string;
  deskripsi: string;
  nominal: string;
  tanggal: string;
}

interface PengeluaranFormState {
  kategori: string;
  deskripsi: string;
  nominal: string;
  tanggal: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_PEMASUKAN: PemasukanFormState = {
  kategori: "donasi",
  deskripsi: "",
  nominal: "",
  tanggal: todayISO(),
};
const EMPTY_PENGELUARAN: PengeluaranFormState = {
  kategori: "kebersihan",
  deskripsi: "",
  nominal: "",
  tanggal: todayISO(),
};

type KasFilter = "semua" | "pemasukan" | "pengeluaran" | "pending";

export default function KasTab(): ReactElement {
  const { role } = getSession();
  const isAdmin = role === "admin";
  const [entries, setEntries] = useState<KasEntry[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [pemasukanForm, setPemasukanForm] = useState<PemasukanFormState>(EMPTY_PEMASUKAN);
  const [pengeluaranForm, setPengeluaranForm] = useState<PengeluaranFormState>(EMPTY_PENGELUARAN);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingPemasukan, setSavingPemasukan] = useState(false);
  const [savingPengeluaran, setSavingPengeluaran] = useState(false);
  const [filter, setFilter] = useState<KasFilter>("semua");
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);

  // Export states (Admin only)
  const [exportingKas, setExportingKas] = useState<"csv" | "xlsx" | null>(null);

  async function handleExportKas(format: "csv" | "xlsx"): Promise<void> {
    setExportingKas(format);
    setError("");
    try {
      await downloadFile("/api/reports/export/kas", { format }, `buku-kas.${format}`);
    } catch (err) {
      setError(errorMessage(err, "Gagal mengunduh laporan buku kas"));
    } finally {
      setExportingKas(null);
    }
  }

  function load(): void {
    setLoading(true);
    Promise.all([api.get<KasEntry[]>("/api/kas"), api.get<SaldoResponse>("/api/kas/saldo")])
      .then(([entriesResp, saldoResp]) => {
        setEntries(entriesResp.data);
        setSaldo(saldoResp.data.saldo);
      })
      .catch(() => setError("Gagal memuat catatan kas"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handlePemasukan(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    const nominal = Number(pemasukanForm.nominal);
    if (isNaN(nominal) || nominal <= 0) {
      setError("Nominal pemasukan harus valid di atas 0.");
      return;
    }
    setSavingPemasukan(true);
    try {
      await api.post("/api/kas/pemasukan", {
        ...pemasukanForm,
        nominal,
      });
      setPemasukanForm(EMPTY_PEMASUKAN);
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal mencatat pemasukan"));
    } finally {
      setSavingPemasukan(false);
    }
  }

  async function handlePengeluaran(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    const nominal = Number(pengeluaranForm.nominal);
    if (isNaN(nominal) || nominal <= 0) {
      setError("Nominal pengeluaran harus valid di atas 0.");
      return;
    }
    setSavingPengeluaran(true);
    try {
      await api.post("/api/kas/pengeluaran", {
        ...pengeluaranForm,
        nominal,
      });
      setPengeluaranForm(EMPTY_PENGELUARAN);
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal mencatat pengeluaran"));
    } finally {
      setSavingPengeluaran(false);
    }
  }

  async function handleApproval(id: string, status: ApprovalStatus): Promise<void> {
    setApprovalActionId(id);
    try {
      await api.post(`/api/kas/pengeluaran/${id}/approval`, { status });
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal memproses approval"));
    } finally {
      setApprovalActionId(null);
    }
  }

  const filteredEntries = entries.filter((e) => {
    if (filter === "pemasukan") return e.tipe === "pemasukan";
    if (filter === "pengeluaran") return e.tipe === "pengeluaran";
    if (filter === "pending") return e.tipe === "pengeluaran" && e.approval_status === "pending";
    return true;
  });

  const pendingCount = entries.filter(
    (e) => e.tipe === "pengeluaran" && e.approval_status === "pending"
  ).length;

  return (
    <div className="space-y-6">
      {/* Saldo Hero Strip */}
      <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 rounded-2xl p-5 sm:p-6 text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-700/50 rounded-xl border border-emerald-500/30">
            <Wallet className="w-7 h-7 text-emerald-200" />
          </div>
          <div>
            <span className="text-xs uppercase tracking-wider text-emerald-300 font-semibold block">
              Saldo Kas Riil Saat Ini
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white mt-0.5">
              {formatRupiah(saldo)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-semibold">
              <Clock className="w-4 h-4 text-amber-300" />
              <span>{pendingCount} Pengeluaran Menunggu Approval</span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
          <button onClick={() => setError("")} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Forms Grid: Catat Pemasukan vs Catat Pengeluaran (Admin only) */}
      {role === "admin" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form Pemasukan */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Catat Pemasukan Kas</h3>
                <p className="text-[11px] text-slate-500">
                  Iuran di luar sistem billing, donasi, atau hibah
                </p>
              </div>
            </div>

            <form onSubmit={handlePemasukan} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori</label>
                <input
                  placeholder="Contoh: donasi, sumbangan warga"
                  value={pemasukanForm.kategori}
                  onChange={(e) => setPemasukanForm({ ...pemasukanForm, kategori: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keterangan / Deskripsi *
                </label>
                <input
                  placeholder="Contoh: Donasi perbaikan lampu jalan"
                  value={pemasukanForm.deskripsi}
                  onChange={(e) =>
                    setPemasukanForm({ ...pemasukanForm, deskripsi: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal (Rp) *
                </label>
                <div className="relative">
                  <span className="text-xs font-bold text-slate-400 absolute left-3 top-2.5 pointer-events-none">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="1"
                    placeholder="100000"
                    value={pemasukanForm.nominal}
                    onChange={(e) =>
                      setPemasukanForm({ ...pemasukanForm, nominal: e.target.value })
                    }
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Transaksi *
                </label>
                <input
                  type="date"
                  value={pemasukanForm.tanggal}
                  onChange={(e) => setPemasukanForm({ ...pemasukanForm, tanggal: e.target.value })}
                  required
                  max={todayISO()}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <button
                type="submit"
                disabled={savingPemasukan}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white font-medium text-sm bg-emerald-700 hover:bg-emerald-800 transition shadow-sm disabled:opacity-50"
              >
                {savingPemasukan ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4" />
                    <span>Simpan Pemasukan</span>
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Form Pengeluaran */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <div className="p-2 rounded-xl bg-rose-50 text-rose-700">
                <TrendingDown className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Catat Pengeluaran Kas</h3>
                <p className="text-[11px] text-amber-600 font-medium">
                  * Memerlukan persetujuan Ketua RT/RW sebelum memotong saldo
                </p>
              </div>
            </div>

            <form onSubmit={handlePengeluaran} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori</label>
                <input
                  placeholder="Contoh: kebersihan, perbaikan, konsumsi"
                  value={pengeluaranForm.kategori}
                  onChange={(e) =>
                    setPengeluaranForm({ ...pengeluaranForm, kategori: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Keterangan / Deskripsi *
                </label>
                <input
                  placeholder="Contoh: Beli sapu dan desinfektan pos ronda"
                  value={pengeluaranForm.deskripsi}
                  onChange={(e) =>
                    setPengeluaranForm({ ...pengeluaranForm, deskripsi: e.target.value })
                  }
                  required
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nominal (Rp) *
                </label>
                <div className="relative">
                  <span className="text-xs font-bold text-slate-400 absolute left-3 top-2.5 pointer-events-none">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="1"
                    placeholder="50000"
                    value={pengeluaranForm.nominal}
                    onChange={(e) =>
                      setPengeluaranForm({ ...pengeluaranForm, nominal: e.target.value })
                    }
                    required
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tanggal Transaksi *
                </label>
                <input
                  type="date"
                  value={pengeluaranForm.tanggal}
                  onChange={(e) =>
                    setPengeluaranForm({ ...pengeluaranForm, tanggal: e.target.value })
                  }
                  required
                  max={todayISO()}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <button
                type="submit"
                disabled={savingPengeluaran}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white font-medium text-sm bg-rose-700 hover:bg-rose-800 transition shadow-sm disabled:opacity-50"
              >
                {savingPengeluaran ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="w-4 h-4" />
                    <span>Simpan Pengeluaran</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Ledger Table Section */}
      <div className="space-y-3">
        {/* Filter bar */}
        <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400 ml-2 mr-1" />
            <button
              onClick={() => setFilter("semua")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "semua" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Semua ({entries.length})
            </button>
            <button
              onClick={() => setFilter("pemasukan")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "pemasukan"
                  ? "bg-emerald-700 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Pemasukan
            </button>
            <button
              onClick={() => setFilter("pengeluaran")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "pengeluaran"
                  ? "bg-rose-700 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Pengeluaran
            </button>
            <button
              onClick={() => setFilter("pending")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "pending"
                  ? "bg-amber-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Pending ({pendingCount})
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-500 pr-1 hidden sm:block">Buku Kas Umum</div>
            {isAdmin && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleExportKas("xlsx")}
                  disabled={exportingKas !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition disabled:opacity-50"
                  title="Unduh format Excel (.xlsx)"
                >
                  {exportingKas === "xlsx" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                  <span>Export Excel</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExportKas("csv")}
                  disabled={exportingKas !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition disabled:opacity-50"
                  title="Unduh format CSV (.csv)"
                >
                  {exportingKas === "csv" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                  )}
                  <span>Export CSV</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Table (desktop/tablet) */}
        <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3 px-4">Tanggal</th>
                  <th className="py-3 px-4">Tipe</th>
                  <th className="py-3 px-4">Kategori</th>
                  <th className="py-3 px-4">Keterangan</th>
                  <th className="py-3 px-4 text-right">Nominal</th>
                  <th className="py-3 px-4 text-center">Status Verifikasi</th>
                  {role === "ketua" && <th className="py-3 px-4 text-right">Approval Ketua</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td
                      colSpan={role === "ketua" ? 7 : 6}
                      className="py-10 text-center text-slate-500"
                    >
                      <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                      <span>Memuat buku kas...</span>
                    </td>
                  </tr>
                ) : filteredEntries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={role === "ketua" ? 7 : 6}
                      className="py-12 text-center text-slate-500"
                    >
                      <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-semibold text-slate-700">Belum ada transaksi</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Catat pemasukan atau pengeluaran kas melalui formulir di atas
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((e) => (
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
                        {e.deskripsi}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold">
                        <span
                          className={e.tipe === "pemasukan" ? "text-emerald-700" : "text-rose-600"}
                        >
                          {e.tipe === "pemasukan" ? "+" : "-"}
                          {formatRupiah(e.nominal)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {e.tipe === "pengeluaran" ? (
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                              e.approval_status === "approved"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : e.approval_status === "rejected"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                            }`}
                          >
                            {e.approval_status === "approved" && (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Disetujui</span>
                              </>
                            )}
                            {e.approval_status === "rejected" && (
                              <>
                                <XCircle className="w-3 h-3 text-rose-600" />
                                <span>Ditolak</span>
                              </>
                            )}
                            {e.approval_status === "pending" && (
                              <>
                                <Clock className="w-3 h-3 text-amber-600" />
                                <span>Menunggu</span>
                              </>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                            <ShieldCheck className="w-3 h-3 text-emerald-600" />
                            <span>Pemasukan Sah</span>
                          </span>
                        )}
                      </td>

                      {role === "ketua" && (
                        <td className="py-3.5 px-4 text-right">
                          {e.tipe === "pengeluaran" && e.approval_status === "pending" ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleApproval(e.id, "approved")}
                                disabled={approvalActionId === e.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition disabled:opacity-50"
                              >
                                <Check className="w-3 h-3" />
                                <span>Setujui</span>
                              </button>
                              <button
                                onClick={() => handleApproval(e.id, "rejected")}
                                disabled={approvalActionId === e.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-700 hover:bg-rose-800 text-white shadow-sm transition disabled:opacity-50"
                              >
                                <X className="w-3 h-3" />
                                <span>Tolak</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic font-medium">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card List (mobile) */}
        <div className="block md:hidden space-y-3">
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-10 text-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              <span>Memuat buku kas...</span>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-12 text-center text-slate-500">
              <BookOpen className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="font-semibold text-slate-700">Belum ada transaksi</p>
              <p className="text-xs text-slate-400 mt-1 px-4">
                Catat pemasukan atau pengeluaran kas melalui formulir di atas
              </p>
            </div>
          ) : (
            filteredEntries.map((e) => (
              <div
                key={e.id}
                className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
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
                      <span className="text-[11px] font-mono text-slate-500">{e.tanggal}</span>
                    </div>
                    <div className="text-sm font-semibold text-slate-900 mt-1.5 truncate">
                      {e.deskripsi}
                    </div>
                    <div className="text-xs text-slate-500 capitalize">{e.kategori}</div>
                  </div>
                  <span
                    className={`shrink-0 font-mono font-bold text-sm ${
                      e.tipe === "pemasukan" ? "text-emerald-700" : "text-rose-600"
                    }`}
                  >
                    {e.tipe === "pemasukan" ? "+" : "-"}
                    {formatRupiah(e.nominal)}
                  </span>
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                  {e.tipe === "pengeluaran" ? (
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                        e.approval_status === "approved"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : e.approval_status === "rejected"
                            ? "bg-rose-50 text-rose-700 border border-rose-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                      }`}
                    >
                      {e.approval_status === "approved" && (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span>Disetujui</span>
                        </>
                      )}
                      {e.approval_status === "rejected" && (
                        <>
                          <XCircle className="w-3 h-3 text-rose-600" />
                          <span>Ditolak</span>
                        </>
                      )}
                      {e.approval_status === "pending" && (
                        <>
                          <Clock className="w-3 h-3 text-amber-600" />
                          <span>Menunggu</span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                      <span>Pemasukan Sah</span>
                    </span>
                  )}
                </div>

                {role === "ketua" &&
                  e.tipe === "pengeluaran" &&
                  e.approval_status === "pending" && (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => handleApproval(e.id, "approved")}
                        disabled={approvalActionId === e.id}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Setujui</span>
                      </button>
                      <button
                        onClick={() => handleApproval(e.id, "rejected")}
                        disabled={approvalActionId === e.id}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-1 px-2.5 py-2 text-xs font-semibold rounded-lg bg-rose-700 hover:bg-rose-800 text-white shadow-sm transition disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Tolak</span>
                      </button>
                    </div>
                  )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
