"""Buku kas (cash ledger) router.

- Pemasukan: can be entered manually (e.g. donasi) in addition to the
  automatic entries created when a tagihan is paid.
- Pengeluaran: created with status=pending; requires a 'ketua' to approve
  or reject before it counts toward the running saldo. Rejected entries
  are excluded from saldo calculation.
- Saldo = sum(pemasukan.nominal) - sum(pengeluaran.nominal where approved).
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import IuranType, KasEntry, PengeluaranStatus, Tagihan, User
from app.schemas.schemas import ApprovalRequest, KasEntryOut, PemasukanCreate, PengeluaranCreate

router = APIRouter(prefix="/api/kas", tags=["kas"])


def compute_saldo_summary(
    db: Session, komunitas_id: str, user: User | None = None
) -> dict:
    """Computes total running cash balance and current-month breakdown.

    Returns:
        dict with keys:
          - saldo: running net cash balance
          - total_masuk_bulan_ini: total income in current month (YYYY-MM)
          - total_keluar_bulan_ini: total approved expenses in current month
          - periode: current month string (e.g. '2026-10')
    """
    entries = db.query(KasEntry).filter(KasEntry.komunitas_id == komunitas_id).all()
    if user is not None:
        entries = filter_kas_entries_by_pic(db, entries, user)

    current_month_str = datetime.utcnow().strftime("%Y-%m")
    total = 0.0
    masuk_bulan_ini = 0.0
    keluar_bulan_ini = 0.0

    for e in entries:
        tgl_str = e.tanggal.strftime("%Y-%m") if e.tanggal else ""
        if e.tipe == "pemasukan":
            total += e.nominal
            if tgl_str == current_month_str:
                masuk_bulan_ini += e.nominal
        elif e.tipe == "pengeluaran" and e.approval_status == PengeluaranStatus.approved:
            total -= e.nominal
            if tgl_str == current_month_str:
                keluar_bulan_ini += e.nominal

    return {
        "saldo": total,
        "total_masuk_bulan_ini": masuk_bulan_ini,
        "total_keluar_bulan_ini": keluar_bulan_ini,
        "periode": current_month_str,
    }


def compute_saldo(db: Session, komunitas_id: str, user: User | None = None) -> float:
    return compute_saldo_summary(db, komunitas_id, user=user)["saldo"]


@router.post("/pemasukan", response_model=KasEntryOut, status_code=201)
def create_pemasukan(
    payload: PemasukanCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    entry = KasEntry(
        komunitas_id=user.komunitas_id,
        tipe="pemasukan",
        kategori=payload.kategori,
        deskripsi=payload.deskripsi,
        nominal=payload.nominal,
        tanggal=payload.tanggal or __import__("datetime").date.today(),
        created_by=user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/pengeluaran", response_model=KasEntryOut, status_code=201)
def create_pengeluaran(
    payload: PengeluaranCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    entry = KasEntry(
        komunitas_id=user.komunitas_id,
        tipe="pengeluaran",
        kategori=payload.kategori,
        deskripsi=payload.deskripsi,
        nominal=payload.nominal,
        tanggal=payload.tanggal or __import__("datetime").date.today(),
        receipt_image_path=payload.receipt_image_path,
        approval_status=PengeluaranStatus.pending,
        created_by=user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.post("/pengeluaran/{entry_id}/approval", response_model=KasEntryOut)
def approve_or_reject_pengeluaran(
    entry_id: str,
    payload: ApprovalRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ketua")),
):
    entry = (
        db.query(KasEntry)
        .filter(
            KasEntry.id == entry_id,
            KasEntry.komunitas_id == user.komunitas_id,
            KasEntry.tipe == "pengeluaran",
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entri pengeluaran tidak ditemukan")
    if entry.approval_status != PengeluaranStatus.pending:
        raise HTTPException(status_code=400, detail="Entri sudah diproses sebelumnya")

    entry.approval_status = PengeluaranStatus(payload.status)
    entry.approved_by = user.id
    db.commit()
    db.refresh(entry)
    return entry


@router.get("", response_model=list[KasEntryOut])
def list_kas_entries(
    tipe: str | None = None,
    limit: int | None = Query(default=None, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    query = db.query(KasEntry).filter(KasEntry.komunitas_id == user.komunitas_id)
    if tipe:
        query = query.filter(KasEntry.tipe == tipe)
    entries = query.order_by(KasEntry.tanggal.desc()).all()
    filtered = filter_kas_entries_by_pic(db, entries, user)
    if offset > 0:
        filtered = filtered[offset:]
    if limit is not None:
        filtered = filtered[:limit]
    return filtered


def filter_kas_entries_by_pic(db: Session, entries: list[KasEntry], user: User) -> list[KasEntry]:
    """Scopes kas entries to the current admin's PIC ownership.

    - Entries auto-generated from a tagihan payment are scoped by the
      owning admin_id of that tagihan's iuran_type (unassigned PIC = shared).
    - Manual/unlinked entries (e.g. donasi, general pengeluaran) are scoped
      to their creator (created_by).
    - Ketua always sees everything, unfiltered.
    """
    if user.role.value != "admin":
        return entries

    tagihan_ids = [e.tagihan_id for e in entries if e.tagihan_id]
    tagihan_owner_map: dict[str, str | None] = {}
    if tagihan_ids:
        rows = (
            db.query(Tagihan.id, IuranType.admin_id)
            .join(IuranType, Tagihan.iuran_type_id == IuranType.id)
            .filter(Tagihan.id.in_(tagihan_ids))
            .all()
        )
        tagihan_owner_map = {tid: admin_id for tid, admin_id in rows}

    def _is_visible(entry: KasEntry) -> bool:
        if entry.tagihan_id:
            owner_admin_id = tagihan_owner_map.get(entry.tagihan_id)
            return owner_admin_id is None or owner_admin_id == user.id
        return entry.created_by == user.id

    return [e for e in entries if _is_visible(e)]


@router.get("/saldo")
def get_saldo(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    return compute_saldo_summary(db, user.komunitas_id, user=user)
