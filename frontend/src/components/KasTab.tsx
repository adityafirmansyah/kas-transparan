import { useEffect, useState, type ChangeEvent, type FormEvent, type ReactElement } from "react";
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
  ImagePlus,
  Receipt,
} from "lucide-react";
import { api, downloadFile, errorMessage, formatRupiah, getSession, uploadReceipt } from "../api";
import type { ApprovalStatus, KasEntry, SaldoResponse } from "../types";
import ReceiptViewer from "./ReceiptViewer";
import Pagination from "./Pagination";

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
  receipt_image_path: string;
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
  receipt_image_path: "",
};

type KasFilter = "semua" | "pemasukan" | "pengeluaran" | "pending";

const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

export default function KasTab(): ReactElement {
  const { role } = getSession();
  const isAdmin = role === "admin";
  const [entries, setEntries] = useState<KasEntry[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [totalMasukBulanIni, setTotalMasukBulanIni] = useState(0);
  const [totalKeluarBulanIni, setTotalKeluarBulanIni] = useState(0);
  const [pemasukanForm, setPemasukanForm] = useState<PemasukanFormState>(EMPTY_PEMASUKAN);
  const [pengeluaranForm, setPengeluaranForm] = useState<PengeluaranFormState>(EMPTY_PENGELUARAN);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingPemasukan, setSavingPemasukan] = useState(false);
  const [savingPengeluaran, setSavingPengeluaran] = useState(false);
  const [filter, setFilter] = useState<KasFilter>("semua");
  const [approvalActionId, setApprovalActionId] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [viewingReceipt, setViewingReceipt] = useState<{ path: string; title: string } | null>(
    null
  );

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
        setTotalMasukBulanIni(saldoResp.data.total_masuk_bulan_ini ?? 0);
        setTotalKeluarBulanIni(saldoResp.data.total_keluar_bulan_ini ?? 0);
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

  async function handleReceiptFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    // Allow re-selecting the same file after a failed upload.
    e.target.value = "";
    if (!file) return;

    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Bukti struk harus berupa file gambar (JPG, PNG, atau WEBP).");
      return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
      setError("Ukuran bukti struk maksimal 5 MB.");
      return;
    }

    setUploadingReceipt(true);
    try {
      const path = await uploadReceipt(file);
      setPengeluaranForm((prev) => ({ ...prev, receipt_image_path: path }));
    } catch (err) {
      setError(errorMessage(err, "Gagal mengunggah bukti struk"));
    } finally {
      setUploadingReceipt(false);
    }
  }

  const filteredEntries = entries.filter((e) => {
    if (filter === "pemasukan") return e.tipe === "pemasukan";
    if (filter === "pengeluaran") return e.tipe === "pengeluaran";
    if (filter === "pending") return e.tipe === "pengeluaran" && e.approval_status === "pending";
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / pageSize));
  const validCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEntries = filteredEntries.slice(
    (validCurrentPage - 1) * pageSize,
    validCurrentPage * pageSize
  );

  const pendingCount = entries.filter(
    (e) => e.tipe === "pengeluaran" && e.approval_status === "pending"
  ).length;

  return (
    <div className="space-y-6">
      {/* Saldo & Current Month Metrics Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Saldo Utama */}
        <div className="bg-gradient-to-r from-emerald-800 to-emerald-950 rounded-2xl p-5 text-white shadow-md flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-emerald-700/50 rounded-xl border border-emerald-500/30 shrink-0">
              <Wallet className="w-6 h-6 text-emerald-200" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase tracking-wider text-emerald-300 font-semibold block truncate">
                {isAdmin ? "Saldo yang Anda Kelola" : "Saldo Kas Riil Saat Ini"}
              </span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-white mt-0.5 truncate">
                {formatRupiah(saldo)}
              </div>
            </div>
          </div>
          {pendingCount > 0 && (
            <div
              className="p-2 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-200 text-xs font-semibold shrink-0"
              title={`${pendingCount} pengeluaran menunggu approval`}
            >
              <Clock className="w-4 h-4 text-amber-300" />
            </div>
          )}
        </div>

        {/* Card 2: Pemasukan Bulan Ini */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl shrink-0">
              <TrendingUp className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block truncate">
                Pemasukan Bulan Ini
              </span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-emerald-700 mt-0.5 truncate">
                +{formatRupiah(totalMasukBulanIni)}
              </div>
            </div>
          </div>
          <span className="text-[11px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 shrink-0">
            Masuk
          </span>
        </div>

        {/* Card 3: Pengeluaran Bulan Ini */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 bg-rose-50 text-rose-700 rounded-xl shrink-0">
              <TrendingDown className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold block truncate">
                Pengeluaran Bulan Ini
              </span>
              <div className="text-xl sm:text-2xl font-extrabold font-mono text-rose-600 mt-0.5 truncate">
                -{formatRupiah(totalKeluarBulanIni)}
              </div>
            </div>
          </div>
          <span className="text-[11px] text-rose-700 font-medium bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 shrink-0">
            Keluar
          </span>
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bukti Struk / Nota
                  <span className="ml-1 font-normal text-slate-400">(opsional, maks 5 MB)</span>
                </label>

                {pengeluaranForm.receipt_image_path ? (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50">
                    <span className="inline-flex items-center gap-2 min-w-0 text-xs font-semibold text-emerald-800">
                      <Receipt className="w-4 h-4 shrink-0" />
                      <span className="truncate">Struk terlampir</span>
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          setViewingReceipt({
                            path: pengeluaranForm.receipt_image_path,
                            title: pengeluaranForm.deskripsi || "Bukti struk",
                          })
                        }
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 transition"
                      >
                        Lihat
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPengeluaranForm({ ...pengeluaranForm, receipt_image_path: "" })
                        }
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-100 transition"
                        aria-label="Hapus lampiran struk"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-xl border border-dashed text-sm font-medium cursor-pointer transition ${
                      uploadingReceipt
                        ? "border-slate-300 bg-slate-50 text-slate-400 cursor-wait"
                        : "border-slate-300 bg-slate-50 text-slate-600 hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50/50"
                    }`}
                  >
                    {uploadingReceipt ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Mengunggah struk...</span>
                      </>
                    ) : (
                      <>
                        <ImagePlus className="w-4 h-4" />
                        <span>Unggah foto nota / struk</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={handleReceiptFile}
                      disabled={uploadingReceipt}
                      className="hidden"
                    />
                  </label>
                )}
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
              onClick={() => {
                setFilter("semua");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "semua" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Semua ({entries.length})
            </button>
            <button
              onClick={() => {
                setFilter("pemasukan");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "pemasukan"
                  ? "bg-emerald-700 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Pemasukan
            </button>
            <button
              onClick={() => {
                setFilter("pengeluaran");
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                filter === "pengeluaran"
                  ? "bg-rose-700 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              Pengeluaran
            </button>
            <button
              onClick={() => {
                setFilter("pending");
                setCurrentPage(1);
              }}
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
            <div className="text-xs text-slate-500 pr-1 hidden sm:block">
              {isAdmin ? "Entri yang Anda kelola" : "Buku Kas Umum (semua PIC)"}
            </div>
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
                  paginatedEntries.map((e) => (
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
                        <div className="flex items-center gap-2">
                          <span>{e.deskripsi}</span>
                          {e.receipt_image_path && (
                            <button
                              onClick={() =>
                                setViewingReceipt({
                                  path: e.receipt_image_path as string,
                                  title: e.deskripsi,
                                })
                              }
                              className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition"
                              title="Lihat bukti struk / nota"
                            >
                              <Receipt className="w-3 h-3" />
                              <span>Nota</span>
                            </button>
                          )}
                        </div>
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

          <Pagination
            currentPage={validCurrentPage}
            totalPages={totalPages}
            totalItems={filteredEntries.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newSize) => {
              setPageSize(newSize);
              setCurrentPage(1);
            }}
            pageSizeOptions={[15, 30, 50, 100]}
            itemLabel="transaksi"
          />
        </div>

        {/* Mobile card list */}
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
              <p className="text-xs text-slate-400 mt-1">
                Catat pemasukan atau pengeluaran kas melalui formulir di atas
              </p>
            </div>
          ) : (
            paginatedEntries.map((e) => (
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
                    {e.receipt_image_path && (
                      <button
                        onClick={() =>
                          setViewingReceipt({
                            path: e.receipt_image_path as string,
                            title: e.deskripsi,
                          })
                        }
                        className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] text-[11px] font-semibold rounded-lg bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-200 transition"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Lihat Nota</span>
                      </button>
                    )}
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

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <Pagination
              currentPage={validCurrentPage}
              totalPages={totalPages}
              totalItems={filteredEntries.length}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setCurrentPage(1);
              }}
              pageSizeOptions={[15, 30, 50, 100]}
              itemLabel="transaksi"
            />
          </div>
        </div>
      </div>

      {viewingReceipt && (
        <ReceiptViewer
          path={viewingReceipt.path}
          title={viewingReceipt.title}
          onClose={() => setViewingReceipt(null)}
        />
      )}
    </div>
  );
}
