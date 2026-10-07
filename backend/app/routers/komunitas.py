"""Komunitas (tenant) management + bootstrap of first admin user.

Creating a Komunitas is intentionally open (no auth) so a new RT/RW can
self-onboard; it immediately requires an initial admin account to be
created in the same call, after which all further actions go through auth.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import hash_password
from app.core.deps import get_current_user
from app.models.models import Komunitas, User, UserRole
from app.schemas.schemas import KomunitasCreate, KomunitasOut, UserCreate, UserOut

router = APIRouter(prefix="/api/komunitas", tags=["komunitas"])


@router.post("", response_model=KomunitasOut, status_code=status.HTTP_201_CREATED)
def create_komunitas(payload: KomunitasCreate, db: Session = Depends(get_db)):
    existing = db.query(Komunitas).filter(Komunitas.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Slug sudah digunakan")
    komunitas = Komunitas(nama=payload.nama, slug=payload.slug, alamat=payload.alamat)
    db.add(komunitas)
    db.commit()
    db.refresh(komunitas)
    return komunitas


@router.post("/{komunitas_id}/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(komunitas_id: str, payload: UserCreate, db: Session = Depends(get_db)):
    komunitas = db.query(Komunitas).filter(Komunitas.id == komunitas_id).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Komunitas tidak ditemukan")
    existing = db.query(User).filter(User.komunitas_id == komunitas_id, User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username sudah digunakan di komunitas ini")
    user = User(
        komunitas_id=komunitas_id,
        username=payload.username,
        hashed_password=hash_password(payload.password),
        role=UserRole(payload.role),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.get("/{komunitas_id}", response_model=KomunitasOut)
def get_komunitas(komunitas_id: str, db: Session = Depends(get_db)):
    komunitas = db.query(Komunitas).filter(Komunitas.id == komunitas_id).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Komunitas tidak ditemukan")
    return komunitas
