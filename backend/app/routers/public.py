"""PUBLIC transparency endpoints — no auth required.

This is the core differentiator of the product: any resident can view
aggregate kas health for their komunitas WITHOUT logging in. To protect
privacy we deliberately:
  - never expose warga names or individual tagihan/payment status
  - only expose aggregate totals and expense categories (not line-item
    descriptions that might reveal who/what specifically, beyond the
    category bucket)
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.models import Komunitas, KasEntry, PengeluaranStatus
from app.schemas.schemas import PublicSummary

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/{slug}/summary", response_model=PublicSummary)
def public_summary(
    slug: str,
    periode: str | None = None,
    db: Session = Depends(get_db),
):
    komunitas = db.query(Komunitas).filter(Komunitas.slug == slug).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Komunitas tidak ditemukan")

    periode = periode or date.today().strftime("%Y-%m")

    entries = db.query(KasEntry).filter(KasEntry.komunitas_id == komunitas.id).all()

    saldo_akhir = 0.0
    total_masuk_bulan_ini = 0.0
    total_keluar_bulan_ini = 0.0
    pengeluaran_per_kategori: dict[str, float] = {}

    for e in entries:
        bulan = e.tanggal.strftime("%Y-%m")
        if e.tipe == "pemasukan":
            saldo_akhir += e.nominal
            if bulan == periode:
                total_masuk_bulan_ini += e.nominal
        elif e.tipe == "pengeluaran" and e.approval_status == PengeluaranStatus.approved:
            saldo_akhir -= e.nominal
            if bulan == periode:
                total_keluar_bulan_ini += e.nominal
                pengeluaran_per_kategori[e.kategori] = (
                    pengeluaran_per_kategori.get(e.kategori, 0.0) + e.nominal
                )

    return PublicSummary(
        komunitas_nama=komunitas.nama,
        saldo_akhir=saldo_akhir,
        total_masuk_bulan_ini=total_masuk_bulan_ini,
        total_keluar_bulan_ini=total_keluar_bulan_ini,
        pengeluaran_per_kategori=pengeluaran_per_kategori,
        periode=periode,
    )
