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
    second = client.post(
        f"/api/kas/pengeluaran/{entry_id}/approval",
        json={"status": "rejected"},
        headers=auth_headers(ketua_token),
    )
    assert second.status_code == 400
