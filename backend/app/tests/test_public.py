"""Tests: public transparency page requires no auth and hides warga PII."""

import json


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_public_summary_requires_no_auth(client, admin_setup):
    slug = admin_setup["komunitas"]["slug"]
    resp = client.get(f"/api/public/{slug}/summary")
    assert resp.status_code == 200


def test_public_default_komunitas_requires_no_auth(client, admin_setup):
    resp = client.get("/api/public/default-komunitas")
    assert resp.status_code == 200
    data = resp.json()
    assert data["slug"] == admin_setup["komunitas"]["slug"]
    assert data["nama"] == admin_setup["komunitas"]["nama"]


def test_public_summary_unknown_slug_404(client):
    resp = client.get("/api/public/tidak-ada/summary")
    assert resp.status_code == 404


def test_public_summary_reflects_aggregate_numbers_only(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]
    slug = admin_setup["komunitas"]["slug"]

    client.post(
        "/api/kas/pemasukan",
        json={"kategori": "donasi", "deskripsi": "Donasi dari Budi Santoso", "nominal": 100000},
        headers=auth_headers(admin_token),
    )
    pengeluaran_resp = client.post(
        "/api/kas/pengeluaran",
        json={"kategori": "kebersihan", "deskripsi": "Beli sapu dan pel", "nominal": 40000},
        headers=auth_headers(admin_token),
    )
    client.post(
        f"/api/kas/pengeluaran/{pengeluaran_resp.json()['id']}/approval",
        json={"status": "approved"},
        headers=auth_headers(ketua_token),
    )

    resp = client.get(f"/api/public/{slug}/summary")
    body = resp.json()
    assert body["saldo_akhir"] == 60000
    assert body["pengeluaran_per_kategori"]["kebersihan"] == 40000

    # Privacy: no warga name or line-item description should leak
    raw = json.dumps(body)
    assert "Budi Santoso" not in raw
    assert "Beli sapu dan pel" not in raw


def test_public_summary_excludes_pending_pengeluaran(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    slug = admin_setup["komunitas"]["slug"]

    client.post(
        "/api/kas/pemasukan",
        json={"kategori": "donasi", "deskripsi": "Donasi", "nominal": 100000},
        headers=auth_headers(admin_token),
    )
    client.post(
        "/api/kas/pengeluaran",
        json={"kategori": "lainnya", "deskripsi": "Belum disetujui", "nominal": 20000},
        headers=auth_headers(admin_token),
    )

    resp = client.get(f"/api/public/{slug}/summary")
    body = resp.json()
    assert body["saldo_akhir"] == 100000  # pending pengeluaran excluded


def test_public_warga_self_check_success(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    slug = admin_setup["komunitas"]["slug"]

    # Create warga with phone number
    warga_resp = client.post(
        "/api/warga",
        json={"nama": "Pak Hendra", "no_hp": "0812-3456-7890", "no_rumah": "Blok C-1"},
        headers=auth_headers(admin_token),
    )
    assert warga_resp.status_code == 201

    # Create iuran and generate tagihan
    iuran_resp = client.post(
        "/api/iuran-types",
        json={"nama": "Iuran Ronda", "nominal": 25000, "period_type": "monthly"},
        headers=auth_headers(admin_token),
    )
    iuran = iuran_resp.json()

    client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2026-10"},
        headers=auth_headers(admin_token),
    )

    # Self check with normalized phone (different format: e.g. international prefix 6281234567890)
    resp = client.get(f"/api/public/{slug}/cek-tagihan", params={"no_hp": "6281234567890"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["warga_nama"] == "Pak Hendra"
    assert data["no_rumah"] == "Blok C-1"
    assert data["total_unpaid_count"] == 1
    assert data["total_unpaid_nominal"] == 25000
    assert len(data["tagihan_list"]) == 1
    assert data["tagihan_list"][0]["status"] == "belum_bayar"
    assert data["tagihan_list"][0]["iuran_nama"] == "Iuran Ronda"


def test_public_warga_self_check_not_found(client, admin_setup):
    slug = admin_setup["komunitas"]["slug"]
    resp = client.get(f"/api/public/{slug}/cek-tagihan", params={"no_hp": "089999999999"})
    assert resp.status_code == 404
    assert "tidak terdaftar" in resp.json()["detail"].lower()


def test_public_warga_self_check_invalid_phone(client, admin_setup):
    slug = admin_setup["komunitas"]["slug"]
    resp = client.get(f"/api/public/{slug}/cek-tagihan", params={"no_hp": "123"})
    assert resp.status_code == 400
