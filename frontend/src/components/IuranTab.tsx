import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import {
  Coins,
  PlusCircle,
  Calendar,
  Tag,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  Clock,
} from "lucide-react";
import { api, errorMessage, formatRupiah } from "../api";
import type { IuranType, PeriodType } from "../types";

interface IuranFormState {
  nama: string;
  nominal: string;
  period_type: PeriodType;
}

const EMPTY_FORM: IuranFormState = { nama: "", nominal: "", period_type: "monthly" };

export default function IuranTab(): ReactElement {
  const [iuranTypes, setIuranTypes] = useState<IuranType[]>([]);
  const [form, setForm] = useState<IuranFormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function load(): void {
    setLoading(true);
    api
      .get<IuranType[]>("/api/iuran-types")
      .then((r) => setIuranTypes(r.data))
      .catch(() => setError("Gagal memuat daftar jenis iuran"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    const nominalNumber = Number(form.nominal);
    if (isNaN(nominalNumber) || nominalNumber <= 0) {
      setError("Nominal harus berupa angka valid di atas 0.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/iuran-types", {
        nama: form.nama.trim(),
        nominal: nominalNumber,
        period_type: form.period_type,
      });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal menambah jenis iuran"));
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmDelete(id: string): Promise<void> {
    try {
      await api.delete(`/api/iuran-types/${id}`);
      setDeleteConfirmId(null);
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal menghapus jenis iuran"));
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Description */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2">
          <Coins className="w-5 h-5 text-emerald-700" />
          <h2 className="text-lg font-bold text-slate-900">Jenis Iuran Komunitas</h2>
        </div>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Atur skema iuran rutin warga seperti iuran kebersihan, keamanan, sosial, atau kas bulanan
        </p>
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

      {/* Grid: Create Form + Iuran Cards/Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Column */}
        <div className="lg:col-span-1">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm sticky top-24">
            <div className="flex items-center gap-2 pb-3 mb-4 border-b border-slate-100">
              <PlusCircle className="w-4 h-4 text-emerald-700" />
              <h3 className="font-bold text-slate-900 text-sm">Tambah Iuran Baru</h3>
            </div>

            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Nama Iuran *
                </label>
                <div className="relative">
                  <Tag className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                  <input
                    placeholder="Contoh: Iuran Kebersihan"
                    value={form.nama}
                    onChange={(e) => setForm({ ...form, nama: e.target.value })}
                    required
                    className="w-full pl-9 pr-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Nominal (Rp) *
                </label>
                <div className="relative">
                  <span className="text-xs font-bold text-slate-400 absolute left-3.5 top-2.5 pointer-events-none">
                    Rp
                  </span>
                  <input
                    type="number"
                    min="1"
                    placeholder="50000"
                    value={form.nominal}
                    onChange={(e) => setForm({ ...form, nominal: e.target.value })}
                    required
                    className="w-full pl-10 pr-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Periode Penarikan
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                  <select
                    value={form.period_type}
                    onChange={(e) =>
                      setForm({ ...form, period_type: e.target.value as PeriodType })
                    }
                    className="w-full pl-9 pr-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 bg-white"
                  >
                    <option value="monthly">Bulanan (Setiap Bulan)</option>
                    <option value="one_time">Sekali Bayar (Insidental)</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-white font-medium text-sm bg-emerald-700 hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-sm transition disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <>
                    <PlusCircle className="w-4 h-4" />
                    <span>Simpan Jenis Iuran</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* List / Cards Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">Daftar Iuran Aktif</h3>
              <span className="text-xs text-slate-500">{iuranTypes.length} Skema Terdaftar</span>
            </div>

            {loading ? (
              <div className="py-12 text-center text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                <span>Memuat skema iuran...</span>
              </div>
            ) : iuranTypes.length === 0 ? (
              <div className="py-12 text-center text-slate-500 p-6">
                <Coins className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700">Belum ada jenis iuran</p>
                <p className="text-xs text-slate-400 mt-1">
                  Tambahkan skema iuran pertama Anda pada formulir di samping
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {iuranTypes.map((i) => (
                  <div
                    key={i.id}
                    className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-base">{i.nama}</span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                            i.period_type === "monthly"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-indigo-50 text-indigo-700 border border-indigo-200"
                          }`}
                        >
                          <Clock className="w-3 h-3" />
                          <span>{i.period_type === "monthly" ? "Bulanan" : "Sekali Bayar"}</span>
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Status: Aktif</span>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                      <div className="text-left sm:text-right">
                        <span className="text-[11px] text-slate-400 block font-medium">
                          Nominal Tarif
                        </span>
                        <span className="text-base sm:text-lg font-bold font-mono text-slate-900">
                          {formatRupiah(i.nominal)}
                        </span>
                      </div>

                      {deleteConfirmId === i.id ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => confirmDelete(i.id)}
                            className="min-h-[44px] text-xs px-2.5 py-1.5 rounded-lg font-semibold bg-rose-600 text-white hover:bg-rose-700 shadow-sm"
                          >
                            Hapus?
                          </button>
                          <button
                            onClick={() => setDeleteConfirmId(null)}
                            className="min-h-[44px] text-xs px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100"
                          >
                            Batal
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirmId(i.id)}
                          title="Hapus jenis iuran"
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
