"""Warga (resident) CRUD, scoped to the authenticated admin's komunitas."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.models import Warga, User
from app.schemas.schemas import WargaCreate, WargaUpdate, WargaOut

router = APIRouter(prefix="/api/warga", tags=["warga"])


@router.post("", response_model=WargaOut, status_code=201)
def create_warga(
    payload: WargaCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    warga = Warga(komunitas_id=user.komunitas_id, **payload.model_dump())
    db.add(warga)
    db.commit()
    db.refresh(warga)
    return warga


@router.get("", response_model=list[WargaOut])
def list_warga(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    return db.query(Warga).filter(Warga.komunitas_id == user.komunitas_id).order_by(Warga.nama).all()


@router.get("/{warga_id}", response_model=WargaOut)
def get_warga(
    warga_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    warga = db.query(Warga).filter(Warga.id == warga_id, Warga.komunitas_id == user.komunitas_id).first()
    if not warga:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")
    return warga


@router.put("/{warga_id}", response_model=WargaOut)
def update_warga(
    warga_id: str,
    payload: WargaUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    warga = db.query(Warga).filter(Warga.id == warga_id, Warga.komunitas_id == user.komunitas_id).first()
    if not warga:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(warga, field, value)
    db.commit()
    db.refresh(warga)
    return warga


@router.delete("/{warga_id}", status_code=204)
def delete_warga(
    warga_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    warga = db.query(Warga).filter(Warga.id == warga_id, Warga.komunitas_id == user.komunitas_id).first()
    if not warga:
        raise HTTPException(status_code=404, detail="Warga tidak ditemukan")
    db.delete(warga)
    db.commit()
    return None
