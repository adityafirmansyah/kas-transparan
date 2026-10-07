import { useEffect, useState } from "react";
import { api } from "../api";

export default function WargaTab() {
  const [warga, setWarga] = useState([]);
  const [form, setForm] = useState({ nama: "", no_hp: "", alamat: "", no_rumah: "" });
  const [error, setError] = useState("");

  function load() {
    api.get("/api/warga").then((r) => setWarga(r.data)).catch(() => setError("Gagal memuat warga"));
  }

  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/warga", form);
      setForm({ nama: "", no_hp: "", alamat: "", no_rumah: "" });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menambah warga");
    }
  }

  async function toggleAktif(w) {
    await api.put(`/api/warga/${w.id}`, { aktif: !w.aktif });
    load();
  }

  async function handleDelete(id) {
    if (!confirm("Hapus warga ini?")) return;
    await api.delete(`/api/warga/${id}`);
    load();
  }

  return (
    <div>
      <h2>Data Warga</h2>
      {error && <div className="error-banner">{error}</div>}
      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="Nama" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} required />
        <input placeholder="No. HP" value={form.no_hp} onChange={(e) => setForm({ ...form, no_hp: e.target.value })} />
        <input placeholder="No. Rumah" value={form.no_rumah} onChange={(e) => setForm({ ...form, no_rumah: e.target.value })} />
        <input placeholder="Alamat" value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} />
        <button type="submit">Tambah Warga</button>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>Nama</th>
            <th>No. HP</th>
            <th>No. Rumah</th>
            <th>Alamat</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {warga.map((w) => (
            <tr key={w.id}>
              <td>{w.nama}</td>
              <td>{w.no_hp}</td>
              <td>{w.no_rumah}</td>
              <td>{w.alamat}</td>
              <td>{w.aktif ? "Aktif" : "Nonaktif"}</td>
              <td>
                <button onClick={() => toggleAktif(w)}>{w.aktif ? "Nonaktifkan" : "Aktifkan"}</button>
                <button onClick={() => handleDelete(w.id)}>Hapus</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
