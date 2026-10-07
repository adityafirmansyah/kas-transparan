import { useState, useEffect, type ReactElement, type FormEvent } from "react";
import {
  Receipt,
  Sparkles,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Banknote,
  CreditCard,
  X,
  Loader2,
  Filter,
  Check,
  ChevronLeft,
  ChevronRight,
  Users,
  AlertTriangle,
  FastForward,
} from "lucide-react";
import { api, errorMessage, formatRupiah, getSession } from "../api";
import type {
  FuturePaymentItem,
  IuranType,
  PaymentMethod,
  RecordFuturePaymentResponse,
  TagihanWithWarga,
  TunggakanMulti,
  Warga,
} from "../types";

const INDONESIAN_MONTHS = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

function currentPeriode(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Parses a "YYYY-MM" periode string into numeric year/month (month is 1-12). */
function parsePeriode(periode: string): { year: number; month: number } {
  const [year, month] = periode.split("-").map(Number);
  return { year, month };
}

/** Formats "YYYY-MM" into a human-readable Indonesian label, e.g. "Oktober 2026". */
function formatPeriodeLabel(periode: string): string {
  const { year, month } = parsePeriode(periode);
  const monthName = INDONESIAN_MONTHS[month - 1] ?? periode;
  return `${monthName} ${year}`;
}

/** Shifts a "YYYY-MM" periode by `delta` months, returning a new "YYYY-MM" string. */
function shiftPeriode(periode: string, delta: number): string {
  const { year, month } = parsePeriode(periode);
  const shifted = new Date(year, month - 1 + delta, 1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, "0")}`;
}

interface PayingBatchItem {
  id: string;
  warga_nama: string;
  iuran_nama: string;
  periode: string;
  nominal: number;
}
type FilterStatus = "semua" | "lunas" | "belum_bayar";
type ViewMode = "single" | "multi";

/** A warga along with all of their tagihan in the current filtered view. */
interface WargaTagihanGroup {
  warga_id: string;
  warga_nama: string;
  items: TagihanWithWarga[];
}

/** Groups a flat tagihan list by warga_id, preserving first-seen order. */
function groupTagihanByWarga(list: TagihanWithWarga[]): WargaTagihanGroup[] {
  const groups = new Map<string, WargaTagihanGroup>();
  for (const t of list) {
    const existing = groups.get(t.warga_id);
    if (existing) {
      existing.items.push(t);
    } else {
      groups.set(t.warga_id, { warga_id: t.warga_id, warga_nama: t.warga_nama, items: [t] });
    }
  }
  return Array.from(groups.values());
}

interface TagihanTabProps {
  initialFutureWargaId?: string;
  onClearInitialFutureWargaId?: () => void;
}

export default function TagihanTab({
  initialFutureWargaId,
  onClearInitialFutureWargaId,
}: TagihanTabProps): ReactElement {
  const { role } = getSession();
  const isAdmin = role === "admin";
  const [iuranTypes, setIuranTypes] = useState<IuranType[]>([]);
  const [periode, setPeriode] = useState(currentPeriode());
  const [selectedIuran, setSelectedIuran] = useState("");
  const [tagihanList, setTagihanList] = useState<TagihanWithWarga[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("semua");

  // Payment Modal State (supports single or multi-bill batch payment)
  const [payingItems, setPayingItems] = useState<PayingBatchItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [payingLoading, setPayingLoading] = useState(false);

  // Checkbox selection state for single-period view
  const [selectedTagihanIds, setSelectedTagihanIds] = useState<string[]>([]);

  // Future Payment Modal State
  const [isFutureModalOpen, setIsFutureModalOpen] = useState(false);
  const [wargaList, setWargaList] = useState<Warga[]>([]);
  const [futureWargaId, setFutureWargaId] = useState("");
  const [futureIuranId, setFutureIuranId] = useState("");
  const [futureStartMonth, setFutureStartMonth] = useState(shiftPeriode(currentPeriode(), 1));
  const [futureMonthsCount, setFutureMonthsCount] = useState(2);
  const [futurePaymentMethod, setFuturePaymentMethod] = useState<PaymentMethod>("transfer");
  const [futureSaving, setFutureSaving] = useState(false);

  // View mode: single-period tagihan view vs multi-month arrears (tunggakan) view
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [tunggakanStart, setTunggakanStart] = useState(shiftPeriode(currentPeriode(), -2));
  const [tunggakanEnd, setTunggakanEnd] = useState(currentPeriode());
  const [tunggakanList, setTunggakanList] = useState<TunggakanMulti[]>([]);
  const [tunggakanLoading, setTunggakanLoading] = useState(false);
  const [tunggakanError, setTunggakanError] = useState("");

  useEffect(() => {
    if (initialFutureWargaId) {
      setFutureWargaId(initialFutureWargaId);
      setIsFutureModalOpen(true);
      if (onClearInitialFutureWargaId) onClearInitialFutureWargaId();
    }
  }, [initialFutureWargaId, onClearInitialFutureWargaId]);

  useEffect(() => {
    api.get<IuranType[]>("/api/iuran-types").then((r) => {
      setIuranTypes(r.data);
      if (r.data.length > 0) {
        setSelectedIuran(r.data[0].id);
        setFutureIuranId((prev) => prev || r.data[0].id);
      }
    });
    api.get<Warga[]>("/api/warga").then((r) => {
      const active = r.data.filter((w) => w.aktif);
      setWargaList(active);
      if (active.length > 0) {
        setFutureWargaId((prev) => prev || active[0].id);
      }
    });
  }, []);

  function loadTagihan(): void {
    setLoading(true);
    api
      .get<TagihanWithWarga[]>("/api/tagihan", { params: { periode } })
      .then((r) => setTagihanList(r.data))
      .catch(() => setError("Gagal memuat daftar tagihan"))
      .finally(() => setLoading(false));
  }

  useEffect(loadTagihan, [periode]);

  function loadTunggakanMulti(): void {
    setTunggakanLoading(true);
    setTunggakanError("");
    api
      .get<TunggakanMulti[]>("/api/reports/tunggakan-multi", {
        params: { periode_start: tunggakanStart, periode_end: tunggakanEnd },
      })
      .then((r) => setTunggakanList(r.data))
      .catch((err) =>
        setTunggakanError(errorMessage(err, "Gagal memuat data tunggakan multi-bulan"))
      )
      .finally(() => setTunggakanLoading(false));
  }

  useEffect(() => {
    if (viewMode === "multi") loadTunggakanMulti();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, tunggakanStart, tunggakanEnd]);

  async function handleGenerate(): Promise<void> {
    setError("");
    setMessage("");
    if (!selectedIuran) {
      setError("Pilih jenis iuran terlebih dahulu");
      return;
    }
    setGenerating(true);
    try {
      const resp = await api.post<TagihanWithWarga[]>("/api/tagihan/generate", {
        iuran_type_id: selectedIuran,
        periode,
      });
      setMessage(`${resp.data.length} tagihan baru berhasil diterbitkan untuk periode ${periode}.`);
      loadTagihan();
    } catch (err) {
      setError(errorMessage(err, "Gagal generate tagihan warga"));
    } finally {
      setGenerating(false);
    }
  }

  async function handleConfirmPay(): Promise<void> {
    if (payingItems.length === 0) return;
    setPayingLoading(true);
    try {
      if (payingItems.length === 1) {
        await api.post(`/api/tagihan/${payingItems[0].id}/pay`, { payment_method: paymentMethod });
      } else {
        await api.post("/api/tagihan/batch-pay", {
          tagihan_ids: payingItems.map((p) => p.id),
          payment_method: paymentMethod,
        });
      }
      setPayingItems([]);
      setSelectedTagihanIds([]);
      setMessage(
        `${payingItems.length} tagihan (${formatRupiah(payingItems.reduce((acc, p) => acc + p.nominal, 0))}) berhasil ditandai lunas.`
      );
      loadTagihan();
      if (viewMode === "multi") loadTunggakanMulti();
    } catch (err) {
      setError(errorMessage(err, "Gagal mencatat pembayaran"));
    } finally {
      setPayingLoading(false);
    }
  }

  function openSinglePay(t: TagihanWithWarga): void {
    setPayingItems([
      {
        id: t.id,
        warga_nama: t.warga_nama,
        iuran_nama: t.iuran_nama,
        periode: t.periode,
        nominal: t.nominal,
      },
    ]);
  }

  function openBatchPaySelected(): void {
    const selected = tagihanList.filter(
      (t) => selectedTagihanIds.includes(t.id) && t.status === "belum_bayar"
    );
    if (selected.length === 0) return;
    setPayingItems(
      selected.map((t) => ({
        id: t.id,
        warga_nama: t.warga_nama,
        iuran_nama: t.iuran_nama,
        periode: t.periode,
        nominal: t.nominal,
      }))
    );
  }

  function openFutureModalForWarga(wargaId?: string, iuranTypeId?: string): void {
    if (wargaId) setFutureWargaId(wargaId);
    if (iuranTypeId) setFutureIuranId(iuranTypeId);
    setIsFutureModalOpen(true);
  }

  async function handleConfirmFuturePayment(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!futureWargaId || !futureIuranId || futureMonthsCount <= 0) return;

    setFutureSaving(true);
    setError("");

    try {
      const items: FuturePaymentItem[] = [];
      for (let i = 0; i < futureMonthsCount; i++) {
        items.push({
          periode: shiftPeriode(futureStartMonth, i),
          iuran_type_id: futureIuranId,
        });
      }

      const resp = await api.post<RecordFuturePaymentResponse>("/api/tagihan/future-pay", {
        warga_id: futureWargaId,
        items,
        payment_method: futurePaymentMethod,
      });

      setIsFutureModalOpen(false);
      setMessage(
        `Pembayaran dimuka berhasil dicatat: ${resp.data.total_paid_count} bulan (${formatRupiah(resp.data.total_nominal)}) untuk ${resp.data.warga_nama}.`
      );
      loadTagihan();
      if (viewMode === "multi") loadTunggakanMulti();
    } catch (err) {
      setError(errorMessage(err, "Gagal mencatat pembayaran dimuka"));
    } finally {
      setFutureSaving(false);
    }
  }
  function openPayAllWargaTunggakan(w: TunggakanMulti): void {
    setPayingItems(
      w.unpaid_periods.map((p) => ({
        id: p.tagihan_id,
        warga_nama: w.warga_nama,
        iuran_nama: p.iuran_nama,
        periode: p.periode,
        nominal: p.nominal,
      }))
    );
  }

  function toggleSelectTagihan(id: string): void {
    setSelectedTagihanIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  }

  function toggleSelectAllUnpaid(): void {
    const unpaidIds = filteredTagihan.filter((t) => t.status === "belum_bayar").map((t) => t.id);
    const allSelected =
      unpaidIds.length > 0 && unpaidIds.every((id) => selectedTagihanIds.includes(id));
    if (allSelected) {
      setSelectedTagihanIds((prev) => prev.filter((id) => !unpaidIds.includes(id)));
    } else {
      setSelectedTagihanIds((prev) => Array.from(new Set([...prev, ...unpaidIds])));
    }
  }

  const filteredTagihan = tagihanList.filter((t) => {
    if (filterStatus === "lunas") return t.status === "lunas";
    if (filterStatus === "belum_bayar") return t.status === "belum_bayar";
    return true;
  });

  const groupedTagihan = groupTagihanByWarga(filteredTagihan);

  const totalTagihan = tagihanList.length;
  const totalLunas = tagihanList.filter((t) => t.status === "lunas").length;
  const totalBelum = totalTagihan - totalLunas;
  const nominalTerkumpul = tagihanList
    .filter((t) => t.status === "lunas")
    .reduce((acc, t) => acc + t.nominal, 0);

  return (
    <div className="space-y-6">
      {/* Header & Generator Toolbar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-700" />
              <h2 className="text-lg font-bold text-slate-900">Tagihan &amp; Pembayaran Iuran</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Penerbitan tagihan massal per periode dan pencatatan kas masuk dari warga
            </p>
          </div>
        </div>

        {/* Generate Controls */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Periode
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPeriode((p) => shiftPeriode(p, -1))}
                aria-label="Periode sebelumnya"
                className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50 min-w-[160px] justify-center">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-slate-800 whitespace-nowrap">
                  {formatPeriodeLabel(periode)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPeriode((p) => shiftPeriode(p, 1))}
                aria-label="Periode selanjutnya"
                className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {periode !== currentPeriode() && (
                <button
                  type="button"
                  onClick={() => setPeriode(currentPeriode())}
                  className="px-2.5 py-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl transition whitespace-nowrap"
                >
                  Bulan Ini
                </button>
              )}
            </div>
          </div>

          {isAdmin && (
            <div className="w-full sm:w-auto flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                Jenis Iuran
              </label>
              <select
                value={selectedIuran}
                onChange={(e) => setSelectedIuran(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 bg-white"
              >
                {iuranTypes.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nama} ({formatRupiah(i.nominal)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {isAdmin && (
            <button
              onClick={handleGenerate}
              disabled={generating || iuranTypes.length === 0}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-white font-semibold text-sm bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 shadow-sm transition"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menerbitkan...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate Tagihan Bulan Ini</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* View Mode Toggle: single-period tagihan vs multi-month arrears vs future payment */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-white p-1.5 rounded-xl border border-slate-200/80 shadow-sm inline-flex gap-1 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setViewMode("single")}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition ${
              viewMode === "single"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            Tagihan Bulan Ini
          </button>
          <button
            type="button"
            onClick={() => setViewMode("multi")}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-semibold transition inline-flex items-center justify-center gap-1.5 ${
              viewMode === "multi" ? "bg-rose-700 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Tunggakan Multi-Bulan
          </button>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => openFutureModalForWarga()}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition"
          >
            <FastForward className="w-3.5 h-3.5 text-emerald-400" />
            <span>Bayar Dimuka / Periode Depan</span>
          </button>
        )}
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

      {message && (
        <div className="flex items-start gap-2.5 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{message}</div>
          <button
            onClick={() => setMessage("")}
            className="text-emerald-600 hover:text-emerald-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {viewMode === "single" && (
        <>
          {/* Summary KPI Cards for Tagihan */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">
                Total Tagihan Periode Ini
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-900 font-mono">{totalTagihan}</span>
                <span className="text-xs text-slate-400">lembar</span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">Iuran Lunas Terbayar</span>
              <div className="flex items-baseline justify-between mt-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold text-emerald-700 font-mono">
                    {totalLunas}
                  </span>
                  <span className="text-xs text-emerald-600 font-medium">
                    ({totalTagihan > 0 ? Math.round((totalLunas / totalTagihan) * 100) : 0}%)
                  </span>
                </div>
                <span className="text-xs font-bold text-emerald-800 font-mono">
                  {formatRupiah(nominalTerkumpul)}
                </span>
              </div>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
              <span className="text-xs font-medium text-slate-500 block">
                Belum Melakukan Pembayaran
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-rose-600 font-mono">{totalBelum}</span>
                <span className="text-xs text-rose-500 font-medium">warga</span>
              </div>
            </div>
          </div>

          {/* Filter Tabs Bar & Batch Pay Bar */}
          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Filter className="w-4 h-4 text-slate-400 ml-2 mr-1" />
              <button
                onClick={() => setFilterStatus("semua")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filterStatus === "semua"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Semua ({totalTagihan})
              </button>
              <button
                onClick={() => setFilterStatus("lunas")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filterStatus === "lunas"
                    ? "bg-emerald-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Lunas ({totalLunas})
              </button>
              <button
                onClick={() => setFilterStatus("belum_bayar")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  filterStatus === "belum_bayar"
                    ? "bg-rose-700 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                Belum Bayar ({totalBelum})
              </button>

              {isAdmin && totalBelum > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAllUnpaid}
                  className="text-xs px-2.5 py-1 text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition ml-2 font-medium"
                >
                  {selectedTagihanIds.length > 0 ? "Batal Pilih" : "Pilih Semua Belum Bayar"}
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {isAdmin && selectedTagihanIds.length > 0 && (
                <button
                  type="button"
                  onClick={openBatchPaySelected}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-sm transition animate-in fade-in"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>
                    Bayar Terpilih ({selectedTagihanIds.length} Tagihan &bull;{" "}
                    {formatRupiah(
                      tagihanList
                        .filter((t) => selectedTagihanIds.includes(t.id))
                        .reduce((acc, t) => acc + t.nominal, 0)
                    )}
                    )
                  </span>
                </button>
              )}
              <span className="text-xs text-slate-400 pr-2">
                Periode {formatPeriodeLabel(periode)}
              </span>
            </div>
          </div>

          {/* Tagihan Table (desktop/tablet) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    <th className="py-3 px-3 w-10 text-center">
                      {isAdmin ? (
                        <input
                          type="checkbox"
                          checked={
                            filteredTagihan.filter((t) => t.status === "belum_bayar").length > 0 &&
                            filteredTagihan
                              .filter((t) => t.status === "belum_bayar")
                              .every((t) => selectedTagihanIds.includes(t.id))
                          }
                          onChange={toggleSelectAllUnpaid}
                          className="rounded text-emerald-600 focus:ring-emerald-500"
                          title="Pilih semua tagihan belum bayar"
                        />
                      ) : (
                        <span className="text-slate-300">#</span>
                      )}
                    </th>
                    <th className="py-3 px-4">Nama Warga</th>
                    <th className="py-3 px-4">Jenis Iuran</th>
                    <th className="py-3 px-4">Nominal</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Metode Bayar</th>
                    <th className="py-3 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                        <span>Memuat tagihan...</span>
                      </td>
                    </tr>
                  ) : filteredTagihan.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="font-semibold text-slate-700">
                          Tidak ada tagihan untuk kriteria ini
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          Klik &quot;Generate Tagihan Bulan Ini&quot; untuk membuat tagihan otomatis
                          ke seluruh warga aktif.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    groupedTagihan.map((group) =>
                      group.items.map((t, idx) => (
                        <tr
                          key={t.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            group.items.length > 1 ? "bg-emerald-50/30" : ""
                          }`}
                        >
                          <td className="py-3.5 px-3 text-center">
                            {isAdmin && t.status === "belum_bayar" ? (
                              <input
                                type="checkbox"
                                checked={selectedTagihanIds.includes(t.id)}
                                onChange={() => toggleSelectTagihan(t.id)}
                                className="rounded text-emerald-600 focus:ring-emerald-500"
                              />
                            ) : t.status === "lunas" ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                            ) : null}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            <div className="flex items-center gap-2">
                              <span>{t.warga_nama}</span>
                              {idx === 0 && group.items.length > 1 && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                                  <Users className="w-3 h-3" />
                                  {group.items.length} tagihan
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 text-xs font-medium">
                            {t.iuran_nama}
                          </td>
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            {formatRupiah(t.nominal)}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                                t.status === "lunas"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}
                            >
                              {t.status === "lunas" ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Lunas</span>
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  <span>Belum Bayar</span>
                                </>
                              )}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 text-xs">
                            {t.payment_method ? (
                              <span className="inline-flex items-center gap-1 capitalize font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                                {t.payment_method === "transfer" ? (
                                  <CreditCard className="w-3 h-3 text-slate-500" />
                                ) : (
                                  <Banknote className="w-3 h-3 text-slate-500" />
                                )}
                                {t.payment_method}
                              </span>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {isAdmin ? (
                              t.status === "belum_bayar" ? (
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    onClick={() => openSinglePay(t)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Tandai Lunas</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openFutureModalForWarga(t.warga_id, t.iuran_type_id)
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                                    title="Bayar periode mendatang sekaligus untuk warga ini"
                                  >
                                    <FastForward className="w-3 h-3 text-emerald-700" />
                                    <span>Dimuka</span>
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-1.5">
                                  <span className="text-xs text-slate-400 font-medium italic mr-1">
                                    Tercatat
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openFutureModalForWarga(t.warga_id, t.iuran_type_id)
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition"
                                    title="Bayar periode mendatang untuk warga ini"
                                  >
                                    <FastForward className="w-3 h-3 text-emerald-600" />
                                    <span>Bulan Depan</span>
                                  </button>
                                </div>
                              )
                            ) : (
                              <span className="text-xs text-slate-400 font-medium italic">
                                {t.status === "lunas" ? "Lunas" : "Belum bayar"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Tagihan Cards (mobile) — grouped per warga: one card, multiple iuran line-items */}
          <div className="md:hidden space-y-3">
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-10 text-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                <span>Memuat tagihan...</span>
              </div>
            ) : groupedTagihan.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-12 text-center text-slate-500">
                <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">Tidak ada tagihan untuk kriteria ini</p>
                <p className="text-xs text-slate-400 mt-1 px-6">
                  Klik "Generate Tagihan Bulan Ini" untuk membuat tagihan otomatis ke seluruh warga
                  aktif.
                </p>
              </div>
            ) : (
              groupedTagihan.map((group) => (
                <div
                  key={group.warga_id}
                  className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 border-b border-slate-200">
                    <span className="font-semibold text-slate-900 text-sm">{group.warga_nama}</span>
                    {group.items.length > 1 && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                        <Users className="w-3 h-3" />
                        {group.items.length} tagihan
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((t) => (
                      <div key={t.id} className="p-4 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-600 truncate">
                            {t.iuran_nama}
                          </p>
                          <p className="font-mono font-bold text-slate-900 text-sm mt-0.5">
                            {formatRupiah(t.nominal)}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full mt-1.5 ${
                              t.status === "lunas"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {t.status === "lunas" ? (
                              <>
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                <span>Lunas</span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                <span>Belum Bayar</span>
                              </>
                            )}
                          </span>
                        </div>
                        {isAdmin && (
                          <div className="shrink-0 flex items-center gap-2">
                            {t.status === "belum_bayar" && (
                              <input
                                type="checkbox"
                                checked={selectedTagihanIds.includes(t.id)}
                                onChange={() => toggleSelectTagihan(t.id)}
                                className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                              />
                            )}
                            {t.status === "belum_bayar" ? (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => openSinglePay(t)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Lunas</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openFutureModalForWarga(t.warga_id, t.iuran_type_id)
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                                  title="Bayar periode mendatang"
                                >
                                  <FastForward className="w-3 h-3 text-emerald-700" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-slate-400 font-medium italic">
                                  Tercatat
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openFutureModalForWarga(t.warga_id, t.iuran_type_id)
                                  }
                                  className="inline-flex items-center gap-0.5 px-2 py-1 text-[11px] font-medium rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 transition"
                                  title="Bayar periode mendatang"
                                >
                                  <FastForward className="w-3 h-3 text-emerald-600" />
                                  <span>Depan</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}

      {viewMode === "multi" && (
        <TunggakanMultiSection
          start={tunggakanStart}
          end={tunggakanEnd}
          onStartChange={setTunggakanStart}
          onEndChange={setTunggakanEnd}
          data={tunggakanList}
          loading={tunggakanLoading}
          error={tunggakanError}
          onDismissError={() => setTunggakanError("")}
          onPayWarga={openPayAllWargaTunggakan}
          onOpenFuturePay={openFutureModalForWarga}
          isAdmin={isAdmin}
        />
      )}

      {/* Payment Confirmation Modal (Single or Multi/Batch) */}
      {payingItems.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">
                {payingItems.length > 1
                  ? "Konfirmasi Pembayaran Kolektif"
                  : "Catat Pembayaran Iuran"}
              </h3>
              <button
                onClick={() => setPayingItems([])}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-4 space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                {payingItems.length === 1 ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Warga:</span>
                      <span className="font-bold text-slate-900">{payingItems[0].warga_nama}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Iuran &amp; Periode:</span>
                      <span className="font-medium text-slate-800">
                        {payingItems[0].iuran_nama} ({formatPeriodeLabel(payingItems[0].periode)})
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between items-center pb-1 border-b border-slate-200">
                      <span className="text-slate-500">Warga:</span>
                      <span className="font-bold text-slate-900">
                        {Array.from(new Set(payingItems.map((p) => p.warga_nama))).join(", ")}
                      </span>
                    </div>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {payingItems.map((item, idx) => (
                        <div key={`${item.id}-${idx}`} className="flex justify-between text-[11px]">
                          <span className="text-slate-600 truncate mr-2">
                            {item.warga_nama} &bull; {item.iuran_nama} (
                            {formatPeriodeLabel(item.periode)})
                          </span>
                          <span className="font-mono font-semibold text-slate-800 shrink-0">
                            {formatRupiah(item.nominal)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex justify-between pt-2 border-t border-slate-200">
                  <span className="text-slate-700 font-semibold">
                    Total Bayar ({payingItems.length} Tagihan):
                  </span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {formatRupiah(payingItems.reduce((acc, p) => acc + p.nominal, 0))}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Metode Pembayaran
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("transfer")}
                    className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1.5 transition ${
                      paymentMethod === "transfer"
                        ? "border-emerald-600 bg-emerald-50/80 text-emerald-900 font-bold ring-2 ring-emerald-500/20"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                    }`}
                  >
                    <CreditCard className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs">Transfer Bank</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod("tunai")}
                    className={`p-3 rounded-xl border text-center flex flex-col items-center gap-1.5 transition ${
                      paymentMethod === "tunai"
                        ? "border-emerald-600 bg-emerald-50/80 text-emerald-900 font-bold ring-2 ring-emerald-500/20"
                        : "border-slate-200 hover:bg-slate-50 text-slate-700 font-medium"
                    }`}
                  >
                    <Banknote className="w-4 h-4 text-emerald-700" />
                    <span className="text-xs">Tunai / Cash</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPayingItems([])}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmPay}
                disabled={payingLoading}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
              >
                {payingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Konfirmasi Lunas ({payingItems.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Future / Advance Payment Modal */}
      {isFutureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
                  <FastForward className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    Bayar Dimuka / Periode Depan
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Catat tagihan lunas di muka khusus untuk warga ini
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFutureModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmFuturePayment} className="my-4 space-y-4">
              {/* Select Warga */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Pilih Warga
                </label>
                <select
                  value={futureWargaId}
                  onChange={(e) => setFutureWargaId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                >
                  {wargaList.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.nama} {w.no_rumah ? `(No. ${w.no_rumah})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Select Iuran Type */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                  Jenis Iuran
                </label>
                <select
                  value={futureIuranId}
                  onChange={(e) => setFutureIuranId(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                >
                  {iuranTypes.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.nama} &bull; {formatRupiah(it.nominal)}/bln
                    </option>
                  ))}
                </select>
              </div>

              {/* Range: Mulai Periode & Berapa Bulan */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Mulai Periode
                  </label>
                  <input
                    type="month"
                    value={futureStartMonth}
                    onChange={(e) => setFutureStartMonth(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
                    Jumlah Bulan
                  </label>
                  <select
                    value={futureMonthsCount}
                    onChange={(e) => setFutureMonthsCount(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  >
                    {[1, 2, 3, 4, 5, 6, 9, 12].map((n) => (
                      <option key={n} value={n}>
                        {n} Bulan ke Depan
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Summary of affected months */}
              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between items-center text-slate-600">
                  <span>Rincian Periode:</span>
                  <span className="font-semibold text-slate-900">
                    {Array.from({ length: futureMonthsCount }, (_, i) =>
                      shiftPeriode(futureStartMonth, i)
                    ).join(", ")}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t border-emerald-200/60">
                  <span className="font-semibold text-slate-700">Total Nominal Masuk Kas:</span>
                  <span className="font-mono font-bold text-emerald-800 text-sm">
                    {formatRupiah(
                      (iuranTypes.find((it) => it.id === futureIuranId)?.nominal || 0) *
                        futureMonthsCount
                    )}
                  </span>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-2">
                  Metode Penerimaan Uang
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setFuturePaymentMethod("transfer")}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition ${
                      futurePaymentMethod === "transfer"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Transfer Bank</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFuturePaymentMethod("tunai")}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition ${
                      futurePaymentMethod === "tunai"
                        ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <Banknote className="w-4 h-4" />
                    <span>Tunai / Cash</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFutureModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={futureSaving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {futureSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Simpan Pembayaran Dimuka</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

interface TunggakanMultiSectionProps {
  start: string;
  end: string;
  onStartChange: (periode: string) => void;
  onEndChange: (periode: string) => void;
  data: TunggakanMulti[];
  loading: boolean;
  error: string;
  onDismissError: () => void;
  onPayWarga: (w: TunggakanMulti) => void;
  onOpenFuturePay: (wargaId: string) => void;
  isAdmin?: boolean;
}

/**
 * Multi-month arrears ("tunggakan multi-bulan") view: lets the admin pick a
 * configurable periode range and lists every warga with at least one unpaid
 * tagihan anywhere in that range, worst offenders (most unpaid periods, then
 * highest nominal owed) sorted first — matching the backend's sort order.
 */
function TunggakanMultiSection({
  start,
  end,
  onStartChange,
  onEndChange,
  data,
  loading,
  error,
  onDismissError,
  onPayWarga,
  onOpenFuturePay,
  isAdmin = true,
}: TunggakanMultiSectionProps): ReactElement {
  const totalWargaNunggak = data.length;
  const totalNominalTunggakan = data.reduce((acc, d) => acc + d.total_nominal, 0);

  return (
    <div className="space-y-6">
      {/* Range Picker */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-rose-700" />
          <h3 className="text-base font-bold text-slate-900">Cek Tunggakan Multi-Bulan</h3>
        </div>
        <p className="text-xs sm:text-sm text-slate-500">
          Pilih rentang periode untuk melihat warga yang menunggak di lebih dari satu bulan.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Dari Periode
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onStartChange(shiftPeriode(start, -1))}
                aria-label="Periode awal sebelumnya"
                className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50 min-w-[150px] justify-center">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-slate-800 whitespace-nowrap">
                  {formatPeriodeLabel(start)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onStartChange(shiftPeriode(start, 1))}
                aria-label="Periode awal selanjutnya"
                className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="w-full sm:w-auto">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
              Sampai Periode
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onEndChange(shiftPeriode(end, -1))}
                aria-label="Periode akhir sebelumnya"
                className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-xl border border-slate-300 bg-slate-50 min-w-[150px] justify-center">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="font-semibold text-slate-800 whitespace-nowrap">
                  {formatPeriodeLabel(end)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onEndChange(shiftPeriode(end, 1))}
                aria-label="Periode akhir selanjutnya"
                className="p-2 rounded-xl border border-slate-300 text-slate-600 hover:bg-slate-50 hover:border-slate-400 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{error}</div>
          <button onClick={onDismissError} className="text-rose-600 hover:text-rose-800">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-medium text-slate-500 block">Warga Menunggak</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-rose-600 font-mono">{totalWargaNunggak}</span>
            <span className="text-xs text-slate-400">warga</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <span className="text-xs font-medium text-slate-500 block">Total Nominal Tunggakan</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-bold text-rose-600 font-mono">
              {formatRupiah(totalNominalTunggakan)}
            </span>
          </div>
        </div>
      </div>

      {/* Desktop/tablet table */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Nama Warga</th>
                <th className="py-3 px-4 text-center">Bulan Nunggak</th>
                <th className="py-3 px-4">Rincian Periode</th>
                <th className="py-3 px-4 text-right">Total Tunggakan</th>
                {isAdmin && <th className="py-3 px-4 text-right">Aksi</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="py-10 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    <span>Memuat data tunggakan...</span>
                  </td>
                </tr>
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 5 : 4} className="py-12 text-center text-slate-500">
                    <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700 px-6">
                      Tidak ada warga yang menunggak pada rentang periode ini
                    </p>
                  </td>
                </tr>
              ) : (
                data.map((w) => (
                  <tr key={w.warga_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">{w.warga_nama}</td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="inline-flex flex-col items-center gap-0.5">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                          <AlertTriangle className="w-3 h-3" />
                          Nunggak {w.distinct_months_count} Bulan
                        </span>
                        {w.total_unpaid_count !== w.distinct_months_count && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            ({w.total_unpaid_count} tagihan)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      <div className="flex flex-wrap gap-1.5">
                        {w.unpaid_periods.map((p, idx) => (
                          <span
                            key={`${p.periode}-${p.iuran_nama}-${idx}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium border border-slate-200/60"
                            title={formatRupiah(p.nominal)}
                          >
                            <span>{formatPeriodeLabel(p.periode)}</span>
                            <span className="text-slate-400">&bull;</span>
                            <span className="text-slate-600 font-normal">{p.iuran_nama}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-700">
                      {formatRupiah(w.total_nominal)}
                    </td>
                    {isAdmin && (
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onPayWarga(w)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Bayar Semua ({w.total_unpaid_count})</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenFuturePay(w.warga_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                            title="Bayar periode mendatang untuk warga ini"
                          >
                            <FastForward className="w-3 h-3 text-emerald-700" />
                            <span>Dimuka</span>
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-10 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
            <span>Memuat data tunggakan...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-12 text-center text-slate-500">
            <CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700 px-6">
              Tidak ada warga yang menunggak pada rentang periode ini
            </p>
          </div>
        ) : (
          data.map((w) => (
            <div
              key={w.warga_id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 bg-slate-50/80 border-b border-slate-200">
                <span className="font-semibold text-slate-900 text-sm">{w.warga_nama}</span>
                <div className="flex items-center gap-1.5">
                  {w.total_unpaid_count !== w.distinct_months_count && (
                    <span className="text-[10px] text-slate-500 font-medium">
                      {w.total_unpaid_count} tagihan
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                    <AlertTriangle className="w-3 h-3" />
                    Nunggak {w.distinct_months_count} Bulan
                  </span>
                </div>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {w.unpaid_periods.map((p, idx) => (
                    <span
                      key={`${p.periode}-${p.iuran_nama}-${idx}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200/60"
                      title={formatRupiah(p.nominal)}
                    >
                      <span>{formatPeriodeLabel(p.periode)}</span>
                      <span className="text-slate-400">&bull;</span>
                      <span className="text-slate-600 font-normal">{p.iuran_nama}</span>
                    </span>
                  ))}
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-100">
                  <span className="text-xs text-slate-500">Total Tunggakan</span>
                  <span className="font-mono font-bold text-rose-700 text-sm">
                    {formatRupiah(w.total_nominal)}
                  </span>
                </div>
                {isAdmin && (
                  <div className="pt-2 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => onPayWarga(w)}
                      className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        Bayar Semua ({w.total_unpaid_count} Tagihan &bull;{" "}
                        {formatRupiah(w.total_nominal)})
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenFuturePay(w.warga_id)}
                      className="w-full min-h-[38px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                    >
                      <FastForward className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Bayar Periode Depan Sekaligus</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
