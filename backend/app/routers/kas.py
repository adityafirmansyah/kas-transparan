"""Buku kas (cash ledger) router.

- Pemasukan: can be entered manually (e.g. donasi) in addition to the
  automatic entries created when a tagihan is paid.
- Pengeluaran: created with status=pending; requires a 'ketua' to approve
  or reject before it counts toward the running saldo. Rejected entries
  are excluded from saldo calculation.
- Saldo = sum(pemasukan.nominal) - sum(pengeluaran.nominal where approved).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import KasEntry, User, PengeluaranStatus
from app.schemas.schemas import PemasukanCreate, PengeluaranCreate, KasEntryOut, ApprovalRequest

router = APIRouter(prefix="/api/kas", tags=["kas"])


def compute_saldo(db: Session, komunitas_id: str) -> float:
    entries = db.query(KasEntry).filter(KasEntry.komunitas_id == komunitas_id).all()
    total = 0.0
    for e in entries:
        if e.tipe == "pemasukan":
            total += e.nominal
        elif e.tipe == "pengeluaran" and e.approval_status == PengeluaranStatus.approved:
            total -= e.nominal
    return total


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
    entry = db.query(KasEntry).filter(
        KasEntry.id == entry_id, KasEntry.komunitas_id == user.komunitas_id, KasEntry.tipe == "pengeluaran"
    ).first()
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
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    query = db.query(KasEntry).filter(KasEntry.komunitas_id == user.komunitas_id)
    if tipe:
        query = query.filter(KasEntry.tipe == tipe)
    return query.order_by(KasEntry.tanggal.desc()).all()


@router.get("/saldo")
def get_saldo(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    return {"saldo": compute_saldo(db, user.komunitas_id)}
