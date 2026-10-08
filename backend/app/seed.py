"""Idempotent database seeder for kas-transparan."""

from __future__ import annotations

import logging
import sys
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

# Ensure backend root is on sys.path when run directly as a script
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.core.security import hash_password  # noqa: E402
from app.models.models import (  # noqa: E402
    IuranType,
    Komunitas,
    PeriodType,
    User,
    UserRole,
    Warga,
)

logger = logging.getLogger(__name__)

DEMO_KOMUNITAS = {
    "nama": "RT 05 Sukamaju",
    "slug": "demo",
    "alamat": "Jl. Mawar No. 5",
}

DEMO_USERS = [
    {
        "username": "admin",
        "password": "admin123",
        "nama": "Budi Santoso",
        "role": UserRole.admin,
    },
    {
        "username": "ketua",
        "password": "ketua123",
        "nama": "Siti Rahayu",
        "role": UserRole.ketua,
    },
]

DEMO_IURAN_TYPES = [
    {
        "nama": "Iuran Wajib Kebersihan & Keamanan",
        "nominal": 50000.0,
        "period_type": PeriodType.monthly,
        "aktif": True,
    },
    {
        "nama": "Dana Sosial",
        "nominal": 20000.0,
        "period_type": PeriodType.monthly,
        "aktif": True,
    },
    {
        "nama": "Iuran Kas RT",
        "nominal": 10000.0,
        "period_type": PeriodType.monthly,
        "aktif": True,
    },
]

DEMO_WARGA = [
    {
        "nama": "Budi Santoso",
        "no_rumah": "Blok A1",
        "alamat": "Jl. Mawar No. 5, RT 05",
        "no_hp": "081234567801",
        "aktif": True,
    },
    {
        "nama": "Siti Rahma",
        "no_rumah": "Blok A2",
        "alamat": "Jl. Mawar No. 5, RT 05",
        "no_hp": "081234567802",
        "aktif": True,
    },
    {
        "nama": "Ahmad Fauzi",
        "no_rumah": "Blok B1",
        "alamat": "Jl. Mawar No. 5, RT 05",
        "no_hp": "081234567803",
        "aktif": True,
    },
    {
        "nama": "Dewi Lestari",
        "no_rumah": "Blok B2",
        "alamat": "Jl. Mawar No. 5, RT 05",
        "no_hp": "081234567804",
        "aktif": True,
    },
]


def seed_data(db: Session | None = None) -> dict[str, Any]:
    """Seed the database with default demo data in an idempotent manner."""
    created_db = False
    session: Session
    if db is None:
        Base.metadata.create_all(bind=engine)
        session = SessionLocal()
        created_db = True
    else:
        session = db

    try:
        results: dict[str, Any] = {
            "komunitas": None,
            "users_created": [],
            "users_existing": [],
            "iuran_types_created": [],
            "iuran_types_existing": [],
            "warga_created": [],
            "warga_existing": [],
        }

        # 1. Komunitas
        komunitas = (
            session.query(Komunitas).filter(Komunitas.slug == DEMO_KOMUNITAS["slug"]).first()
        )
        if not komunitas:
            komunitas = Komunitas(
                nama=DEMO_KOMUNITAS["nama"],
                slug=DEMO_KOMUNITAS["slug"],
                alamat=DEMO_KOMUNITAS["alamat"],
            )
            session.add(komunitas)
            session.flush()
            logger.info("Created default demo komunitas: %s (%s)", komunitas.nama, komunitas.slug)
        else:
            logger.info("Demo komunitas already exists: %s (%s)", komunitas.nama, komunitas.slug)
        results["komunitas"] = komunitas

        # 2. Users
        for user_data in DEMO_USERS:
            existing_user = (
                session.query(User)
                .filter(
                    User.komunitas_id == komunitas.id,
                    User.username == user_data["username"],
                )
                .first()
            )
            if not existing_user:
                new_user = User(
                    komunitas_id=komunitas.id,
                    username=user_data["username"],
                    nama=user_data.get("nama"),
                    hashed_password=hash_password(user_data["password"]),
                    role=user_data["role"],
                )
                session.add(new_user)
                results["users_created"].append(user_data["username"])
                logger.info(
                    "Created demo user: %s (role: %s)",
                    user_data["username"],
                    user_data["role"].value,
                )
            else:
                results["users_existing"].append(user_data["username"])

            # 3. Iuran Types
        primary_admin = (
            session.query(User)
            .filter(User.komunitas_id == komunitas.id, User.role == "admin")
            .order_by(User.created_at.asc())
            .first()
        )
        for iuran_data in DEMO_IURAN_TYPES:
            existing_iuran = (
                session.query(IuranType)
                .filter(
                    IuranType.komunitas_id == komunitas.id,
                    IuranType.nama == iuran_data["nama"],
                )
                .first()
            )
            if not existing_iuran:
                new_iuran = IuranType(
                    komunitas_id=komunitas.id,
                    nama=iuran_data["nama"],
                    nominal=iuran_data["nominal"],
                    period_type=iuran_data["period_type"],
                    aktif=iuran_data["aktif"],
                    admin_id=primary_admin.id if primary_admin else None,
                )
                session.add(new_iuran)
                results["iuran_types_created"].append(iuran_data["nama"])
                logger.info("Created demo iuran type: %s", iuran_data["nama"])
            else:
                results["iuran_types_existing"].append(iuran_data["nama"])

        # 4. Warga
        for warga_data in DEMO_WARGA:
            existing_warga = (
                session.query(Warga)
                .filter(
                    Warga.komunitas_id == komunitas.id,
                    Warga.nama == warga_data["nama"],
                )
                .first()
            )
            if not existing_warga:
                new_warga = Warga(
                    komunitas_id=komunitas.id,
                    nama=warga_data["nama"],
                    no_rumah=warga_data["no_rumah"],
                    alamat=warga_data["alamat"],
                    no_hp=warga_data["no_hp"],
                    aktif=warga_data["aktif"],
                )
                session.add(new_warga)
                results["warga_created"].append(warga_data["nama"])
                logger.info(
                    "Created demo warga: %s (%s)", warga_data["nama"], warga_data["no_rumah"]
                )
            else:
                results["warga_existing"].append(warga_data["nama"])

        session.commit()
        if created_db:
            session.refresh(komunitas)
            session.expunge(komunitas)
        return results
    except Exception:
        session.rollback()
        raise
    finally:
        if created_db:
            session.close()


def auto_seed_if_empty(db: Session) -> bool:
    """Check if the database has 0 users or 0 communities, and seed if so."""
    komunitas_count = db.query(Komunitas).count()
    user_count = db.query(User).count()
    if komunitas_count == 0 or user_count == 0:
        seed_data(db)
        return True
    return False


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    print("Running kas-transparan database seeder...")
    result = seed_data()
    komunitas_obj = result["komunitas"]
    print("✓ Seed completed successfully:")
    print(f"  - Komunitas : {komunitas_obj.nama} (slug: '{komunitas_obj.slug}')")
    print(f"  - Users     : created {result['users_created']}, existing {result['users_existing']}")
    print(
        f"  - Iuran     : created {len(result['iuran_types_created'])}, "
        f"existing {len(result['iuran_types_existing'])}"
    )
    print(
        f"  - Warga     : created {len(result['warga_created'])}, "
        f"existing {len(result['warga_existing'])}"
    )
    print("\nDefault Credentials:")
    print("  Admin : admin / admin123")
    print("  Ketua : ketua / ketua123")
    print("  Public Transparency : /public/demo")
