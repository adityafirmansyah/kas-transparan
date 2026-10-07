"""Tagihan (billing) router.

Core logic:
- generate_tagihan: for a given iuran_type + periode, create one Tagihan per
  active warga who doesn't already have one for that (iuran_type, periode)
  pair. Idempotent: re-running for the same periode skips existing rows.
- pay_tagihan: marks a tagihan lunas and creates a matching pemasukan
  KasEntry so the buku kas ledger stays in sync automatically.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import Tagihan, Warga, IuranType, User, TagihanStatus, KasEntry, PaymentMethod
from app.schemas.schemas import (
    GenerateTagihanRequest, PayTagihanRequest, TagihanOut, TagihanWithWargaOut
)

router = APIRouter(prefix="/api/tagihan", tags=["tagihan"])


@router.post("/generate", response_model=list[TagihanOut], status_code=201)
def generate_tagihan(
    payload: GenerateTagihanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    iuran_type = db.query(IuranType).filter(
        IuranType.id == payload.iuran_type_id, IuranType.komunitas_id == user.komunitas_id
    ).first()
    if not iuran_type:
        raise HTTPException(status_code=404, detail="Iuran type tidak ditemukan")

    active_warga = db.query(Warga).filter(
        Warga.komunitas_id == user.komunitas_id, Warga.aktif.is_(True)
    ).all()

    existing_warga_ids = {
        t.warga_id
        for t in db.query(Tagihan).filter(
            Tagihan.iuran_type_id == iuran_type.id, Tagihan.periode == payload.periode
        ).all()
    }

    created = []
    for warga in active_warga:
        if warga.id in existing_warga_ids:
            continue
        tagihan = Tagihan(
            komunitas_id=user.komunitas_id,
            warga_id=warga.id,
            iuran_type_id=iuran_type.id,
            periode=payload.periode,
            nominal=iuran_type.nominal,
            status=TagihanStatus.belum_bayar,
        )
        db.add(tagihan)
        created.append(tagihan)

    db.commit()
    for t in created:
        db.refresh(t)
    return created


@router.get("", response_model=list[TagihanWithWargaOut])
def list_tagihan(
    periode: str | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    query = db.query(Tagihan).filter(Tagihan.komunitas_id == user.komunitas_id)
    if periode:
        query = query.filter(Tagihan.periode == periode)
    if status_filter:
        query = query.filter(Tagihan.status == TagihanStatus(status_filter))
    rows = query.all()

    results = []
    for t in rows:
        results.append(TagihanWithWargaOut(
            id=t.id, warga_id=t.warga_id, iuran_type_id=t.iuran_type_id,
            periode=t.periode, nominal=t.nominal, status=t.status.value,
            payment_method=t.payment_method.value if t.payment_method else None,
            proof_image_path=t.proof_image_path, paid_at=t.paid_at,
            warga_nama=t.warga.nama, iuran_nama=t.iuran_type.nama,
        ))
    return results


@router.post("/{tagihan_id}/pay", response_model=TagihanOut)
def pay_tagihan(
    tagihan_id: str,
    payload: PayTagihanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    tagihan = db.query(Tagihan).filter(
        Tagihan.id == tagihan_id, Tagihan.komunitas_id == user.komunitas_id
    ).first()
    if not tagihan:
        raise HTTPException(status_code=404, detail="Tagihan tidak ditemukan")
    if tagihan.status == TagihanStatus.lunas:
        raise HTTPException(status_code=400, detail="Tagihan sudah lunas")

    tagihan.status = TagihanStatus.lunas
    tagihan.payment_method = PaymentMethod(payload.payment_method)
    tagihan.proof_image_path = payload.proof_image_path
    tagihan.paid_at = datetime.utcnow()

    kas_entry = KasEntry(
        komunitas_id=user.komunitas_id,
        tipe="pemasukan",
        kategori="iuran",
        deskripsi=f"Pembayaran {tagihan.iuran_type.nama} - {tagihan.warga.nama} ({tagihan.periode})",
        nominal=tagihan.nominal,
        tagihan_id=tagihan.id,
        created_by=user.id,
    )
    db.add(kas_entry)
    db.commit()
    db.refresh(tagihan)
    return tagihan
