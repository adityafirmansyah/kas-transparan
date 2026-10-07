import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { api, errorMessage, formatRupiah, getSession } from "../api";
import type { ApprovalStatus, KasEntry, SaldoResponse } from "../types";

interface PemasukanFormState {
  kategori: string;
  deskripsi: string;
  nominal: string;
}

interface PengeluaranFormState {
  kategori: string;
  deskripsi: string;
  nominal: string;
}

const EMPTY_PEMASUKAN: PemasukanFormState = { kategori: "donasi", deskripsi: "", nominal: "" };
const EMPTY_PENGELUARAN: PengeluaranFormState = { kategori: "lainnya", deskripsi: "", nominal: "" };

export default function KasTab(): ReactElement {
  const { role } = getSession();
  const [entries, setEntries] = useState<KasEntry[]>([]);
  const [saldo, setSaldo] = useState(0);
  const [pemasukanForm, setPemasukanForm] = useState<PemasukanFormState>(EMPTY_PEMASUKAN);
  const [pengeluaranForm, setPengeluaranForm] = useState<PengeluaranFormState>(EMPTY_PENGELUARAN);
  const [error, setError] = useState("");

  function load(): void {
    api.get<KasEntry[]>("/api/kas").then((r) => setEntries(r.data));
    api.get<SaldoResponse>("/api/kas/saldo").then((r) => setSaldo(r.data.saldo));
  }

  useEffect(load, []);

  async function handlePemasukan(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/kas/pemasukan", {
        ...pemasukanForm,
        nominal: Number(pemasukanForm.nominal),
      });
      setPemasukanForm(EMPTY_PEMASUKAN);
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal mencatat pemasukan"));
    }
  }

  async function handlePengeluaran(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/kas/pengeluaran", {
        ...pengeluaranForm,
        nominal: Number(pengeluaranForm.nominal),
      });
      setPengeluaranForm(EMPTY_PENGELUARAN);
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal mencatat pengeluaran"));
    }
  }

  async function handleApproval(id: string, status: ApprovalStatus): Promise<void> {
    try {
      await api.post(`/api/kas/pengeluaran/${id}/approval`, { status });
      load();
    } catch (err) {
      setError(errorMessage(err, "Gagal memproses approval"));
    }
  }

  return (
    <div>
      <h2>Buku Kas</h2>
      <div className="saldo-badge">Saldo saat ini: {formatRupiah(saldo)}</div>
      {error && <div className="error-banner">{error}</div>}

      <div className="two-col">
        <form className="card-form" onSubmit={handlePemasukan}>
          <h3>Catat Pemasukan</h3>
          <input
            placeholder="Kategori (e.g. donasi)"
            value={pemasukanForm.kategori}
            onChange={(e) => setPemasukanForm({ ...pemasukanForm, kategori: e.target.value })}
          />
          <input
            placeholder="Deskripsi"
            value={pemasukanForm.deskripsi}
            onChange={(e) => setPemasukanForm({ ...pemasukanForm, deskripsi: e.target.value })}
            required
          />
          <input
            placeholder="Nominal"
            type="number"
            value={pemasukanForm.nominal}
            onChange={(e) => setPemasukanForm({ ...pemasukanForm, nominal: e.target.value })}
            required
          />
          <button type="submit">Simpan Pemasukan</button>
        </form>

        <form className="card-form" onSubmit={handlePengeluaran}>
          <h3>Catat Pengeluaran</h3>
          <input
            placeholder="Kategori (e.g. kebersihan)"
            value={pengeluaranForm.kategori}
            onChange={(e) => setPengeluaranForm({ ...pengeluaranForm, kategori: e.target.value })}
          />
          <input
            placeholder="Deskripsi"
            value={pengeluaranForm.deskripsi}
            onChange={(e) => setPengeluaranForm({ ...pengeluaranForm, deskripsi: e.target.value })}
            required
          />
          <input
            placeholder="Nominal"
            type="number"
            value={pengeluaranForm.nominal}
            onChange={(e) => setPengeluaranForm({ ...pengeluaranForm, nominal: e.target.value })}
            required
          />
          <button type="submit">Simpan Pengeluaran (butuh approval ketua)</button>
        </form>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Tanggal</th>
            <th>Tipe</th>
            <th>Kategori</th>
            <th>Deskripsi</th>
            <th>Nominal</th>
            <th>Status</th>
            {role === "ketua" && <th>Aksi</th>}
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td>{e.tanggal}</td>
              <td>{e.tipe}</td>
              <td>{e.kategori}</td>
              <td>{e.deskripsi}</td>
              <td>{formatRupiah(e.nominal)}</td>
              <td>{e.approval_status || "-"}</td>
              {role === "ketua" && (
                <td>
                  {e.tipe === "pengeluaran" && e.approval_status === "pending" && (
                    <>
                      <button onClick={() => handleApproval(e.id, "approved")}>Setujui</button>
                      <button onClick={() => handleApproval(e.id, "rejected")}>Tolak</button>
                    </>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
