"""Internal reports: monthly summary + list of warga who haven't paid."""

import csv
import io
from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.excel import build_minimal_xlsx
from app.models.models import (
    IuranType,
    KasEntry,
    Komunitas,
    PengeluaranStatus,
    Tagihan,
    TagihanStatus,
    User,
)
from app.routers.kas import filter_kas_entries_by_pic, get_pic_scoped_kas_query
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
    try:
        parts = periode.split("-")
        yr, mo = int(parts[0]), int(parts[1])
        start_m = date(yr, mo, 1)
        end_m = date(yr, mo, monthrange(yr, mo)[1])
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Format periode harus YYYY-MM") from exc

    base_query = get_pic_scoped_kas_query(db, user.komunitas_id, user)

    # 1. Saldo Awal: total neto sebelum bulan ini
    saldo_awal_expr = func.coalesce(
        func.sum(
            case(
                ((KasEntry.tipe == "pemasukan") & (KasEntry.tanggal < start_m), KasEntry.nominal),
                (
                    (KasEntry.tipe == "pengeluaran")
                    & (KasEntry.approval_status == PengeluaranStatus.approved)
                    & (KasEntry.tanggal < start_m),
                    -KasEntry.nominal,
                ),
                else_=0.0,
            )
        ),
        0.0,
    )

    # 2. Total Masuk Bulan Ini
    masuk_expr = func.coalesce(
        func.sum(
            case(
                (
                    (KasEntry.tipe == "pemasukan")
                    & (KasEntry.tanggal >= start_m)
                    & (KasEntry.tanggal <= end_m),
                    KasEntry.nominal,
                ),
                else_=0.0,
            )
        ),
        0.0,
    )

    # 3. Total Keluar Bulan Ini
    keluar_expr = func.coalesce(
        func.sum(
            case(
                (
                    (KasEntry.tipe == "pengeluaran")
                    & (KasEntry.approval_status == PengeluaranStatus.approved)
                    & (KasEntry.tanggal >= start_m)
                    & (KasEntry.tanggal <= end_m),
                    KasEntry.nominal,
                ),
                else_=0.0,
            )
        ),
        0.0,
    )

    row = base_query.with_entities(saldo_awal_expr, masuk_expr, keluar_expr).one()
    saldo_awal = float(row[0])
    total_masuk = float(row[1])
    total_keluar = float(row[2])
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


@router.get("/export/kas")
def export_buku_kas(
    format: str = Query(..., pattern="^(csv|xlsx)$"),
    periode: str | None = None,  # "YYYY-MM" optional filter
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    """Export cash ledger entries to CSV or XLSX (Admin role only)."""
    komunitas = db.query(Komunitas).filter(Komunitas.id == user.komunitas_id).first()
    komunitas_nama = komunitas.nama if komunitas else "Komunitas"

    query = (
        db.query(KasEntry)
        .filter(KasEntry.komunitas_id == user.komunitas_id)
        .order_by(KasEntry.tanggal.asc())
    )
    entries = query.all()
    entries = filter_kas_entries_by_pic(db, entries, user)

    if periode:
        entries = [e for e in entries if e.tanggal.strftime("%Y-%m") == periode]

    rows: list[list] = [
        [
            "No",
            "Tanggal",
            "Tipe",
            "Kategori",
            "Deskripsi",
            "Pemasukan (Rp)",
            "Pengeluaran (Rp)",
            "Status Approval",
        ]
    ]

    for idx, e in enumerate(entries, start=1):
        pemasukan = e.nominal if e.tipe == "pemasukan" else 0.0
        pengeluaran = e.nominal if e.tipe == "pengeluaran" else 0.0
        status_approval = e.approval_status.value if e.approval_status else "-"
        rows.append(
            [
                idx,
                e.tanggal.strftime("%Y-%m-%d"),
                e.tipe.capitalize(),
                e.kategori,
                e.deskripsi,
                pemasukan,
                pengeluaran,
                status_approval,
            ]
        )

    filename_suffix = f"-{periode}" if periode else ""
    filename = f"buku-kas-{komunitas_nama.lower().replace(' ', '-')}{filename_suffix}.{format}"

    if format == "csv":
        out = io.StringIO()
        writer = csv.writer(out)
        for r in rows:
            writer.writerow(r)
        return Response(
            content=out.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    else:
        xlsx_bytes = build_minimal_xlsx(sheet_name="Buku Kas", rows=rows)
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@router.get("/export/tagihan")
def export_tagihan_rekap(
    format: str = Query(..., pattern="^(csv|xlsx)$"),
    periode: str | None = None,  # "YYYY-MM" optional
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    """Export billing / dues records for admin's owned dues to CSV or XLSX (Admin only)."""
    komunitas = db.query(Komunitas).filter(Komunitas.id == user.komunitas_id).first()
    komunitas_nama = komunitas.nama if komunitas else "Komunitas"

    query = (
        db.query(Tagihan)
        .filter(Tagihan.komunitas_id == user.komunitas_id)
        .join(Tagihan.iuran_type)
        .filter((IuranType.admin_id == user.id) | (IuranType.admin_id.is_(None)))
        .order_by(Tagihan.periode.desc())
    )
    if periode:
        query = query.filter(Tagihan.periode == periode)

    tagihans = query.all()

    rows: list[list] = [
        [
            "No",
            "Periode",
            "Nama Warga",
            "Jenis Iuran",
            "Nominal (Rp)",
            "Status",
            "Metode Pembayaran",
            "Tanggal Bayar",
        ]
    ]

    for idx, t in enumerate(tagihans, start=1):
        paid_str = t.paid_at.strftime("%Y-%m-%d %H:%M") if t.paid_at else "-"
        method_str = t.payment_method.value if t.payment_method else "-"
        status_label = "Lunas" if t.status == TagihanStatus.lunas else "Belum Bayar"
        rows.append(
            [
                idx,
                t.periode,
                t.warga.nama,
                t.iuran_type.nama,
                t.nominal,
                status_label,
                method_str,
                paid_str,
            ]
        )

    filename_suffix = f"-{periode}" if periode else ""
    filename = f"rekap-tagihan-{komunitas_nama.lower().replace(' ', '-')}{filename_suffix}.{format}"

    if format == "csv":
        out = io.StringIO()
        writer = csv.writer(out)
        for r in rows:
            writer.writerow(r)
        return Response(
            content=out.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    else:
        xlsx_bytes = build_minimal_xlsx(sheet_name="Rekap Tagihan", rows=rows)
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
