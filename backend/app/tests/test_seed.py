"""Tests for idempotent seeder and auto-seed on startup."""

from app.core.config import settings
from app.core.security import verify_password
from app.models.models import IuranType, Komunitas, User, UserRole, Warga
from app.seed import auto_seed_if_empty, seed_data


def test_seed_creates_expected_models(db_session):
    """Seed should create demo komunitas, admin, ketua, iuran types, and warga."""
    results = seed_data(db_session)

    # 1. Komunitas
    komunitas = db_session.query(Komunitas).filter(Komunitas.slug == "demo").first()
    assert komunitas is not None
    assert komunitas.nama == "RT 05 Sukamaju"
    assert komunitas.alamat == "Jl. Mawar No. 5"
    assert results["komunitas"].id == komunitas.id

    # 2. Users (admin and ketua)
    admin_user = (
        db_session.query(User)
        .filter(User.komunitas_id == komunitas.id, User.username == "admin")
        .first()
    )
    assert admin_user is not None
    assert admin_user.role == UserRole.admin
    assert verify_password("admin123", admin_user.hashed_password)

    ketua_user = (
        db_session.query(User)
        .filter(User.komunitas_id == komunitas.id, User.username == "ketua")
        .first()
    )
    assert ketua_user is not None
    assert ketua_user.role == UserRole.ketua
    assert verify_password("ketua123", ketua_user.hashed_password)

    # 3. Iuran Types
    iuran_types = db_session.query(IuranType).filter(IuranType.komunitas_id == komunitas.id).all()
    assert len(iuran_types) >= 2
    iuran_names = {it.nama: it.nominal for it in iuran_types}
    assert "Iuran Wajib Kebersihan & Keamanan" in iuran_names
    assert iuran_names["Iuran Wajib Kebersihan & Keamanan"] == 50000.0
    assert "Dana Sosial" in iuran_names
    assert iuran_names["Dana Sosial"] == 20000.0

    # 4. Warga
    warga_list = db_session.query(Warga).filter(Warga.komunitas_id == komunitas.id).all()
    assert len(warga_list) >= 3
    warga_names = {w.nama for w in warga_list}
    assert "Budi Santoso" in warga_names
    assert "Siti Rahma" in warga_names
    assert "Ahmad Fauzi" in warga_names


def test_seed_is_idempotent(db_session):
    """Calling seed_data multiple times must not crash or duplicate records."""
    # First run
    first_res = seed_data(db_session)
    assert len(first_res["users_created"]) == 2
    assert len(first_res["iuran_types_created"]) >= 2
    assert len(first_res["warga_created"]) >= 3

    komunitas_count_1 = db_session.query(Komunitas).count()
    user_count_1 = db_session.query(User).count()
    iuran_count_1 = db_session.query(IuranType).count()
    warga_count_1 = db_session.query(Warga).count()

    # Second run
    second_res = seed_data(db_session)
    assert len(second_res["users_created"]) == 0
    assert len(second_res["users_existing"]) == 2
    assert len(second_res["iuran_types_created"]) == 0
    assert len(second_res["warga_created"]) == 0

    komunitas_count_2 = db_session.query(Komunitas).count()
    user_count_2 = db_session.query(User).count()
    iuran_count_2 = db_session.query(IuranType).count()
    warga_count_2 = db_session.query(Warga).count()

    assert komunitas_count_1 == komunitas_count_2
    assert user_count_1 == user_count_2
    assert iuran_count_1 == iuran_count_2
    assert warga_count_1 == warga_count_2


def test_seeded_credentials_login(client, db_session):
    """Admin and ketua created by seed can successfully log in via API."""
    seed_data(db_session)

    # Admin login
    admin_resp = client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "admin123"},
    )
    assert admin_resp.status_code == 200
    admin_data = admin_resp.json()
    assert admin_data["role"] == "admin"
    assert "access_token" in admin_data

    # Ketua login
    ketua_resp = client.post(
        "/api/auth/login",
        json={"username": "ketua", "password": "ketua123"},
    )
    assert ketua_resp.status_code == 200
    ketua_data = ketua_resp.json()
    assert ketua_data["role"] == "ketua"
    assert "access_token" in ketua_data

    # Demo public transparency page accessible
    pub_resp = client.get("/api/public/demo/summary")
    assert pub_resp.status_code == 200
    assert pub_resp.json()["komunitas_nama"] == "RT 05 Sukamaju"


def test_auto_seed_if_empty_logic(db_session):
    """auto_seed_if_empty seeds an empty database and does nothing if populated."""
    # Fresh DB is empty -> auto_seed should return True
    seeded = auto_seed_if_empty(db_session)
    assert seeded is True
    assert db_session.query(Komunitas).filter(Komunitas.slug == "demo").count() == 1

    # Calling again on populated DB -> auto_seed should return False
    seeded_again = auto_seed_if_empty(db_session)
    assert seeded_again is False


def test_auto_seed_config_toggle(monkeypatch):
    """Settings can toggle AUTO_SEED."""
    monkeypatch.setattr(settings, "AUTO_SEED", False)
    assert settings.AUTO_SEED is False

    monkeypatch.setattr(settings, "AUTO_SEED", True)
    assert settings.AUTO_SEED is True
