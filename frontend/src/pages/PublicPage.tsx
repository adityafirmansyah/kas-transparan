import { useEffect, useState, type ReactElement } from "react";
import { useParams } from "react-router-dom";
import { api, errorMessage, formatRupiah } from "../api";
import type { PublicSummary } from "../types";

export default function PublicPage(): ReactElement {
  const { slug } = useParams();
  const [summary, setSummary] = useState<PublicSummary | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<PublicSummary>(`/api/public/${slug}/summary`)
      .then((resp) => setSummary(resp.data))
      .catch((err) => setError(errorMessage(err, "Komunitas tidak ditemukan")))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return <div className="public-page">Memuat...</div>;
  if (error || !summary)
    return (
      <div className="public-page">
        <p className="error-banner">{error || "Komunitas tidak ditemukan"}</p>
      </div>
    );

  return (
    <div className="public-page">
      <header className="public-header">
        <h1>{summary.komunitas_nama}</h1>
        <p className="subtitle">Transparansi Kas &mdash; Periode {summary.periode}</p>
        <p className="disclaimer">
          Halaman ini publik dan tidak memerlukan login. Nama warga dan status pembayaran pribadi
          tidak ditampilkan untuk menjaga privasi — hanya angka agregat.
        </p>
      </header>

      <section className="summary-grid">
        <div className="summary-card highlight">
          <span className="label">Saldo Akhir</span>
          <span className="value">{formatRupiah(summary.saldo_akhir)}</span>
        </div>
        <div className="summary-card">
          <span className="label">Pemasukan Bulan Ini</span>
          <span className="value income">{formatRupiah(summary.total_masuk_bulan_ini)}</span>
        </div>
        <div className="summary-card">
          <span className="label">Pengeluaran Bulan Ini</span>
          <span className="value expense">{formatRupiah(summary.total_keluar_bulan_ini)}</span>
        </div>
      </section>

      <section>
        <h2>Pengeluaran per Kategori (Bulan Ini)</h2>
        {Object.keys(summary.pengeluaran_per_kategori).length === 0 ? (
          <p className="empty">Belum ada pengeluaran yang disetujui bulan ini.</p>
        ) : (
          <table className="public-table">
            <thead>
              <tr>
                <th>Kategori</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(summary.pengeluaran_per_kategori).map(([kategori, nominal]) => (
                <tr key={kategori}>
                  <td>{kategori}</td>
                  <td>{formatRupiah(nominal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="public-footer">
        Dikelola dengan <strong>kas-transparan</strong> &mdash; proyek open-source transparansi kas
        RT/RW.
      </footer>
    </div>
  );
}
