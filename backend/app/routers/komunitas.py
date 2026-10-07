"""Komunitas (tenant) management + bootstrap of first admin user.

Creating a Komunitas is intentionally open (no auth) so a new RT/RW can
self-onboard; it immediately requires an initial admin account to be
created in the same call, after which all further actions go through auth.
"""

import re

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.security import hash_password
from app.models.models import Komunitas, User, UserRole
from app.schemas.schemas import (
    KomunitasCreate,
    KomunitasOut,
    KomunitasUpdate,
    UserCreate,
    UserOut,
)

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
    existing = (
        db.query(User)
        .filter(User.komunitas_id == komunitas_id, User.username == payload.username)
        .first()
    )
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


@router.get("/{komunitas_id}/users", response_model=list[UserOut])
def list_komunitas_users(
    komunitas_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin", "ketua")),
):
    if user.komunitas_id != komunitas_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tidak memiliki akses ke komunitas ini",
        )
    komunitas = db.query(Komunitas).filter(Komunitas.id == komunitas_id).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Komunitas tidak ditemukan")
    return db.query(User).filter(User.komunitas_id == komunitas_id).order_by(User.created_at).all()


@router.put("/{komunitas_id}", response_model=KomunitasOut)
@router.patch("/{komunitas_id}", response_model=KomunitasOut)
def update_komunitas(
    komunitas_id: str,
    payload: KomunitasUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    if user.komunitas_id != komunitas_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tidak memiliki akses ke komunitas ini",
        )
    komunitas = db.query(Komunitas).filter(Komunitas.id == komunitas_id).first()
    if not komunitas:
        raise HTTPException(status_code=404, detail="Komunitas tidak ditemukan")

    data = payload.model_dump(exclude_unset=True)

    if "nama" in data:
        nama = data["nama"].strip() if data["nama"] else ""
        if not nama:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Nama komunitas tidak boleh kosong",
            )
        komunitas.nama = nama

    if "slug" in data:
        slug = data["slug"].strip().lower() if data["slug"] else ""
        if not slug:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Slug tidak boleh kosong",
            )
        if not re.match(r"^[a-z0-9-]+$", slug):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung (-)",
            )
        if slug != komunitas.slug:
            existing = (
                db.query(Komunitas)
                .filter(Komunitas.slug == slug, Komunitas.id != komunitas_id)
                .first()
            )
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Slug sudah digunakan",
                )
        komunitas.slug = slug

    if "alamat" in data:
        komunitas.alamat = data["alamat"].strip() if data["alamat"] else None

    db.commit()
    db.refresh(komunitas)
    return komunitas
