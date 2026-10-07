import { useEffect, useState } from "react";
import { api, formatRupiah } from "../api";

function currentPeriode() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export default function TagihanTab() {
  const [iuranTypes, setIuranTypes] = useState([]);
  const [periode, setPeriode] = useState(currentPeriode());
  const [selectedIuran, setSelectedIuran] = useState("");
  const [tagihanList, setTagihanList] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/iuran-types").then((r) => {
      setIuranTypes(r.data);
      if (r.data.length > 0) setSelectedIuran(r.data[0].id);
    });
  }, []);

  function loadTagihan() {
    api.get("/api/tagihan", { params: { periode } }).then((r) => setTagihanList(r.data));
  }

  useEffect(loadTagihan, [periode]);

  async function handleGenerate() {
    setError("");
    setMessage("");
    try {
      const resp = await api.post("/api/tagihan/generate", { iuran_type_id: selectedIuran, periode });
      setMessage(`${resp.data.length} tagihan baru dibuat untuk periode ${periode}.`);
      loadTagihan();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal generate tagihan");
    }
  }

  async function handlePay(tagihanId) {
    const method = confirm("Klik OK untuk Transfer, Cancel untuk Tunai") ? "transfer" : "tunai";
    try {
      await api.post(`/api/tagihan/${tagihanId}/pay`, { payment_method: method });
      loadTagihan();
    } catch (err) {
      setError(err.response?.data?.detail || "Gagal mencatat pembayaran");
    }
  }

  return (
    <div>
      <h2>Tagihan / Billing</h2>
      {error && <div className="error-banner">{error}</div>}
      {message && <div className="info-banner">{message}</div>}

      <div className="inline-form">
        <label>
          Periode
          <input value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder="YYYY-MM" />
        </label>
        <label>
          Jenis Iuran
          <select value={selectedIuran} onChange={(e) => setSelectedIuran(e.target.value)}>
            {iuranTypes.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nama}
              </option>
            ))}
          </select>
        </label>
        <button onClick={handleGenerate}>Generate Tagihan Bulan Ini</button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Warga</th>
            <th>Iuran</th>
            <th>Nominal</th>
            <th>Status</th>
            <th>Metode</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {tagihanList.map((t) => (
            <tr key={t.id}>
              <td>{t.warga_nama}</td>
              <td>{t.iuran_nama}</td>
              <td>{formatRupiah(t.nominal)}</td>
              <td>{t.status === "lunas" ? "Lunas" : "Belum Bayar"}</td>
              <td>{t.payment_method || "-"}</td>
              <td>
                {t.status === "belum_bayar" && <button onClick={() => handlePay(t.id)}>Tandai Lunas</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
