import { useEffect, useState, type ReactElement } from "react";
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
} from "lucide-react";
import { api, errorMessage, formatRupiah } from "../api";
import type { IuranType, PaymentMethod, TagihanWithWarga } from "../types";

function currentPeriode(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type FilterStatus = "semua" | "lunas" | "belum_bayar";

export default function TagihanTab(): ReactElement {
  const [iuranTypes, setIuranTypes] = useState<IuranType[]>([]);
  const [periode, setPeriode] = useState(currentPeriode());
  const [selectedIuran, setSelectedIuran] = useState("");
  const [tagihanList, setTagihanList] = useState<TagihanWithWarga[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("semua");

  // Payment Modal State
  const [payingTagihan, setPayingTagihan] = useState<TagihanWithWarga | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("transfer");
  const [payingLoading, setPayingLoading] = useState(false);

  useEffect(() => {
    api.get<IuranType[]>("/api/iuran-types").then((r) => {
      setIuranTypes(r.data);
      if (r.data.length > 0) setSelectedIuran(r.data[0].id);
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
    if (!payingTagihan) return;
    setPayingLoading(true);
    try {
      await api.post(`/api/tagihan/${payingTagihan.id}/pay`, { payment_method: paymentMethod });
      setPayingTagihan(null);
      loadTagihan();
    } catch (err) {
      setError(errorMessage(err, "Gagal mencatat pembayaran"));
    } finally {
      setPayingLoading(false);
    }
  }

  const filteredTagihan = tagihanList.filter((t) => {
    if (filterStatus === "lunas") return t.status === "lunas";
    if (filterStatus === "belum_bayar") return t.status === "belum_bayar";
    return true;
  });

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
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={periode}
                onChange={(e) => setPeriode(e.target.value)}
                placeholder="YYYY-MM"
                className="pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 w-full sm:w-36 font-mono"
              />
            </div>
          </div>

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
              <span className="text-2xl font-bold text-emerald-700 font-mono">{totalLunas}</span>
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

      {/* Filter Tabs Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
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
        </div>

        <span className="text-xs text-slate-400 pr-2">Periode {periode}</span>
      </div>

      {/* Tagihan Table (desktop/tablet) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
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
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    <span>Memuat tagihan...</span>
                  </td>
                </tr>
              ) : filteredTagihan.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">
                      Tidak ada tagihan untuk kriteria ini
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Klik "Generate Tagihan Bulan Ini" untuk membuat tagihan otomatis ke seluruh
                      warga aktif.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredTagihan.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">{t.warga_nama}</td>
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
                      {t.status === "belum_bayar" ? (
                        <button
                          onClick={() => setPayingTagihan(t)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Tandai Lunas</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 font-medium italic">Tercatat</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tagihan Card List (mobile) */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-10 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
            <span>Memuat tagihan...</span>
          </div>
        ) : filteredTagihan.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-12 text-center text-slate-500">
            <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">Tidak ada tagihan untuk kriteria ini</p>
            <p className="text-xs text-slate-400 mt-1 px-4">
              Klik &quot;Generate Tagihan Bulan Ini&quot; untuk membuat tagihan otomatis ke seluruh
              warga aktif.
            </p>
          </div>
        ) : (
          filteredTagihan.map((t) => (
            <div
              key={t.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900 text-sm truncate">
                    {t.warga_nama}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{t.iuran_nama}</div>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
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

              <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatRupiah(t.nominal)}
                </span>
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
              </div>

              <div className="pt-1 border-t border-slate-100">
                {t.status === "belum_bayar" ? (
                  <button
                    onClick={() => setPayingTagihan(t)}
                    className="w-full min-h-[44px] inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Tandai Lunas</span>
                  </button>
                ) : (
                  <div className="text-center text-xs text-slate-400 font-medium italic py-1">
                    Tercatat
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Payment Confirmation Modal */}
      {payingTagihan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-sm w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-base">Catat Pembayaran Iuran</h3>
              <button
                onClick={() => setPayingTagihan(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="my-4 space-y-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Warga:</span>
                  <span className="font-bold text-slate-900">{payingTagihan.warga_nama}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Iuran:</span>
                  <span className="font-medium text-slate-800">{payingTagihan.iuran_nama}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-500">Jumlah Tagihan:</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {formatRupiah(payingTagihan.nominal)}
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
                onClick={() => setPayingTagihan(null)}
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
                <span>Konfirmasi Lunas</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
