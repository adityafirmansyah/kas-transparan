"""Tests: buku kas ledger saldo calculation, pengeluaran approval workflow."""


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_pemasukan_increases_saldo(client, admin_setup):
    token = admin_setup["admin_token"]
    client.post(
        "/api/kas/pemasukan",
        json={"kategori": "donasi", "deskripsi": "Donasi warga", "nominal": 100000},
        headers=auth_headers(token),
    )

    resp = client.get("/api/kas/saldo", headers=auth_headers(token))
    assert resp.json()["saldo"] == 100000


def test_pengeluaran_pending_does_not_affect_saldo(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    client.post(
        "/api/kas/pemasukan",
        json={"kategori": "donasi", "deskripsi": "Donasi", "nominal": 200000},
        headers=auth_headers(admin_token),
    )

    pengeluaran_resp = client.post(
        "/api/kas/pengeluaran",
        json={"kategori": "kebersihan", "deskripsi": "Beli sapu", "nominal": 50000},
        headers=auth_headers(admin_token),
    )
    assert pengeluaran_resp.json()["approval_status"] == "pending"

    saldo_resp = client.get("/api/kas/saldo", headers=auth_headers(admin_token))
    assert saldo_resp.json()["saldo"] == 200000  # pengeluaran not yet approved


def test_pengeluaran_approved_by_ketua_reduces_saldo(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]

    client.post(
        "/api/kas/pemasukan",
        json={"kategori": "donasi", "deskripsi": "Donasi", "nominal": 200000},
        headers=auth_headers(admin_token),
    )
    pengeluaran_resp = client.post(
        "/api/kas/pengeluaran",
        json={"kategori": "kebersihan", "deskripsi": "Beli sapu", "nominal": 50000},
        headers=auth_headers(admin_token),
    )
    entry_id = pengeluaran_resp.json()["id"]

    approve_resp = client.post(
        f"/api/kas/pengeluaran/{entry_id}/approval",
        json={"status": "approved"},
        headers=auth_headers(ketua_token),
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["approval_status"] == "approved"

    saldo_resp = client.get("/api/kas/saldo", headers=auth_headers(admin_token))
    assert saldo_resp.json()["saldo"] == 150000


def test_pengeluaran_rejected_never_affects_saldo(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]

    client.post(
        "/api/kas/pemasukan",
        json={"kategori": "donasi", "deskripsi": "Donasi", "nominal": 100000},
        headers=auth_headers(admin_token),
    )
    pengeluaran_resp = client.post(
        "/api/kas/pengeluaran",
        json={"kategori": "lainnya", "deskripsi": "Pengeluaran ditolak", "nominal": 30000},
        headers=auth_headers(admin_token),
    )
    entry_id = pengeluaran_resp.json()["id"]

    client.post(
        f"/api/kas/pengeluaran/{entry_id}/approval",
        json={"status": "rejected"},
        headers=auth_headers(ketua_token),
    )

    saldo_resp = client.get("/api/kas/saldo", headers=auth_headers(admin_token))
    assert saldo_resp.json()["saldo"] == 100000


def test_admin_cannot_approve_pengeluaran(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    pengeluaran_resp = client.post(
        "/api/kas/pengeluaran",
        json={"kategori": "lainnya", "deskripsi": "x", "nominal": 1000},
        headers=auth_headers(admin_token),
    )
    entry_id = pengeluaran_resp.json()["id"]

    resp = client.post(
        f"/api/kas/pengeluaran/{entry_id}/approval",
        json={"status": "approved"},
        headers=auth_headers(admin_token),
    )
    assert resp.status_code == 403


def test_double_approval_rejected(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]
    pengeluaran_resp = client.post(
        "/api/kas/pengeluaran",
        json={"kategori": "lainnya", "deskripsi": "x", "nominal": 1000},
        headers=auth_headers(admin_token),
    )
    entry_id = pengeluaran_resp.json()["id"]

    client.post(
        f"/api/kas/pengeluaran/{entry_id}/approval",
        json={"status": "approved"},
        headers=auth_headers(ketua_token),
    )
    resp = client.post(
        f"/api/kas/pengeluaran/{entry_id}/approval",
        json={"status": "approved"},
        headers=auth_headers(ketua_token),
    )
    assert resp.status_code == 400


def test_kas_entries_scoped_by_pic_for_admin(client, admin_setup):
    admin1_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]
    komunitas_id = admin_setup["komunitas"]["id"]

    # Ketua creates a second admin
    resp_create_admin2 = client.post(
        f"/api/komunitas/{komunitas_id}/users",
        json={"username": "admin2kas", "password": "password123", "role": "admin"},
        headers=auth_headers(ketua_token),
    )
    assert resp_create_admin2.status_code == 201

    login_admin2 = client.post(
        "/api/auth/login", json={"username": "admin2kas", "password": "password123"}
    )
    admin2_token = login_admin2.json()["access_token"]

    # Admin 1 creates a manual pemasukan -> visible only to admin1
    client.post(
        "/api/kas/pemasukan",
        json={"kategori": "donasi", "deskripsi": "Donasi dari Admin1", "nominal": 50000},
        headers=auth_headers(admin1_token),
    )

    # Admin 2 creates a manual pemasukan -> visible only to admin2
    client.post(
        "/api/kas/pemasukan",
        json={"kategori": "donasi", "deskripsi": "Donasi dari Admin2", "nominal": 70000},
        headers=auth_headers(admin2_token),
    )

    # Admin1 creates own Iuran Kas and generates + pays a tagihan -> auto kas entry
    client.post("/api/warga", json={"nama": "Pak Warga Kas"}, headers=auth_headers(admin1_token))

    iuran_resp = client.post(
        "/api/iuran-types",
        json={"nama": "Iuran Kas Khusus", "nominal": 15000, "period_type": "monthly"},
        headers=auth_headers(admin1_token),
    )
    iuran_id = iuran_resp.json()["id"]

    gen_resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran_id, "periode": "2026-09"},
        headers=auth_headers(admin1_token),
    )
    tagihan_id = gen_resp.json()[0]["id"]

    client.post(
        f"/api/tagihan/{tagihan_id}/pay",
        json={"payment_method": "tunai"},
        headers=auth_headers(admin1_token),
    )

    # Admin1 list: sees own manual entry + own PIC-linked tagihan entry, NOT admin2's
    a1_entries = client.get("/api/kas", headers=auth_headers(admin1_token)).json()
    a1_descs = {e["deskripsi"] for e in a1_entries}
    assert "Donasi dari Admin1" in a1_descs
    assert "Donasi dari Admin2" not in a1_descs

    # Admin2 list: sees own manual entry only, NOT admin1's manual or PIC entries
    a2_entries = client.get("/api/kas", headers=auth_headers(admin2_token)).json()
    a2_descs = {e["deskripsi"] for e in a2_entries}
    assert "Donasi dari Admin2" in a2_descs
    assert "Donasi dari Admin1" not in a2_descs

    # Ketua sees EVERYTHING
    ketua_entries = client.get("/api/kas", headers=auth_headers(ketua_token)).json()
    ketua_descs = {e["deskripsi"] for e in ketua_entries}
    assert "Donasi dari Admin1" in ketua_descs
    assert "Donasi dari Admin2" in ketua_descs
