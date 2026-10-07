import { useEffect, useState } from "react";
import { api, formatRupiah, getSession } from "../api";

export default function KasTab() {
  const { role } = getSession();
  const [entries, setEntries] = useState([]);
  const [saldo, setSaldo] = useState(0);
  const [pemasukanForm, setPemasukanForm] = useState({ kategori: "donasi", deskripsi: "", nominal: "" });
  const [pengeluaranForm, setPengeluaranForm] = useState({ kategori: "lainnya", deskripsi: "", nominal: "" });
  const [error, setError] = useState("");

  function load() {
    api.get("/api/kas").then((r) => setEntries(r.data));
    api.get("/api/kas/saldo").then((r) => setSaldo(r.data.saldo));
  }

  useEffect(load, []);

  async function handlePemasukan(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/kas/pemasukan", { ...pemasukanForm, nominal: Number(pemasukanForm.nominal) });
      setPemasukanForm({ kategori: "donasi", deskripsi: "", nominal: "" });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal mencatat pemasukan");
    }
  }

  async function handlePengeluaran(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/kas/pengeluaran", { ...pengeluaranForm, nominal: Number(pengeluaranForm.nominal) });
      setPengeluaranForm({ kategori: "lainnya", deskripsi: "", nominal: "" });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal mencatat pengeluaran");
    }
  }

  async function handleApproval(id, status) {
    try {
      await api.post(`/api/kas/pengeluaran/${id}/approval`, { status });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal memproses approval");
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
          <input placeholder="Kategori (e.g. donasi)" value={pemasukanForm.kategori} onChange={(e) => setPemasukanForm({ ...pemasukanForm, kategori: e.target.value })} />
          <input placeholder="Deskripsi" value={pemasukanForm.deskripsi} onChange={(e) => setPemasukanForm({ ...pemasukanForm, deskripsi: e.target.value })} required />
          <input placeholder="Nominal" type="number" value={pemasukanForm.nominal} onChange={(e) => setPemasukanForm({ ...pemasukanForm, nominal: e.target.value })} required />
          <button type="submit">Simpan Pemasukan</button>
        </form>

        <form className="card-form" onSubmit={handlePengeluaran}>
          <h3>Catat Pengeluaran</h3>
          <input placeholder="Kategori (e.g. kebersihan)" value={pengeluaranForm.kategori} onChange={(e) => setPengeluaranForm({ ...pengeluaranForm, kategori: e.target.value })} />
          <input placeholder="Deskripsi" value={pengeluaranForm.deskripsi} onChange={(e) => setPengeluaranForm({ ...pengeluaranForm, deskripsi: e.target.value })} required />
          <input placeholder="Nominal" type="number" value={pengeluaranForm.nominal} onChange={(e) => setPengeluaranForm({ ...pengeluaranForm, nominal: e.target.value })} required />
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
