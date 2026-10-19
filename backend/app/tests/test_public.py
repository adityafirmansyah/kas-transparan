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


def test_public_default_komunitas_uses_env_override(client, admin_setup, monkeypatch):
    from app.core.config import settings

    # Create a second komunitas, more recent than admin_setup's
    other_resp = client.post(
        "/api/komunitas",
        json={"nama": "RW Lain", "slug": "rw-lain"},
    )
    assert other_resp.status_code == 201

    # Without override: should pick the most-recent (rw-lain)
    resp_default = client.get("/api/public/default-komunitas")
    assert resp_default.json()["slug"] == "rw-lain"

    # With PUBLIC_PORTAL_SLUG set: should pick the configured slug instead
    monkeypatch.setattr(settings, "PUBLIC_PORTAL_SLUG", admin_setup["komunitas"]["slug"])
    resp_override = client.get("/api/public/default-komunitas")
    assert resp_override.json()["slug"] == admin_setup["komunitas"]["slug"]


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


def test_public_summary_by_bendahara(client, db_session):
    from app.models.models import IuranType, KasEntry, Komunitas, User, UserRole

    kom = Komunitas(nama="Komunitas Bendahara Test", slug="kom-ben-test")
    db_session.add(kom)
    db_session.commit()

    b1 = User(
        komunitas_id=kom.id,
        username="bendahara_a",
        nama="Budi Bendahara",
        hashed_password="pwd",
        role=UserRole.admin,
    )
    b2 = User(
        komunitas_id=kom.id,
        username="bendahara_b",
        nama="Siti Bendahara",
        hashed_password="pwd",
        role=UserRole.admin,
    )
    db_session.add_all([b1, b2])
    db_session.commit()

    iuran1 = IuranType(komunitas_id=kom.id, nama="Iuran Kebersihan", nominal=20000, admin_id=b1.id)
    iuran2 = IuranType(komunitas_id=kom.id, nama="Iuran Keamanan", nominal=50000, admin_id=b2.id)
    db_session.add_all([iuran1, iuran2])
    db_session.commit()

    # Entries for b1
    e1 = KasEntry(
        komunitas_id=kom.id,
        tipe="pemasukan",
        kategori="iuran",
        deskripsi="Iuran Kebersihan",
        nominal=100000,
        created_by=b1.id,
    )
    # Entries for b2
    e2 = KasEntry(
        komunitas_id=kom.id,
        tipe="pemasukan",
        kategori="iuran",
        deskripsi="Iuran Keamanan",
        nominal=250000,
        created_by=b2.id,
    )
    db_session.add_all([e1, e2])
    db_session.commit()

    # 1. Overall Community Summary
    all_resp = client.get(f"/api/public/{kom.slug}/summary")
    assert all_resp.status_code == 200
    all_data = all_resp.json()
    assert all_data["saldo_akhir"] == 350000.0
    assert len(all_data["available_bendaharas"]) == 2
    assert all_data["bendahara_username"] is None

    # 2. Scoped to bendahara_a
    b1_resp = client.get(f"/api/public/{kom.slug}/bendahara_a/summary")
    assert b1_resp.status_code == 200
    b1_data = b1_resp.json()
    assert b1_data["saldo_akhir"] == 100000.0
    assert b1_data["bendahara_username"] == "bendahara_a"
    assert b1_data["bendahara_nama"] == "Budi Bendahara"
    assert b1_data["bendahara_iuran"] == "Iuran Kebersihan"

    # 3. Scoped to bendahara_b
    b2_resp = client.get(f"/api/public/{kom.slug}/bendahara_b/summary")
    assert b2_resp.status_code == 200
    b2_data = b2_resp.json()
    assert b2_data["saldo_akhir"] == 250000.0
    assert b2_data["bendahara_username"] == "bendahara_b"

    # 4. Unknown bendahara -> 404
    bad_resp = client.get(f"/api/public/{kom.slug}/bendahara_unknown/summary")
    assert bad_resp.status_code == 404


def test_public_entries_privacy_and_pagination(client, db_session):
    from app.models.models import IuranType, KasEntry, Komunitas, Tagihan, User, UserRole, Warga

    kom = Komunitas(nama="Kom Entri Test", slug="kom-entri-test")
    db_session.add(kom)
    db_session.commit()

    admin = User(
        komunitas_id=kom.id, username="admin_entri", hashed_password="pwd", role=UserRole.admin
    )
    warga = Warga(komunitas_id=kom.id, nama="Bpk Rahasia Pribadi")
    db_session.add_all([admin, warga])
    db_session.commit()

    iuran = IuranType(komunitas_id=kom.id, nama="Kas Warga", nominal=15000, admin_id=admin.id)
    db_session.add(iuran)
    db_session.commit()

    tagihan = Tagihan(
        komunitas_id=kom.id,
        warga_id=warga.id,
        iuran_type_id=iuran.id,
        periode="2026-10",
        nominal=15000,
    )
    db_session.add(tagihan)
    db_session.commit()

    entry = KasEntry(
        komunitas_id=kom.id,
        tipe="pemasukan",
        kategori="iuran",
        deskripsi=f"Pembayaran Kas Warga - {warga.nama} (2026-10)",
        nominal=15000,
        tagihan_id=tagihan.id,
        created_by=admin.id,
    )
    db_session.add(entry)
    db_session.commit()

    # Verify combined aggregation mode (default)
    resp = client.get(f"/api/public/{kom.slug}/entries?combine_iuran=true")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    item = data["items"][0]
    assert "Total Kas Warga Masuk" in item["deskripsi"]

    # Verify itemized mode
    resp_raw = client.get(f"/api/public/{kom.slug}/entries?combine_iuran=false")
    assert resp_raw.status_code == 200
    assert resp_raw.json()["total"] == 1
    # Verify resident name is sanitized out
    assert "Bpk Rahasia Pribadi" not in resp_raw.json()["items"][0]["deskripsi"]
    assert "Kas Warga" in resp_raw.json()["items"][0]["deskripsi"]
