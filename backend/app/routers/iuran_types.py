"""Iuran type CRUD: define recurring/one-time dues categories."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import IuranType, PeriodType, User
from app.schemas.schemas import IuranTypeCreate, IuranTypeOut, IuranTypeReassignRequest

router = APIRouter(prefix="/api/iuran-types", tags=["iuran"])


def _iuran_out(iuran: IuranType) -> IuranTypeOut:
    return IuranTypeOut(
        id=iuran.id,
        nama=iuran.nama,
        nominal=iuran.nominal,
        period_type=iuran.period_type.value,
        aktif=iuran.aktif,
        admin_id=iuran.admin_id,
        admin_username=iuran.admin_user.username if iuran.admin_user else None,
    )


@router.post("", response_model=IuranTypeOut, status_code=201)
def create_iuran_type(
    payload: IuranTypeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    iuran = IuranType(
        komunitas_id=user.komunitas_id,
        nama=payload.nama,
        nominal=payload.nominal,
        period_type=PeriodType(payload.period_type),
        aktif=payload.aktif,
        admin_id=user.id,
    )
    db.add(iuran)
    db.commit()
    db.refresh(iuran)
    return _iuran_out(iuran)


@router.get("", response_model=list[IuranTypeOut])
def list_iuran_types(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    """List dues types.

    Ketua sees all iuran types. Admin sees only iuran types they own (or unassigned fallback).
    """
    query = db.query(IuranType).filter(IuranType.komunitas_id == user.komunitas_id)
    if user.role.value == "admin":
        query = query.filter((IuranType.admin_id == user.id) | (IuranType.admin_id.is_(None)))
    return [_iuran_out(i) for i in query.all()]


@router.delete("/{iuran_type_id}", status_code=204)
def delete_iuran_type(
    iuran_type_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    iuran = (
        db.query(IuranType)
        .filter(IuranType.id == iuran_type_id, IuranType.komunitas_id == user.komunitas_id)
        .first()
    )
    if not iuran:
        raise HTTPException(status_code=404, detail="Iuran type tidak ditemukan")
    if iuran.admin_id and iuran.admin_id != user.id:
        raise HTTPException(
            status_code=403, detail="Hanya admin penanggung jawab yang dapat menghapus jenis iuran ini"
        )
    db.delete(iuran)
    db.commit()
    return None


@router.patch("/{iuran_type_id}/reassign", response_model=IuranTypeOut)
def reassign_iuran_type(
    iuran_type_id: str,
    payload: IuranTypeReassignRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ketua")),
):
    """Ketua can reassign PIC / owner of a dues type to another admin."""
    iuran = (
        db.query(IuranType)
        .filter(IuranType.id == iuran_type_id, IuranType.komunitas_id == user.komunitas_id)
        .first()
    )
    if not iuran:
        raise HTTPException(status_code=404, detail="Iuran type tidak ditemukan")

    target_admin = (
        db.query(User)
        .filter(
            User.id == payload.admin_id,
            User.komunitas_id == user.komunitas_id,
            User.role == "admin",
        )
        .first()
    )
    if not target_admin:
        raise HTTPException(status_code=404, detail="Admin tujuan tidak ditemukan di komunitas ini")

    iuran.admin_id = target_admin.id
    db.commit()
    db.refresh(iuran)
    return _iuran_out(iuran)
