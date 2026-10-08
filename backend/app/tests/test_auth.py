"""Tests for authentication: login, /me, and password change."""


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_login_success(client, admin_setup):
    resp = client.post("/api/auth/login", json={"username": "admin1", "password": "secret123"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "admin"
    assert "access_token" in data
    assert data["nama"] == "Admin Satu"


def test_login_wrong_password(client, admin_setup):
    resp = client.post("/api/auth/login", json={"username": "admin1", "password": "wrongpass"})
    assert resp.status_code == 401


def test_get_me(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.get("/api/auth/me", headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "admin1"
    assert data["role"] == "admin"
    assert data["nama"] == "Admin Satu"


def test_update_me_nama_success(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.put("/api/auth/me", json={"nama": "Nama Baru Admin"}, headers=auth_headers(token))
    assert resp.status_code == 200
    assert resp.json()["nama"] == "Nama Baru Admin"

    # Confirm persisted
    me = client.get("/api/auth/me", headers=auth_headers(token))
    assert me.json()["nama"] == "Nama Baru Admin"


def test_update_me_nama_rejects_empty(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.put("/api/auth/me", json={"nama": "   "}, headers=auth_headers(token))
    assert resp.status_code == 400


def test_update_me_nama_requires_auth(client):
    resp = client.put("/api/auth/me", json={"nama": "Tanpa Login"})
    assert resp.status_code == 401


def test_change_password_success_and_relogin(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "secret123", "new_password": "newsecret456"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200

    # Old password should no longer work
    old_login = client.post("/api/auth/login", json={"username": "admin1", "password": "secret123"})
    assert old_login.status_code == 401

    # New password should work
    new_login = client.post(
        "/api/auth/login", json={"username": "admin1", "password": "newsecret456"}
    )
    assert new_login.status_code == 200


def test_change_password_ketua_role_allowed(client, admin_setup):
    token = admin_setup["ketua_token"]
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "secret123", "new_password": "newsecret456"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200


def test_change_password_wrong_current(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "wrongpass", "new_password": "newsecret456"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "salah" in resp.json()["detail"].lower()


def test_change_password_too_short(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "secret123", "new_password": "ab1"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "minimal" in resp.json()["detail"].lower()


def test_change_password_same_as_current(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "secret123", "new_password": "secret123"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400


def test_change_password_requires_auth(client):
    resp = client.post(
        "/api/auth/change-password",
        json={"current_password": "x", "new_password": "newsecret456"},
    )
    assert resp.status_code == 401
