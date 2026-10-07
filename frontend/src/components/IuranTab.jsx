import { useEffect, useState } from "react";
import { api, formatRupiah } from "../api";

export default function IuranTab() {
  const [iuranTypes, setIuranTypes] = useState([]);
  const [form, setForm] = useState({ nama: "", nominal: "", period_type: "monthly" });
  const [error, setError] = useState("");

  function load() {
    api.get("/api/iuran-types").then((r) => setIuranTypes(r.data)).catch(() => setError("Gagal memuat iuran"));
  }

  useEffect(load, []);

  async function handleAdd(e) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/api/iuran-types", { ...form, nominal: Number(form.nominal) });
      setForm({ nama: "", nominal: "", period_type: "monthly" });
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal menambah jenis iuran");
    }
  }

  async function handleDelete(id) {
    if (!confirm("Hapus jenis iuran ini?")) return;
    await api.delete(`/api/iuran-types/${id}`);
    load();
  }

  return (
    <div>
      <h2>Jenis Iuran</h2>
      {error && <div className="error-banner">{error}</div>}
      <form className="inline-form" onSubmit={handleAdd}>
        <input placeholder="Nama (e.g. Iuran Kebersihan)" value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} required />
        <input placeholder="Nominal" type="number" value={form.nominal} onChange={(e) => setForm({ ...form, nominal: e.target.value })} required />
        <select value={form.period_type} onChange={(e) => setForm({ ...form, period_type: e.target.value })}>
          <option value="monthly">Bulanan</option>
          <option value="one_time">Sekali</option>
        </select>
        <button type="submit">Tambah Jenis Iuran</button>
      </form>

      <table className="data-table">
        <thead>
          <tr>
            <th>Nama</th>
            <th>Nominal</th>
            <th>Periode</th>
            <th>Status</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {iuranTypes.map((i) => (
            <tr key={i.id}>
              <td>{i.nama}</td>
              <td>{formatRupiah(i.nominal)}</td>
              <td>{i.period_type === "monthly" ? "Bulanan" : "Sekali"}</td>
              <td>{i.aktif ? "Aktif" : "Nonaktif"}</td>
              <td>
                <button onClick={() => handleDelete(i.id)}>Hapus</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
