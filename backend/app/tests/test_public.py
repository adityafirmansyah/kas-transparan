"""Tests: public transparency page requires no auth and hides warga PII."""
import json


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_public_summary_requires_no_auth(client, admin_setup):
    slug = admin_setup["komunitas"]["slug"]
    resp = client.get(f"/api/public/{slug}/summary")
    assert resp.status_code == 200


def test_public_summary_unknown_slug_404(client):
    resp = client.get("/api/public/tidak-ada/summary")
    assert resp.status_code == 404


def test_public_summary_reflects_aggregate_numbers_only(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]
    slug = admin_setup["komunitas"]["slug"]

    client.post("/api/kas/pemasukan", json={
        "kategori": "donasi", "deskripsi": "Donasi dari Budi Santoso", "nominal": 100000
    }, headers=auth_headers(admin_token))
    pengeluaran_resp = client.post("/api/kas/pengeluaran", json={
        "kategori": "kebersihan", "deskripsi": "Beli sapu dan pel", "nominal": 40000
    }, headers=auth_headers(admin_token))
    client.post(f"/api/kas/pengeluaran/{pengeluaran_resp.json()['id']}/approval", json={
        "status": "approved"
    }, headers=auth_headers(ketua_token))

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

    client.post("/api/kas/pemasukan", json={
        "kategori": "donasi", "deskripsi": "Donasi", "nominal": 100000
    }, headers=auth_headers(admin_token))
    client.post("/api/kas/pengeluaran", json={
        "kategori": "lainnya", "deskripsi": "Belum disetujui", "nominal": 20000
    }, headers=auth_headers(admin_token))

    resp = client.get(f"/api/public/{slug}/summary")
    body = resp.json()
    assert body["saldo_akhir"] == 100000  # pending pengeluaran excluded
