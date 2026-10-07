"""Tagihan (billing) router.

Core logic:
- generate_tagihan: for a given iuran_type + periode, create one Tagihan per
  active warga who doesn't already have one for that (iuran_type, periode)
  pair. Idempotent: re-running for the same periode skips existing rows.
- pay_tagihan: marks a tagihan lunas and creates a matching pemasukan
  KasEntry so the buku kas ledger stays in sync automatically.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import (
    IuranType,
    KasEntry,
    PaymentMethod,
    Tagihan,
    TagihanStatus,
    User,
    Warga,
)
from app.schemas.schemas import (
    BatchPayTagihanRequest,
    BatchPayTagihanResponse,
    GenerateTagihanRequest,
    PayTagihanRequest,
    RecordFuturePaymentRequest,
    RecordFuturePaymentResponse,
    TagihanOut,
    TagihanWithWargaOut,
)

router = APIRouter(prefix="/api/tagihan", tags=["tagihan"])


@router.post("/generate", response_model=list[TagihanOut], status_code=201)
def generate_tagihan(
    payload: GenerateTagihanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    iuran_type = (
        db.query(IuranType)
        .filter(IuranType.id == payload.iuran_type_id, IuranType.komunitas_id == user.komunitas_id)
        .first()
    )
    if not iuran_type:
        raise HTTPException(status_code=404, detail="Iuran type tidak ditemukan")

    active_warga = (
        db.query(Warga).filter(Warga.komunitas_id == user.komunitas_id, Warga.aktif.is_(True)).all()
    )

    existing_warga_ids = {
        t.warga_id
        for t in db.query(Tagihan)
        .filter(Tagihan.iuran_type_id == iuran_type.id, Tagihan.periode == payload.periode)
        .all()
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
        results.append(
            TagihanWithWargaOut(
                id=t.id,
                warga_id=t.warga_id,
                iuran_type_id=t.iuran_type_id,
                periode=t.periode,
                nominal=t.nominal,
                status=t.status.value,
                payment_method=t.payment_method.value if t.payment_method else None,
                proof_image_path=t.proof_image_path,
                paid_at=t.paid_at,
                warga_nama=t.warga.nama,
                iuran_nama=t.iuran_type.nama,
            )
        )
    return results


@router.post("/{tagihan_id}/pay", response_model=TagihanOut)
def pay_tagihan(
    tagihan_id: str,
    payload: PayTagihanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    tagihan = (
        db.query(Tagihan)
        .filter(Tagihan.id == tagihan_id, Tagihan.komunitas_id == user.komunitas_id)
        .first()
    )
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
        deskripsi=(
            f"Pembayaran {tagihan.iuran_type.nama} - {tagihan.warga.nama} ({tagihan.periode})"
        ),
        nominal=tagihan.nominal,
        tagihan_id=tagihan.id,
        created_by=user.id,
    )
    db.add(kas_entry)
    db.commit()
    db.refresh(tagihan)
    return tagihan


@router.post("/batch-pay", response_model=BatchPayTagihanResponse)
def batch_pay_tagihan(
    payload: BatchPayTagihanRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    if not payload.tagihan_ids:
        raise HTTPException(status_code=400, detail="Daftar tagihan tidak boleh kosong")

    # Fetch all tagihan in one query
    tagihans = (
        db.query(Tagihan)
        .filter(
            Tagihan.id.in_(payload.tagihan_ids),
            Tagihan.komunitas_id == user.komunitas_id,
        )
        .all()
    )

    if len(tagihans) != len(payload.tagihan_ids):
        raise HTTPException(
            status_code=404,
            detail="Beberapa tagihan tidak ditemukan atau tidak memiliki akses",
        )

    for t in tagihans:
        if t.status == TagihanStatus.lunas:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Tagihan {t.iuran_type.nama} ({t.periode}) untuk {t.warga.nama} sudah lunas"
                ),
            )

    now = datetime.utcnow()
    method = PaymentMethod(payload.payment_method)
    paid_list = []
    total_nominal = 0.0

    for t in tagihans:
        t.status = TagihanStatus.lunas
        t.payment_method = method
        t.proof_image_path = payload.proof_image_path
        t.paid_at = now

        kas_entry = KasEntry(
            komunitas_id=user.komunitas_id,
            tipe="pemasukan",
            kategori="iuran",
            deskripsi=(f"Pembayaran {t.iuran_type.nama} - {t.warga.nama} ({t.periode})"),
            nominal=t.nominal,
            tagihan_id=t.id,
            created_by=user.id,
        )
        db.add(kas_entry)
        total_nominal += t.nominal
        paid_list.append(t)

    db.commit()
    for t in paid_list:
        db.refresh(t)

    return BatchPayTagihanResponse(
        paid_count=len(paid_list),
        total_nominal=total_nominal,
        paid_tagihan=paid_list,
    )


@router.post("/future-pay", response_model=RecordFuturePaymentResponse)
def record_future_payment(
    payload: RecordFuturePaymentRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    """Record upfront/advance payment for a specific member across future periods.

    For each requested (periode, iuran_type_id) item:
      - Checks if a tagihan already exists for this warga & iuran & periode.
        If it does and is already paid, raises 400.
        If it exists and is unpaid, marks it as paid.
      - If it doesn't exist, auto-generates the tagihan specifically for this warga
        and marks it as paid immediately.
      - Automatically creates a corresponding KasEntry (pemasukan) for each item.
    """
    if not payload.items:
        raise HTTPException(status_code=400, detail="Daftar periode/iuran tidak boleh kosong")

    warga = (
        db.query(Warga)
        .filter(Warga.id == payload.warga_id, Warga.komunitas_id == user.komunitas_id)
        .first()
    )
    if not warga:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")

    # Validate all iuran types belong to this community
    iuran_type_ids = {it.iuran_type_id for it in payload.items}
    iuran_types = {
        it.id: it
        for it in db.query(IuranType)
        .filter(IuranType.id.in_(iuran_type_ids), IuranType.komunitas_id == user.komunitas_id)
        .all()
    }
    if len(iuran_types) != len(iuran_type_ids):
        raise HTTPException(
            status_code=404,
            detail="Beberapa jenis iuran tidak ditemukan di komunitas ini",
        )

    now = datetime.utcnow()
    method = PaymentMethod(payload.payment_method)
    paid_list = []
    total_nominal = 0.0

    for item in payload.items:
        iuran = iuran_types[item.iuran_type_id]

        tagihan = (
            db.query(Tagihan)
            .filter(
                Tagihan.komunitas_id == user.komunitas_id,
                Tagihan.warga_id == warga.id,
                Tagihan.iuran_type_id == item.iuran_type_id,
                Tagihan.periode == item.periode,
            )
            .first()
        )

        if tagihan:
            if tagihan.status == TagihanStatus.lunas:
                msg = f"Tagihan {iuran.nama} periode {item.periode} untuk {warga.nama} sudah lunas"
                raise HTTPException(status_code=400, detail=msg)
            tagihan.status = TagihanStatus.lunas
            tagihan.payment_method = method
            tagihan.proof_image_path = payload.proof_image_path
            tagihan.paid_at = now
        else:
            tagihan = Tagihan(
                komunitas_id=user.komunitas_id,
                warga_id=warga.id,
                iuran_type_id=item.iuran_type_id,
                periode=item.periode,
                nominal=iuran.nominal,
                status=TagihanStatus.lunas,
                payment_method=method,
                proof_image_path=payload.proof_image_path,
                paid_at=now,
            )
            db.add(tagihan)

        kas_entry = KasEntry(
            komunitas_id=user.komunitas_id,
            tipe="pemasukan",
            kategori="iuran",
            deskripsi=(f"Pembayaran {iuran.nama} - {warga.nama} ({item.periode})"),
            nominal=iuran.nominal,
            tagihan_id=tagihan.id,
            created_by=user.id,
        )
        db.add(kas_entry)
        total_nominal += iuran.nominal
        paid_list.append(tagihan)

    db.commit()
    for t in paid_list:
        db.refresh(t)

    return RecordFuturePaymentResponse(
        warga_id=warga.id,
        warga_nama=warga.nama,
        total_paid_count=len(paid_list),
        total_nominal=total_nominal,
        paid_tagihan=paid_list,
    )
