"""Tests: warga CRUD, scoped to a komunitas, role-gated."""


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_create_and_list_warga(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/warga",
        json={
            "nama": "Budi Santoso",
            "no_hp": "0812345678",
            "alamat": "Jl. Mawar 1",
            "no_rumah": "A1",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    warga = resp.json()
    assert warga["nama"] == "Budi Santoso"
    assert warga["aktif"] is True

    resp = client.get("/api/warga", headers=auth_headers(token))
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_update_warga(client, admin_setup):
    token = admin_setup["admin_token"]
    create_resp = client.post(
        "/api/warga",
        json={"nama": "Siti", "no_hp": "08123", "no_rumah": "A-1"},
        headers=auth_headers(token),
    )
    warga_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/warga/{warga_id}",
        json={
            "nama": "Siti Nurhaliza",
            "no_hp": "08129999",
            "no_rumah": "B-2",
            "alamat": "Jl. Mawar No. 5",
            "aktif": False,
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["nama"] == "Siti Nurhaliza"
    assert data["no_hp"] == "08129999"
    assert data["no_rumah"] == "B-2"
    assert data["alamat"] == "Jl. Mawar No. 5"
    assert data["aktif"] is False


def test_delete_warga(client, admin_setup):
    token = admin_setup["admin_token"]
    create_resp = client.post("/api/warga", json={"nama": "Joko"}, headers=auth_headers(token))
    warga_id = create_resp.json()["id"]

    resp = client.delete(f"/api/warga/{warga_id}", headers=auth_headers(token))
    assert resp.status_code == 204

    resp = client.get(f"/api/warga/{warga_id}", headers=auth_headers(token))
    assert resp.status_code == 404


def test_warga_requires_auth(client):
    resp = client.get("/api/warga")
    assert resp.status_code == 401


def test_ketua_can_create_warga(client, admin_setup):
    token = admin_setup["ketua_token"]
    resp = client.post("/api/warga", json={"nama": "Boleh Sekarang"}, headers=auth_headers(token))
    assert resp.status_code == 201


def test_ketua_can_update_warga(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]
    create_resp = client.post(
        "/api/warga", json={"nama": "Edi"}, headers=auth_headers(admin_token)
    )
    warga_id = create_resp.json()["id"]

    resp = client.put(
        f"/api/warga/{warga_id}",
        json={"nama": "Edi Updated"},
        headers=auth_headers(ketua_token),
    )
    assert resp.status_code == 200
    assert resp.json()["nama"] == "Edi Updated"


def test_ketua_can_delete_warga(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]
    create_resp = client.post(
        "/api/warga", json={"nama": "Dihapus"}, headers=auth_headers(admin_token)
    )
    warga_id = create_resp.json()["id"]

    resp = client.delete(f"/api/warga/{warga_id}", headers=auth_headers(ketua_token))
    assert resp.status_code == 204
