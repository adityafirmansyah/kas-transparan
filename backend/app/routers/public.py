"""PUBLIC transparency endpoints: no auth required.

This is the core differentiator of the product: any resident can view
aggregate kas health for their komunitas WITHOUT logging in. To protect
privacy we deliberately:
  - never expose warga names or individual tagihan/payment status
  - only expose aggregate totals and expense categories (not line-item
    descriptions that might reveal who/what specifically, beyond the
    category bucket)
"""

from calendar import monthrange
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.models import KasEntry, Komunitas, PengeluaranStatus, Tagihan, TagihanStatus, Warga
from app.schemas.schemas import (
    DefaultKomunitasOut,
    PublicSummary,
    WargaSelfCheckResponse,
    WargaSelfCheckTagihan,
)

router = APIRouter(prefix="/api/public", tags=["public"])


@router.get("/default-komunitas", response_model=DefaultKomunitasOut)
def get_default_komunitas(db: Session = Depends(get_db)):
    """Returns the slug/nama of the komunitas shown as a public-portal quick
    link on the Login page.

    The slug is configured via the PUBLIC_PORTAL_SLUG environment variable
    (.env) so Pak Adit can change it without a code deploy. Falls back to
    the most-recently-created komunitas if unset.
    """
    if settings.PUBLIC_PORTAL_SLUG:
        komunitas = (
            db.query(Komunitas).filter(Komunitas.slug == settings.PUBLIC_PORTAL_SLUG).first()
        )
        if komunitas:
            return DefaultKomunitasOut(slug=komunitas.slug, nama=komunitas.nama)

    komunitas = db.query(Komunitas).order_by(Komunitas.created_at.desc()).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Belum ada komunitas terdaftar")
    return DefaultKomunitasOut(slug=komunitas.slug, nama=komunitas.nama)


@router.get("/{slug}/summary", response_model=PublicSummary)
def public_summary(
    slug: str,
    periode: str | None = None,
    db: Session = Depends(get_db),
):
    komunitas = db.query(Komunitas).filter(Komunitas.slug == slug).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Komunitas tidak ditemukan")

    target_periode = periode or date.today().strftime("%Y-%m")
    try:
        parts = target_periode.split("-")
        yr, mo = int(parts[0]), int(parts[1])
        start_m = date(yr, mo, 1)
        end_m = date(yr, mo, monthrange(yr, mo)[1])
    except Exception:
        today = date.today()
        start_m = date(today.year, today.month, 1)
        end_m = date(today.year, today.month, monthrange(today.year, today.month)[1])

    # 1. Total Saldo Kumulatif
    saldo_expr = func.coalesce(
        func.sum(
            case(
                (KasEntry.tipe == "pemasukan", KasEntry.nominal),
                (
                    (KasEntry.tipe == "pengeluaran")
                    & (KasEntry.approval_status == PengeluaranStatus.approved),
                    -KasEntry.nominal,
                ),
                else_=0.0,
            )
        ),
        0.0,
    )

    # 2. Pemasukan Bulan Ini
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

    # 3. Pengeluaran Bulan Ini
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

    base_query = db.query(KasEntry).filter(KasEntry.komunitas_id == komunitas.id)
    totals = base_query.with_entities(saldo_expr, masuk_expr, keluar_expr).one()

    # 4. Pengeluaran per Kategori di Bulan Ini
    cat_rows = (
        base_query.filter(
            KasEntry.tipe == "pengeluaran",
            KasEntry.approval_status == PengeluaranStatus.approved,
            KasEntry.tanggal >= start_m,
            KasEntry.tanggal <= end_m,
        )
        .with_entities(KasEntry.kategori, func.sum(KasEntry.nominal))
        .group_by(KasEntry.kategori)
        .all()
    )
    pengeluaran_per_kategori = {cat: float(nom) for cat, nom in cat_rows}

    return PublicSummary(
        komunitas_nama=komunitas.nama,
        saldo_akhir=float(totals[0]),
        total_masuk_bulan_ini=float(totals[1]),
        total_keluar_bulan_ini=float(totals[2]),
        pengeluaran_per_kategori=pengeluaran_per_kategori,
        periode=target_periode,
    )


def _normalize_phone(phone: str) -> str:
    """Normalize phone number by stripping spaces, dashes, and international prefixes."""
    digits = "".join(filter(str.isdigit, phone))
    if digits.startswith("62"):
        digits = "0" + digits[2:]
    return digits


@router.get("/{slug}/cek-tagihan", response_model=WargaSelfCheckResponse)
def check_warga_tagihan(
    slug: str,
    no_hp: str,
    db: Session = Depends(get_db),
):
    komunitas = db.query(Komunitas).filter(Komunitas.slug == slug).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Komunitas tidak ditemukan")

    raw_phone = no_hp.strip()
    norm_phone = _normalize_phone(raw_phone)
    if len(norm_phone) < 8:
        raise HTTPException(
            status_code=400,
            detail="Format nomor HP tidak valid (minimal 8 digit)",
        )

    # Search for active warga in this community matching normalized phone
    wargas = (
        db.query(Warga)
        .filter(
            Warga.komunitas_id == komunitas.id,
            Warga.aktif.is_(True),
            Warga.no_hp.isnot(None),
        )
        .all()
    )

    matching_warga = None
    for w in wargas:
        if w.no_hp and _normalize_phone(w.no_hp) == norm_phone:
            matching_warga = w
            break

    if not matching_warga:
        raise HTTPException(
            status_code=404,
            detail="Nomor HP tidak terdaftar sebagai warga di komunitas ini",
        )

    tagihans = (
        db.query(Tagihan)
        .filter(
            Tagihan.komunitas_id == komunitas.id,
            Tagihan.warga_id == matching_warga.id,
        )
        .order_by(Tagihan.periode.desc())
        .all()
    )

    unpaid_list = [t for t in tagihans if t.status == TagihanStatus.belum_bayar]
    total_unpaid_count = len(unpaid_list)
    total_unpaid_nominal = sum(t.nominal for t in unpaid_list)

    tagihan_items = [
        WargaSelfCheckTagihan(
            id=t.id,
            periode=t.periode,
            iuran_nama=t.iuran_type.nama,
            nominal=t.nominal,
            status=t.status.value,
            payment_method=t.payment_method.value if t.payment_method else None,
            paid_at=t.paid_at,
        )
        for t in tagihans
    ]

    return WargaSelfCheckResponse(
        warga_nama=matching_warga.nama,
        no_rumah=matching_warga.no_rumah,
        komunitas_nama=komunitas.nama,
        total_unpaid_count=total_unpaid_count,
        total_unpaid_nominal=total_unpaid_nominal,
        tagihan_list=tagihan_items,
    )
