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

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.models.models import (
    IuranType,
    KasEntry,
    Komunitas,
    PengeluaranStatus,
    Tagihan,
    TagihanStatus,
    User,
    UserRole,
    Warga,
)
from app.routers.kas import get_pic_scoped_kas_query
from app.schemas.schemas import (
    BendaharaPublicInfo,
    DefaultKomunitasOut,
    PublicLedgerEntry,
    PublicLedgerPagination,
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


def _sanitize_public_desc(entry: KasEntry) -> str:
    """Sanitizes transaction description to protect resident household privacy."""
    if entry.tipe == "pemasukan" and entry.kategori == "iuran":
        if entry.tagihan and entry.tagihan.iuran_type:
            return f"Iuran {entry.tagihan.iuran_type.nama} ({entry.tagihan.periode})"
        return "Iuran Warga Masuk"
    return entry.deskripsi or ""


@router.get("/{slug}/summary", response_model=PublicSummary)
@router.get("/{slug}/{bendahara}/summary", response_model=PublicSummary)
def public_summary(
    slug: str,
    bendahara: str | None = None,
    periode: str | None = None,
    db: Session = Depends(get_db),
):
    komunitas = db.query(Komunitas).filter(Komunitas.slug == slug).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Komunitas tidak ditemukan")

    admins = (
        db.query(User)
        .filter(User.komunitas_id == komunitas.id, User.role == UserRole.admin)
        .order_by(User.created_at.asc())
        .all()
    )
    admin_ids = [a.id for a in admins]
    iuran_rows = (
        db.query(IuranType.admin_id, IuranType.nama)
        .filter(IuranType.komunitas_id == komunitas.id, IuranType.admin_id.in_(admin_ids))
        .all()
    )
    iuran_map = {aid: nama for aid, nama in iuran_rows}

    available_bendaharas = [
        BendaharaPublicInfo(
            username=a.username,
            nama=a.nama or a.username,
            iuran_nama=iuran_map.get(a.id),
        )
        for a in admins
    ]

    target_admin = None
    if bendahara:
        target_admin = next((a for a in admins if a.username == bendahara), None)
        if not target_admin:
            raise HTTPException(status_code=404, detail="Bendahara tidak ditemukan")

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

    base_query = get_pic_scoped_kas_query(db, komunitas.id, target_admin)
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
        bendahara_username=target_admin.username if target_admin else None,
        bendahara_nama=(target_admin.nama or target_admin.username) if target_admin else None,
        bendahara_iuran=iuran_map.get(target_admin.id) if target_admin else None,
        available_bendaharas=available_bendaharas,
    )


@router.get("/{slug}/entries", response_model=PublicLedgerPagination)
@router.get("/{slug}/{bendahara}/entries", response_model=PublicLedgerPagination)
def public_entries(
    slug: str,
    bendahara: str | None = None,
    tipe: str | None = None,
    combine_iuran: bool = Query(
        default=True,
        description="Whether to aggregate individual iuran payments into a single monthly sum",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=15, ge=1, le=100),
    db: Session = Depends(get_db),
):
    komunitas = db.query(Komunitas).filter(Komunitas.slug == slug).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Komunitas tidak ditemukan")

    target_admin = None
    if bendahara:
        target_admin = (
            db.query(User)
            .filter(
                User.komunitas_id == komunitas.id,
                User.username == bendahara,
                User.role == UserRole.admin,
            )
            .first()
        )
        if not target_admin:
            raise HTTPException(status_code=404, detail="Bendahara tidak ditemukan")

    base_query = get_pic_scoped_kas_query(db, komunitas.id, target_admin).filter(
        or_(
            KasEntry.tipe == "pemasukan",
            KasEntry.approval_status == PengeluaranStatus.approved,
        )
    )

    if tipe:
        base_query = base_query.filter(KasEntry.tipe == tipe)

    all_rows = base_query.order_by(KasEntry.tanggal.desc(), KasEntry.created_at.desc()).all()

    if combine_iuran:
        # Aggregate iuran per month, keeping other entries (pengeluaran, donasi, jimpitan) distinct
        months_order: list[str] = []
        month_other_entries: dict[str, list[KasEntry]] = {}
        monthly_iuran_map: dict[str, dict] = {}

        for e in all_rows:
            ym = e.tanggal.strftime("%Y-%m")
            if ym not in months_order:
                months_order.append(ym)
                month_other_entries[ym] = []

            if e.tipe == "pemasukan" and e.kategori == "iuran":
                if ym not in monthly_iuran_map:
                    monthly_iuran_map[ym] = {
                        "count": 0,
                        "nominal": 0.0,
                        "latest_tanggal": e.tanggal,
                        "id": f"iuran-agg-{ym}",
                        "iuran_nama": (
                            e.tagihan.iuran_type.nama
                            if e.tagihan and e.tagihan.iuran_type
                            else None
                        ),
                    }
                rec = monthly_iuran_map[ym]
                rec["count"] += 1
                rec["nominal"] += e.nominal
                if e.tanggal > rec["latest_tanggal"]:
                    rec["latest_tanggal"] = e.tanggal
            else:
                month_other_entries[ym].append(e)

        timeline: list[PublicLedgerEntry] = []
        for ym in months_order:
            # 1. Other distinct entries in this month (already sorted desc)
            for oe in month_other_entries[ym]:
                timeline.append(
                    PublicLedgerEntry(
                        id=oe.id,
                        tipe=oe.tipe,
                        kategori=oe.kategori,
                        nominal=oe.nominal,
                        tanggal=oe.tanggal,
                        deskripsi=oe.deskripsi,
                        receipt_image_path=oe.receipt_image_path,
                    )
                )
            # 2. Combined iuran summary for this month
            if ym in monthly_iuran_map:
                rec = monthly_iuran_map[ym]
                iuran_label = (
                    f"Total {rec['iuran_nama']}" if rec["iuran_nama"] else "Total Iuran Warga"
                )
                desc = (
                    f"{iuran_label} Masuk ({rec['count']} pembayaran)"
                    if rec["count"] > 1
                    else f"{iuran_label} Masuk"
                )
                timeline.append(
                    PublicLedgerEntry(
                        id=rec["id"],
                        tipe="pemasukan",
                        kategori="iuran",
                        nominal=rec["nominal"],
                        tanggal=rec["latest_tanggal"],
                        deskripsi=desc,
                        receipt_image_path=None,
                    )
                )

        total = len(timeline)
        total_pages = max(1, (total + page_size - 1) // page_size)
        offset = (page - 1) * page_size
        paginated_items = timeline[offset : offset + page_size]

        return PublicLedgerPagination(
            items=paginated_items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
        )

    # If combine_iuran is False, return itemized raw ledger
    total = len(all_rows)
    total_pages = max(1, (total + page_size - 1) // page_size)
    offset = (page - 1) * page_size
    rows = all_rows[offset : offset + page_size]

    items = [
        PublicLedgerEntry(
            id=e.id,
            tipe=e.tipe,
            kategori=e.kategori,
            nominal=e.nominal,
            tanggal=e.tanggal,
            deskripsi=_sanitize_public_desc(e),
            receipt_image_path=e.receipt_image_path,
        )
        for e in rows
    ]

    return PublicLedgerPagination(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
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
