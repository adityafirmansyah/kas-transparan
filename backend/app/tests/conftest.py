"""Pytest fixtures: isolated in-memory SQLite DB + TestClient per test."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def admin_setup(client):
    """Creates a komunitas + admin + ketua user, returns tokens and ids."""
    komunitas_resp = client.post(
        "/api/komunitas",
        json={"nama": "RT 05 Sukamaju", "slug": "rt05-sukamaju", "alamat": "Jl. Mawar No. 1"},
    )
    assert komunitas_resp.status_code == 201
    komunitas = komunitas_resp.json()

    client.post(
        f"/api/komunitas/{komunitas['id']}/users",
        json={
            "username": "admin1",
            "password": "secret123",
            "nama": "Admin Satu",
            "role": "admin",
        },
    )
    client.post(
        f"/api/komunitas/{komunitas['id']}/users",
        json={
            "username": "ketua1",
            "password": "secret123",
            "nama": "Ketua Satu",
            "role": "ketua",
        },
    )

    admin_login = client.post(
        "/api/auth/login", json={"username": "admin1", "password": "secret123"}
    )
    ketua_login = client.post(
        "/api/auth/login", json={"username": "ketua1", "password": "secret123"}
    )

    return {
        "komunitas": komunitas,
        "admin_token": admin_login.json()["access_token"],
        "ketua_token": ketua_login.json()["access_token"],
    }
