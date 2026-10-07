"""Internal reports: monthly summary + list of warga who haven't paid."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import IuranType, KasEntry, PengeluaranStatus, Tagihan, TagihanStatus, User
from app.schemas.schemas import (
    MonthlyReport,
    TunggakanMultiOut,
    TunggakanPeriodeOut,
    UnpaidWargaOut,
)

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
    query = db.query(Tagihan).filter(
        Tagihan.komunitas_id == user.komunitas_id,
        Tagihan.periode == periode,
        Tagihan.status == TagihanStatus.belum_bayar,
    )
    if user.role.value == "admin":
        query = query.join(Tagihan.iuran_type).filter(
            (IuranType.admin_id == user.id) | (IuranType.admin_id.is_(None))
        )
    rows = query.all()

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


@router.get("/tunggakan-multi", response_model=list[TunggakanMultiOut])
def tunggakan_multi(
    periode_start: str,
    periode_end: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    """Aggregate unpaid tagihan per warga across an inclusive periode range.

    `periode` strings are "YYYY-MM" which sort lexicographically, so a plain
    string BETWEEN comparison is sufficient to express the date range.
    """
    query = db.query(Tagihan).filter(
        Tagihan.komunitas_id == user.komunitas_id,
        Tagihan.periode >= periode_start,
        Tagihan.periode <= periode_end,
        Tagihan.status == TagihanStatus.belum_bayar,
    )
    if user.role.value == "admin":
        query = query.join(Tagihan.iuran_type).filter(
            (IuranType.admin_id == user.id) | (IuranType.admin_id.is_(None))
        )
    rows = query.order_by(Tagihan.periode).all()

    grouped: dict[str, dict] = {}
    for t in rows:
        entry = grouped.setdefault(
            t.warga_id,
            {"warga_nama": t.warga.nama, "unpaid_periods": [], "total_nominal": 0.0},
        )
        entry["unpaid_periods"].append(
            TunggakanPeriodeOut(
                tagihan_id=t.id,
                periode=t.periode,
                iuran_nama=t.iuran_type.nama,
                nominal=t.nominal,
            )
        )
        entry["total_nominal"] += t.nominal

    results = [
        TunggakanMultiOut(
            warga_id=warga_id,
            warga_nama=data["warga_nama"],
            unpaid_periods=data["unpaid_periods"],
            total_unpaid_count=len(data["unpaid_periods"]),
            distinct_months_count=len({p.periode for p in data["unpaid_periods"]}),
            total_nominal=data["total_nominal"],
        )
        for warga_id, data in grouped.items()
    ]
    results.sort(key=lambda r: (-r.distinct_months_count, -r.total_unpaid_count, -r.total_nominal))
    return results
