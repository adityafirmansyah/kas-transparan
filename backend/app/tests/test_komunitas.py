"""Tests for Komunitas router: settings update, user management, and guards."""


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_get_komunitas(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    resp = client.get(f"/api/komunitas/{komunitas_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == komunitas_id
    assert data["nama"] == "RT 05 Sukamaju"
    assert data["slug"] == "rt05-sukamaju"


def test_get_komunitas_not_found(client):
    resp = client.get("/api/komunitas/non-existent-id")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Komunitas tidak ditemukan"


def test_update_komunitas_success(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    token = admin_setup["admin_token"]

    payload = {
        "nama": "RT 05 Sukamaju Jaya",
        "slug": "rt05-sukamaju-jaya",
        "alamat": "Jl. Mawar No. 10B",
    }
    resp = client.put(
        f"/api/komunitas/{komunitas_id}",
        json=payload,
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["nama"] == "RT 05 Sukamaju Jaya"
    assert data["slug"] == "rt05-sukamaju-jaya"
    assert data["alamat"] == "Jl. Mawar No. 10B"

    # Verify public page is accessible under new slug
    public_resp = client.get("/api/public/rt05-sukamaju-jaya/summary")
    assert public_resp.status_code == 200


def test_update_komunitas_partial(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    token = admin_setup["admin_token"]

    resp = client.patch(
        f"/api/komunitas/{komunitas_id}",
        json={"nama": "RT 05 Sukamaju Updated"},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["nama"] == "RT 05 Sukamaju Updated"
    assert data["slug"] == admin_setup["komunitas"]["slug"]


def test_update_komunitas_same_slug_allowed(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    token = admin_setup["admin_token"]
    slug = admin_setup["komunitas"]["slug"]

    resp = client.put(
        f"/api/komunitas/{komunitas_id}",
        json={"nama": "RT 05 Sukamaju New Name", "slug": slug},
        headers=auth_header(token),
    )
    assert resp.status_code == 200
    assert resp.json()["slug"] == slug


def test_update_komunitas_unauthenticated_fails(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    resp = client.put(
        f"/api/komunitas/{komunitas_id}",
        json={"nama": "Hacked RT"},
    )
    assert resp.status_code == 401


def test_update_komunitas_ketua_forbidden(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    ketua_token = admin_setup["ketua_token"]
    resp = client.put(
        f"/api/komunitas/{komunitas_id}",
        json={"nama": "Ketua Changes Name"},
        headers=auth_header(ketua_token),
    )
    assert resp.status_code == 403


def test_update_komunitas_cross_tenant_forbidden(client, admin_setup):
    # Create another tenant
    resp2 = client.post(
        "/api/komunitas",
        json={"nama": "RW 02 Harmoni", "slug": "rw02-harmoni", "alamat": "Jl. Melati"},
    )
    assert resp2.status_code == 201
    other_komunitas = resp2.json()

    # Try updating other tenant using admin1 from tenant 1
    resp = client.put(
        f"/api/komunitas/{other_komunitas['id']}",
        json={"nama": "RW 02 Hijacked"},
        headers=auth_header(admin_setup["admin_token"]),
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "Tidak memiliki akses ke komunitas ini"


def test_update_komunitas_slug_duplicate_fails(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    token = admin_setup["admin_token"]

    # Create another tenant
    resp2 = client.post(
        "/api/komunitas",
        json={"nama": "RW 03 Indah", "slug": "rw03-indah"},
    )
    assert resp2.status_code == 201

    # Try to set tenant 1 slug to rw03-indah
    resp = client.put(
        f"/api/komunitas/{komunitas_id}",
        json={"slug": "rw03-indah"},
        headers=auth_header(token),
    )
    assert resp.status_code == 400
    assert "Slug sudah digunakan" in resp.json()["detail"]


def test_update_komunitas_invalid_slug_format(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    token = admin_setup["admin_token"]

    resp = client.put(
        f"/api/komunitas/{komunitas_id}",
        json={"slug": "invalid slug with spaces!"},
        headers=auth_header(token),
    )
    assert resp.status_code == 400
    assert "Slug hanya boleh berisi" in resp.json()["detail"]


def test_update_komunitas_empty_nama_fails(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    token = admin_setup["admin_token"]

    resp = client.put(
        f"/api/komunitas/{komunitas_id}",
        json={"nama": "   "},
        headers=auth_header(token),
    )
    assert resp.status_code == 400
    assert "Nama komunitas tidak boleh kosong" in resp.json()["detail"]


def test_list_komunitas_users_admin_and_ketua(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]

    # Admin lists users
    resp_admin = client.get(
        f"/api/komunitas/{komunitas_id}/users",
        headers=auth_header(admin_setup["admin_token"]),
    )
    assert resp_admin.status_code == 200
    users = resp_admin.json()
    assert len(users) >= 2
    usernames = {u["username"] for u in users}
    assert "admin1" in usernames
    assert "ketua1" in usernames

    # Ketua also can list users
    resp_ketua = client.get(
        f"/api/komunitas/{komunitas_id}/users",
        headers=auth_header(admin_setup["ketua_token"]),
    )
    assert resp_ketua.status_code == 200


def test_list_komunitas_users_unauthenticated(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]
    resp = client.get(f"/api/komunitas/{komunitas_id}/users")
    assert resp.status_code == 401


def test_list_komunitas_users_cross_tenant_forbidden(client, admin_setup):
    # Create another tenant
    resp2 = client.post(
        "/api/komunitas",
        json={"nama": "RW 04 Damai", "slug": "rw04-damai"},
    )
    assert resp2.status_code == 201
    other_komunitas = resp2.json()

    # Try listing other tenant's users
    resp = client.get(
        f"/api/komunitas/{other_komunitas['id']}/users",
        headers=auth_header(admin_setup["admin_token"]),
    )
    assert resp.status_code == 403


def test_create_user_in_komunitas(client, admin_setup):
    komunitas_id = admin_setup["komunitas"]["id"]

    resp = client.post(
        f"/api/komunitas/{komunitas_id}/users",
        json={"username": "bendahara2", "password": "password123", "role": "admin"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["username"] == "bendahara2"
    assert data["role"] == "admin"

    # Duplicate username in same tenant fails
    resp_dup = client.post(
        f"/api/komunitas/{komunitas_id}/users",
        json={"username": "bendahara2", "password": "password123", "role": "admin"},
    )
    assert resp_dup.status_code == 400
    assert "Username sudah digunakan" in resp_dup.json()["detail"]
