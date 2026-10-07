import { useCallback, useEffect, useState, type FormEvent, type ReactElement } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Globe,
  Copy,
  Check,
  ExternalLink,
  Users,
  UserPlus,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  X,
  KeyRound,
  Info,
} from "lucide-react";
import { api, errorMessage, getSession } from "../api";
import type { Komunitas, KomunitasUpdate, KomunitasUser, Role, UserCreate } from "../types";

interface SettingsTabProps {
  komunitas: Komunitas | null;
  onKomunitasUpdated: (updated: Komunitas) => void;
}

interface AddUserFormState {
  username: string;
  password: string;
  role: Role;
}

const EMPTY_USER_FORM: AddUserFormState = {
  username: "",
  password: "",
  role: "admin",
};

export default function SettingsTab({
  komunitas,
  onKomunitasUpdated,
}: SettingsTabProps): ReactElement {
  const { role: currentRole, komunitasId } = getSession();
  const isAdmin = currentRole === "admin";

  // Section 1: Community Profile Form
  const [nama, setNama] = useState(komunitas?.nama ?? "");
  const [slug, setSlug] = useState(komunitas?.slug ?? "");
  const [alamat, setAlamat] = useState(komunitas?.alamat ?? "");

  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [copied, setCopied] = useState(false);

  // Sync state if prop changes
  useEffect(() => {
    if (komunitas) {
      setNama(komunitas.nama);
      setSlug(komunitas.slug);
      setAlamat(komunitas.alamat ?? "");
    }
  }, [komunitas]);

  // Section 2: Pengurus List
  const [users, setUsers] = useState<KomunitasUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState("");

  // Add User Modal
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [userForm, setUserForm] = useState<AddUserFormState>(EMPTY_USER_FORM);
  const [userSaving, setUserSaving] = useState(false);
  const [addUserError, setAddUserError] = useState("");
  const [addUserSuccess, setAddUserSuccess] = useState("");

  const loadUsers = useCallback((): void => {
    if (!komunitasId) return;
    setUsersLoading(true);
    setUsersError("");
    api
      .get<KomunitasUser[]>(`/api/komunitas/${komunitasId}/users`)
      .then((res) => {
        setUsers(res.data);
      })
      .catch((err) => {
        setUsersError(errorMessage(err, "Gagal memuat daftar pengurus"));
      })
      .finally(() => {
        setUsersLoading(false);
      });
  }, [komunitasId]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Modal keyboard accessibility: Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === "Escape" && isAddUserOpen) {
        setIsAddUserOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAddUserOpen]);

  async function handleSaveProfile(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!komunitasId || !isAdmin) return;

    setProfileError("");
    setProfileSuccess("");
    setProfileSaving(true);

    try {
      const payload: KomunitasUpdate = {
        nama: nama.trim(),
        slug: slug.trim().toLowerCase(),
        alamat: alamat.trim() || undefined,
      };

      const res = await api.put<Komunitas>(`/api/komunitas/${komunitasId}`, payload);
      onKomunitasUpdated(res.data);
      setProfileSuccess("Profil komunitas berhasil diperbarui");
      setTimeout(() => setProfileSuccess(""), 4000);
    } catch (err) {
      setProfileError(errorMessage(err, "Gagal memperbarui profil komunitas"));
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleAddUser(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!komunitasId || !isAdmin) return;

    setAddUserError("");
    setUserSaving(true);

    try {
      const payload: UserCreate = {
        username: userForm.username.trim(),
        password: userForm.password,
        role: userForm.role,
      };

      await api.post(`/api/komunitas/${komunitasId}/users`, payload);
      setUserForm(EMPTY_USER_FORM);
      setIsAddUserOpen(false);
      setAddUserSuccess(`Pengurus baru "${payload.username}" berhasil didaftarkan`);
      setTimeout(() => setAddUserSuccess(""), 4000);
      loadUsers();
    } catch (err) {
      setAddUserError(errorMessage(err, "Gagal menambahkan akun pengurus"));
    } finally {
      setUserSaving(false);
    }
  }

  function handleCopyPublicUrl(): void {
    const currentSlug = komunitas?.slug || slug;
    const fullUrl = `${window.location.origin}/public/${currentSlug}`;
    void navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  const activeSlug = komunitas?.slug || slug;
  const publicPath = `/public/${activeSlug}`;

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-emerald-700" />
            <h2 className="text-lg font-bold text-slate-900">Pengaturan Komunitas</h2>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kelola profil identitas RT/RW, portal transparansi publik, dan hak akses pengurus
          </p>
        </div>

        {!isAdmin && (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold self-start sm:self-auto">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Mode Baca: Hanya Admin yang dapat mengubah data</span>
          </div>
        )}
      </div>

      {/* Global Alerts */}
      {addUserSuccess && (
        <div className="flex items-center gap-2.5 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{addUserSuccess}</span>
        </div>
      )}

      {/* Section 1: Profil & Identitas Komunitas */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">Profil &amp; Identitas Komunitas</h3>
          </div>
          <span className="text-xs text-slate-400">ID: {komunitasId ?? "–"}</span>
        </div>

        <div className="p-6 space-y-6">
          {profileSuccess && (
            <div className="flex items-center gap-2.5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{profileSuccess}</span>
            </div>
          )}

          {profileError && (
            <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-sm font-medium">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">{profileError}</div>
              <button
                type="button"
                onClick={() => setProfileError("")}
                className="text-rose-600 hover:text-rose-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Public Portal Showcase Card */}
          <div className="bg-gradient-to-r from-emerald-50/80 via-slate-50 to-emerald-50/40 p-4 sm:p-5 rounded-xl border border-emerald-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                    Tautan Portal Transparansi Publik
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-600 text-white rounded-full">
                    Publik
                  </span>
                </div>
                <p className="text-xs text-slate-600">
                  Warga dapat mengakses transparansi kas tanpa login melalui tautan ini
                </p>
                <div className="pt-1 font-mono text-xs text-slate-800 font-semibold break-all">
                  {typeof window !== "undefined" ? window.location.origin : ""}
                  <span className="text-emerald-700">{publicPath}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2 sm:pt-0 shrink-0">
                <button
                  type="button"
                  onClick={handleCopyPublicUrl}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 shadow-sm transition"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700 font-bold">Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      <span>Salin Tautan</span>
                    </>
                  )}
                </button>

                <Link
                  to={publicPath}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm transition"
                >
                  <span>Buka Portal</span>
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-100" />
                </Link>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="input-nama-komunitas"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Nama Komunitas <span className="text-rose-600">*</span>
                </label>
                <input
                  id="input-nama-komunitas"
                  type="text"
                  required
                  disabled={!isAdmin || profileSaving}
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Contoh: RT 05 / RW 03 Sukamaju"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-500 transition"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Nama resmi komunitas yang tampil di kop laporan dan navbar
                </p>
              </div>

              <div>
                <label
                  htmlFor="input-slug-komunitas"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
                >
                  Slug URL Publik <span className="text-rose-600">*</span>
                </label>
                <div className="flex items-stretch rounded-xl border border-slate-300 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-600 overflow-hidden transition bg-white">
                  <span className="flex items-center shrink-0 pl-3.5 pr-2 text-xs text-slate-500 font-mono bg-slate-50 border-r border-slate-200 select-none">
                    /public/
                  </span>
                  <input
                    id="input-slug-komunitas"
                    type="text"
                    required
                    disabled={!isAdmin || profileSaving}
                    value={slug}
                    onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, "-"))}
                    placeholder="rt05-sukamaju"
                    className="flex-1 min-w-0 pl-2.5 pr-3.5 py-2.5 text-sm font-mono focus:outline-none disabled:bg-slate-100 disabled:text-slate-500 bg-transparent"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Hanya huruf kecil, angka, dan tanda hubung (-) tanpa spasi
                </p>
              </div>
            </div>

            <div>
              <label
                htmlFor="input-alamat-komunitas"
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Alamat / Deskripsi Wilayah
              </label>
              <textarea
                id="input-alamat-komunitas"
                rows={2}
                disabled={!isAdmin || profileSaving}
                value={alamat}
                onChange={(e) => setAlamat(e.target.value)}
                placeholder="Contoh: Kelurahan Sukamaju, Kecamatan Cilodong, Kota Depok"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 disabled:bg-slate-100 disabled:text-slate-500 transition"
              />
            </div>

            {isAdmin && (
              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-sm font-semibold shadow-sm transition"
                >
                  {profileSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Menyimpan Perubahan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Section 2: Daftar Pengurus (Admin & Ketua) */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-bold text-slate-900">Daftar Pengurus Komunitas</h3>
            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-semibold">
              {users.length} akun
            </span>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setAddUserError("");
                setUserForm(EMPTY_USER_FORM);
                setIsAddUserOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-sm transition self-start sm:self-auto"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Tambah Pengurus Baru</span>
            </button>
          )}
        </div>

        {usersError && (
          <div className="p-4 mx-6 mt-4 flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{usersError}</span>
          </div>
        )}

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <th className="py-3 px-6">Username</th>
                <th className="py-3 px-6">Peran / Otoritas</th>
                <th className="py-3 px-6">Tanggal Didaftarkan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {usersLoading ? (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                    <span>Memuat daftar pengurus...</span>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-slate-400">
                    Belum ada pengurus terdaftar
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isUserAdmin = u.role === "admin";
                  const roleBadgeClass = isUserAdmin
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : u.role === "ketua"
                      ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                      : "bg-slate-100 text-slate-700 border-slate-200";

                  const roleLabel = isUserAdmin
                    ? "Admin / Bendahara"
                    : u.role === "ketua"
                      ? "Ketua RT / RW"
                      : "Warga";

                  const roleDesc = isUserAdmin
                    ? "Kelola buku kas, iuran, dan pengaturan"
                    : u.role === "ketua"
                      ? "Persetujuan pencairan dana kas"
                      : "Akses warga";

                  const formattedDate = u.created_at
                    ? new Date(u.created_at).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })
                    : "–";

                  return (
                    <tr key={u.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3.5 px-6 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-700">
                            {u.username.substring(0, 2).toUpperCase()}
                          </div>
                          <span>{u.username}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-6">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold tracking-wide">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${isUserAdmin ? "bg-emerald-500" : "bg-indigo-500"}`}
                          />
                          <span className={roleBadgeClass}>{roleLabel}</span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{roleDesc}</p>
                      </td>
                      <td className="py-3.5 px-6 text-xs text-slate-500">{formattedDate}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pengurus Card List (mobile) */}
        <div className="block md:hidden divide-y divide-slate-100">
          {usersLoading ? (
            <div className="py-10 text-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
              <span>Memuat daftar pengurus...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              Belum ada pengurus terdaftar
            </div>
          ) : (
            users.map((u) => {
              const isUserAdmin = u.role === "admin";
              const roleBadgeClass = isUserAdmin
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : u.role === "ketua"
                  ? "bg-indigo-50 text-indigo-800 border-indigo-200"
                  : "bg-slate-100 text-slate-700 border-slate-200";

              const roleLabel = isUserAdmin
                ? "Admin / Bendahara"
                : u.role === "ketua"
                  ? "Ketua RT / RW"
                  : "Warga";

              const roleDesc = isUserAdmin
                ? "Kelola buku kas, iuran, dan pengaturan"
                : u.role === "ketua"
                  ? "Persetujuan pencairan dana kas"
                  : "Akses warga";

              const formattedDate = u.created_at
                ? new Date(u.created_at).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : "–";

              return (
                <div key={u.id} className="p-4 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-700 shrink-0">
                      {u.username.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 text-sm truncate">
                        {u.username}
                      </div>
                      <div className="text-[11px] text-slate-400">{formattedDate}</div>
                    </div>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold tracking-wide">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isUserAdmin ? "bg-emerald-500" : "bg-indigo-500"}`}
                    />
                    <span className={roleBadgeClass}>{roleLabel}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">{roleDesc}</p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Modal: Tambah Pengurus Baru */}
      {isAddUserOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-tambah-pengurus-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-4 sm:p-6 shadow-xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    id="modal-tambah-pengurus-title"
                    className="text-base font-bold text-slate-900"
                  >
                    Tambah Pengurus Baru
                  </h3>
                  <p className="text-xs text-slate-500">
                    Daftarkan akun login untuk pengurus komunitas
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddUserOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {addUserError && (
              <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="flex-1">{addUserError}</span>
              </div>
            )}

            <form onSubmit={handleAddUser} className="space-y-4 pt-1">
              <div>
                <label
                  htmlFor="input-username-pengurus"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Username Login <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Users className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    id="input-username-pengurus"
                    type="text"
                    required
                    minLength={3}
                    autoFocus
                    value={userForm.username}
                    onChange={(e) =>
                      setUserForm({
                        ...userForm,
                        username: e.target.value.toLowerCase().replace(/\s+/g, ""),
                      })
                    }
                    placeholder="contoh: bendahara2 atau ketua_rt"
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="input-password-pengurus"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Kata Sandi <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    id="input-password-pengurus"
                    type="password"
                    required
                    minLength={6}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder="Minimal 6 karakter"
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="select-role-pengurus"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1"
                >
                  Peran / Wewenang <span className="text-rose-600">*</span>
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <select
                    id="select-role-pengurus"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 bg-white"
                  >
                    <option value="admin">Admin / Bendahara (Kelola Kas &amp; Iuran)</option>
                    <option value="ketua">Ketua RT / RW (Persetujuan Pencairan Kas)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={userSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-400 text-white text-xs font-semibold rounded-xl shadow-sm transition"
                >
                  {userSaving ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Daftarkan Pengurus</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
