import { useCallback, useEffect, useState, type ReactElement } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  ShieldCheck,
  LogOut,
  ExternalLink,
  Wallet,
  Users,
  Receipt,
  Clock,
  BookOpen,
  Coins,
  CheckCircle2,
  Settings,
} from "lucide-react";
import { clearSession, getSession, api, formatRupiah } from "../api";
import type { KasEntry, Komunitas, SaldoResponse, TagihanWithWarga, Warga } from "../types";
import WargaTab from "../components/WargaTab";
import IuranTab from "../components/IuranTab";
import TagihanTab from "../components/TagihanTab";
import KasTab from "../components/KasTab";
import SettingsTab from "../components/SettingsTab";

const TABS = [
  { id: "Warga", label: "Data Warga", icon: Users },
  { id: "Iuran", label: "Jenis Iuran", icon: Coins },
  { id: "Tagihan", label: "Tagihan Iuran", icon: Receipt },
  { id: "Kas", label: "Buku Kas", icon: BookOpen },
  { id: "Pengaturan", label: "Pengaturan", icon: Settings },
] as const;

type Tab = (typeof TABS)[number]["id"];

export default function DashboardPage(): ReactElement {
  const navigate = useNavigate();
  const { role, komunitasId } = getSession();
  const [tab, setTab] = useState<Tab>("Warga");
  const [komunitas, setKomunitas] = useState<Komunitas | null>(null);

  // Stats across the app
  const [saldo, setSaldo] = useState<number>(0);
  const [wargaCount, setWargaCount] = useState({ total: 0, aktif: 0 });
  const [tagihanCount, setTagihanCount] = useState({ total: 0, lunas: 0 });
  const [pendingApprovals, setPendingApprovals] = useState(0);

  const loadStats = useCallback((): void => {
    if (komunitasId) {
      api
        .get<Komunitas>(`/api/komunitas/${komunitasId}`)
        .then((r) => setKomunitas(r.data))
        .catch(() => {});
    }

    api
      .get<SaldoResponse>("/api/kas/saldo")
      .then((r) => setSaldo(r.data.saldo))
      .catch(() => {});

    api
      .get<Warga[]>("/api/warga")
      .then((r) => {
        const aktif = r.data.filter((w) => w.aktif).length;
        setWargaCount({ total: r.data.length, aktif });
      })
      .catch(() => {});

    const now = new Date();
    const curPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    api
      .get<TagihanWithWarga[]>("/api/tagihan", { params: { periode: curPeriod } })
      .then((r) => {
        const lunas = r.data.filter((t) => t.status === "lunas").length;
        setTagihanCount({ total: r.data.length, lunas });
      })
      .catch(() => {});

    api
      .get<KasEntry[]>("/api/kas")
      .then((r) => {
        const pending = r.data.filter(
          (e) => e.tipe === "pengeluaran" && e.approval_status === "pending"
        ).length;
        setPendingApprovals(pending);
      })
      .catch(() => {});
  }, [komunitasId]);

  useEffect(() => {
    loadStats();
  }, [loadStats, tab]);

  function handleLogout(): void {
    clearSession();
    navigate("/login");
  }

  const roleBadgeStyle =
    role === "ketua"
      ? "bg-indigo-50 text-indigo-700 border-indigo-200"
      : role === "admin"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-slate-100 text-slate-700 border-slate-200";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Navbar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 backdrop-blur-sm bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-800 to-emerald-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-emerald-700/20">
              <ShieldCheck className="w-6 h-6 text-emerald-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900 leading-none">
                  kas-transparan
                </span>
                <span className="hidden sm:inline-block text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Civic Trust
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {komunitas ? komunitas.nama : "Portal Manajemen Pengurus"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {komunitas?.slug && (
              <Link
                to={`/public/${komunitas.slug}`}
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition"
              >
                <span>Lihat Portal Publik</span>
                <ExternalLink className="w-3.5 h-3.5 text-emerald-700" />
              </Link>
            )}

            <div className="flex items-center gap-2 pl-2 sm:border-l sm:border-slate-200">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg border capitalize ${roleBadgeStyle}`}
              >
                <span>Peran: {role || "Pengurus"}</span>
              </span>

              <button
                onClick={handleLogout}
                title="Keluar dari akun"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 space-y-6">
        {/* 4 Stat Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Saldo Kas Total */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Saldo Kas Total
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <Wallet className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">
              {formatRupiah(saldo)}
            </div>
            <p className="text-[11px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Tersedia &amp; terverifikasi</span>
            </p>
          </div>

          {/* Card 2: Warga Aktif */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Warga Terdaftar
              </span>
              <div className="p-2 rounded-xl bg-slate-100 text-slate-700">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">
              {wargaCount.aktif}{" "}
              <span className="text-sm font-normal text-slate-400">/ {wargaCount.total}</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {wargaCount.aktif} warga aktif menerima tagihan
            </p>
          </div>

          {/* Card 3: Status Iuran Bulan Ini */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Iuran Bulan Ini
              </span>
              <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900 font-mono">
              {tagihanCount.total > 0
                ? `${Math.round((tagihanCount.lunas / tagihanCount.total) * 100)}%`
                : "0%"}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {tagihanCount.lunas} dari {tagihanCount.total} tagihan telah lunas
            </p>
          </div>

          {/* Card 4: Approval Ketua */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Approval Ketua
              </span>
              <div
                className={`p-2 rounded-xl ${
                  pendingApprovals > 0
                    ? "bg-amber-50 text-amber-600"
                    : "bg-emerald-50 text-emerald-600"
                }`}
              >
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div
              className={`text-2xl font-extrabold font-mono ${
                pendingApprovals > 0 ? "text-amber-600" : "text-emerald-700"
              }`}
            >
              {pendingApprovals}{" "}
              <span className="text-xs font-normal text-slate-500">Pengeluaran</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              {pendingApprovals > 0
                ? "Perlu ditinjau oleh Ketua RT"
                : "Semua pengeluaran telah ditinjau"}
            </p>
          </div>
        </div>

        {/* Tab Navigation Pill Bar */}
        <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-sm flex flex-wrap gap-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition ${
                  isActive
                    ? "bg-emerald-700 text-white shadow-sm shadow-emerald-700/20"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-100" : "text-slate-400"}`} />
                <span>{t.label}</span>
                {t.id === "Kas" && pendingApprovals > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-amber-950">
                    {pendingApprovals}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Content Section */}
        <div className="transition-opacity duration-200">
          {tab === "Warga" && <WargaTab />}
          {tab === "Iuran" && <IuranTab />}
          {tab === "Tagihan" && <TagihanTab />}
          {tab === "Kas" && <KasTab />}
          {tab === "Pengaturan" && (
            <SettingsTab
              komunitas={komunitas}
              onKomunitasUpdated={(updated) => setKomunitas(updated)}
            />
          )}
        </div>
      </main>
    </div>
  );
}
