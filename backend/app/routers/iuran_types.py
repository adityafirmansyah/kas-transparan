"""Iuran type CRUD: define recurring/one-time dues categories."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import IuranType, PeriodType, User
from app.schemas.schemas import IuranTypeCreate, IuranTypeOut

router = APIRouter(prefix="/api/iuran-types", tags=["iuran"])


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
    )
    db.add(iuran)
    db.commit()
    db.refresh(iuran)
    return iuran


@router.get("", response_model=list[IuranTypeOut])
def list_iuran_types(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    return db.query(IuranType).filter(IuranType.komunitas_id == user.komunitas_id).all()


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
    db.delete(iuran)
    db.commit()
    return None
