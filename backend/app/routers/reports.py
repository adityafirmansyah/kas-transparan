"""Internal reports: monthly summary + list of warga who haven't paid."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import KasEntry, PengeluaranStatus, Tagihan, TagihanStatus, User
from app.schemas.schemas import MonthlyReport, UnpaidWargaOut

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/monthly", response_model=MonthlyReport)
def monthly_report(
    periode: str,  # "YYYY-MM"
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    entries = (
        db.query(KasEntry)
        .filter(
            KasEntry.komunitas_id == user.komunitas_id,
        )
        .all()
    )

    total_masuk = 0.0
    total_keluar = 0.0
    saldo_awal = 0.0
    for e in entries:
        bulan = e.tanggal.strftime("%Y-%m")
        if e.tipe == "pemasukan":
            if bulan == periode:
                total_masuk += e.nominal
            elif bulan < periode:
                saldo_awal += e.nominal
        elif e.tipe == "pengeluaran" and e.approval_status == PengeluaranStatus.approved:
            if bulan == periode:
                total_keluar += e.nominal
            elif bulan < periode:
                saldo_awal -= e.nominal

    saldo_akhir = saldo_awal + total_masuk - total_keluar

    return MonthlyReport(
        periode=periode,
        total_masuk=total_masuk,
        total_keluar=total_keluar,
        saldo_awal=saldo_awal,
        saldo_akhir=saldo_akhir,
    )


@router.get("/unpaid", response_model=list[UnpaidWargaOut])
def unpaid_warga(
    periode: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    rows = (
        db.query(Tagihan)
        .filter(
            Tagihan.komunitas_id == user.komunitas_id,
            Tagihan.periode == periode,
            Tagihan.status == TagihanStatus.belum_bayar,
        )
        .all()
    )

    return [
        UnpaidWargaOut(
            warga_id=t.warga_id,
            warga_nama=t.warga.nama,
            iuran_nama=t.iuran_type.nama,
            nominal=t.nominal,
            periode=t.periode,
        )
        for t in rows
    ]
