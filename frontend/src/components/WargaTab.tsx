import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import {
  Users,
  UserPlus,
  Search,
  Phone,
  Home,
  MapPin,
  Trash2,
  AlertCircle,
  CheckCircle2,
  XCircle,
  X,
  Loader2,
  FastForward,
} from "lucide-react";
import { api, errorMessage } from "../api";
import type { Warga, WargaCreate } from "../types";

interface WargaFormState {
  nama: string;
  no_hp: string;
  alamat: string;
  no_rumah: string;
}

const EMPTY_FORM: WargaFormState = { nama: "", no_hp: "", alamat: "", no_rumah: "" };

interface WargaTabProps {
  onNavigateToTagihanFuture?: (wargaId: string) => void;
}

export default function WargaTab({ onNavigateToTagihanFuture }: WargaTabProps): ReactElement {
  const [warga, setWarga] = useState<Warga[]>([]);
  const [form, setForm] = useState<WargaFormState>(EMPTY_FORM);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  function load(): void {
    setLoading(true);
    api
      .get<Warga[]>("/api/warga")
      .then((r) => setWarga(r.data))
      .catch(() => setError("Gagal memuat data warga"))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function handleAdd(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const payload: WargaCreate = {
        nama: form.nama.trim(),
        no_hp: form.no_hp.trim() || undefined,
        alamat: form.alamat.trim() || undefined,
        no_rumah: form.no_rumah.trim() || undefined,
        aktif: true,
      };
      await api.post("/api/warga", payload);
      setForm(EMPTY_FORM);
      setIsModalOpen(false);
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal menambah data warga"));
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleAktif(w: Warga): Promise<void> {
    try {
      await api.put(`/api/warga/${w.id}`, { aktif: !w.aktif });
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal mengubah status warga"));
    }
  }

  async function confirmDelete(id: string): Promise<void> {
    try {
      await api.delete(`/api/warga/${id}`);
      setDeleteConfirmId(null);
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal menghapus warga"));
    }
  }

  const filteredWarga = warga.filter((w) => {
    const q = search.toLowerCase();
    return (
      w.nama.toLowerCase().includes(q) ||
      (w.no_rumah && w.no_rumah.toLowerCase().includes(q)) ||
      (w.no_hp && w.no_hp.toLowerCase().includes(q)) ||
      (w.alamat && w.alamat.toLowerCase().includes(q))
    );
  });

  const totalAktif = warga.filter((w) => w.aktif).length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-700" />
            <h2 className="text-lg font-bold text-slate-900">Data Warga Komunitas</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kelola daftar kepala keluarga dan warga terdaftar untuk penerbitan tagihan kas
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="font-semibold text-slate-700">Total: {warga.length} Warga</span>
            <span className="text-slate-300">&bull;</span>
            <span className="text-emerald-700 font-semibold">{totalAktif} Aktif</span>
            <span className="text-slate-300">&bull;</span>
            <span className="text-slate-500 font-medium">{warga.length - totalAktif} Nonaktif</span>
          </div>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold shadow-sm transition self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Tambah Warga Baru</span>
        </button>
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

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari nama, no. rumah, atau HP..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
          />
        </div>
        <div className="text-xs text-slate-500 self-end sm:self-center">
          Menampilkan {filteredWarga.length} dari {warga.length} warga
        </div>
      </div>

      {/* Table Section (desktop/tablet) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-4">Nama Lengkap</th>
                <th className="py-3 px-4">No. Rumah</th>
                <th className="py-3 px-4">No. Telepon / HP</th>
                <th className="py-3 px-4">Alamat</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    <span>Memuat daftar warga...</span>
                  </td>
                </tr>
              ) : filteredWarga.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-700">Tidak ada data warga ditemukan</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {search
                        ? "Coba ubah kata kunci pencarian Anda"
                        : "Mulai dengan menambahkan warga pertama"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredWarga.map((w) => (
                  <tr key={w.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-xs font-bold shrink-0">
                          {w.nama.charAt(0).toUpperCase()}
                        </div>
                        <span>{w.nama}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {w.no_rumah ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                          <Home className="w-3 h-3 text-slate-400" />
                          {w.no_rumah}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      {w.no_hp ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {w.no_hp}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs max-w-xs truncate">
                      {w.alamat ? (
                        <span className="inline-flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          {w.alamat}
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                          w.aktif
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {w.aktif ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Aktif</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-slate-400" />
                            <span>Nonaktif</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onNavigateToTagihanFuture && w.aktif && (
                          <button
                            type="button"
                            onClick={() => onNavigateToTagihanFuture(w.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition"
                            title="Catat bayar dimuka untuk warga ini"
                          >
                            <FastForward className="w-3 h-3 text-emerald-600" />
                            <span>Bayar Dimuka</span>
                          </button>
                        )}
                        <button
                          onClick={() => toggleAktif(w)}
                          title={w.aktif ? "Nonaktifkan warga" : "Aktifkan warga"}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium border transition ${
                            w.aktif
                              ? "text-slate-700 border-slate-200 hover:bg-slate-100"
                              : "text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                          }`}
                        >
                          {w.aktif ? "Nonaktifkan" : "Aktifkan"}
                        </button>

                        {deleteConfirmId === w.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => confirmDelete(w.id)}
                              className="text-xs px-2 py-1 rounded-lg font-semibold bg-rose-600 text-white hover:bg-rose-700"
                            >
                              Yakin?
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-slate-100"
                            >
                              Batal
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(w.id)}
                            title="Hapus warga"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Card List Section (mobile) */}
      <div className="block md:hidden space-y-3">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-10 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
            <span>Memuat daftar warga...</span>
          </div>
        ) : filteredWarga.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm py-12 text-center text-slate-500">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-semibold text-slate-700">Tidak ada data warga ditemukan</p>
            <p className="text-xs text-slate-400 mt-1">
              {search
                ? "Coba ubah kata kunci pencarian Anda"
                : "Mulai dengan menambahkan warga pertama"}
            </p>
          </div>
        ) : (
          filteredWarga.map((w) => (
            <div
              key={w.id}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-sm font-bold shrink-0">
                    {w.nama.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 text-sm truncate">{w.nama}</div>
                    {w.no_rumah && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 mt-0.5">
                        <Home className="w-3 h-3 text-slate-400" />
                        {w.no_rumah}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                    w.aktif
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  {w.aktif ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>Aktif</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 text-slate-400" />
                      <span>Nonaktif</span>
                    </>
                  )}
                </span>
              </div>

              <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{w.no_hp || "-"}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{w.alamat || "-"}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                {onNavigateToTagihanFuture && w.aktif && (
                  <button
                    type="button"
                    onClick={() => onNavigateToTagihanFuture(w.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition"
                  >
                    <FastForward className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Bayar Dimuka</span>
                  </button>
                )}
                <button
                  onClick={() => toggleAktif(w)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium border transition ${
                    w.aktif
                      ? "text-slate-700 border-slate-200 hover:bg-slate-100"
                      : "text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                  }`}
                >
                  {w.aktif ? "Nonaktifkan" : "Aktifkan"}
                </button>

                {deleteConfirmId === w.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => confirmDelete(w.id)}
                      className="min-h-[44px] text-xs px-3 py-2 rounded-lg font-semibold bg-rose-600 text-white hover:bg-rose-700"
                    >
                      Yakin?
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(null)}
                      className="min-h-[44px] text-xs px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100"
                    >
                      Batal
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmId(w.id)}
                    title="Hapus warga"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition border border-slate-200"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Warga Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Tambah Warga Baru</h3>
                  <p className="text-xs text-slate-500">Daftarkan kepala keluarga atau warga</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-4 mt-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Nama Lengkap *
                </label>
                <input
                  required
                  placeholder="Contoh: Budi Santoso"
                  value={form.nama}
                  onChange={(e) => setForm({ ...form, nama: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    No. Rumah
                  </label>
                  <input
                    placeholder="Contoh: A-12"
                    value={form.no_rumah}
                    onChange={(e) => setForm({ ...form, no_rumah: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    No. Telepon / HP
                  </label>
                  <input
                    placeholder="0812xxxxxxx"
                    value={form.no_hp}
                    onChange={(e) => setForm({ ...form, no_hp: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Alamat Lengkap
                </label>
                <input
                  placeholder="Contoh: Jl. Mawar No. 12, RT 01"
                  value={form.alamat}
                  onChange={(e) => setForm({ ...form, alamat: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Simpan Warga</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
