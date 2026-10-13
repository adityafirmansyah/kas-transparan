import { useEffect, useState, type ReactElement } from "react";
import { Loader2, X } from "lucide-react";
import { fetchImageObjectUrl } from "../api";

interface ReceiptViewerProps {
  /** Stored path, e.g. /api/uploads/receipts/<uuid>.png */
  path: string;
  /** Optional caption (e.g. the expense description). */
  title?: string;
  onClose: () => void;
}

/**
 * Full-screen lightbox for an expense receipt (nota) image.
 *
 * The receipt endpoint is authenticated, so the image is fetched as a blob and
 * shown from an object URL — a plain <img src> would be rejected with 401.
 */
export default function ReceiptViewer({ path, title, onClose }: ReceiptViewerProps): ReactElement {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let revoked = false;
    let created: string | null = null;

    fetchImageObjectUrl(path)
      .then((url) => {
        if (revoked) {
          window.URL.revokeObjectURL(url);
          return;
        }
        created = url;
        setObjectUrl(url);
      })
      .catch((err: Error) => setError(err.message || "Gagal memuat bukti struk"));

    return () => {
      revoked = true;
      if (created) window.URL.revokeObjectURL(created);
    };
  }, [path]);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bukti struk pengeluaran"
    >
      <div
        className="bg-white rounded-2xl shadow-xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 truncate">Bukti Struk Pengeluaran</h3>
            {title && <p className="text-xs text-slate-500 truncate">{title}</p>}
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-slate-50 flex items-center justify-center p-3 min-h-[240px]">
          {error ? (
            <p className="text-sm text-rose-600 font-medium px-4 text-center">{error}</p>
          ) : objectUrl ? (
            <img
              src={objectUrl}
              alt="Bukti struk pengeluaran"
              className="max-w-full max-h-[70vh] rounded-lg shadow-sm object-contain"
            />
          ) : (
            <span className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Memuat bukti struk...</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
