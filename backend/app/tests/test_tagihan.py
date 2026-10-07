"""Tests: iuran type setup + tagihan auto-generation + payment recording."""


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _setup_warga_and_iuran(client, token, n_warga=3):
    warga_ids = []
    for i in range(n_warga):
        resp = client.post("/api/warga", json={"nama": f"Warga {i}"}, headers=auth_headers(token))
        warga_ids.append(resp.json()["id"])

    iuran_resp = client.post(
        "/api/iuran-types",
        json={"nama": "Iuran Kebersihan", "nominal": 50000, "period_type": "monthly"},
        headers=auth_headers(token),
    )
    return warga_ids, iuran_resp.json()


def test_generate_tagihan_creates_one_per_active_warga(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=3)

    resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-01"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    created = resp.json()
    assert len(created) == 3
    assert all(t["nominal"] == 50000 for t in created)
    assert all(t["status"] == "belum_bayar" for t in created)


def test_generate_tagihan_is_idempotent(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=2)

    client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-02"},
        headers=auth_headers(token),
    )

    second_resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-02"},
        headers=auth_headers(token),
    )
    assert second_resp.status_code == 201
    assert len(second_resp.json()) == 0  # no new tagihan, already exist

    list_resp = client.get(
        "/api/tagihan", params={"periode": "2025-02"}, headers=auth_headers(token)
    )
    assert len(list_resp.json()) == 2


def test_generate_tagihan_skips_inactive_warga(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=2)
    client.put(f"/api/warga/{warga_ids[0]}", json={"aktif": False}, headers=auth_headers(token))

    resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-03"},
        headers=auth_headers(token),
    )
    assert len(resp.json()) == 1


def test_pay_tagihan_marks_lunas_and_creates_kas_entry(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)

    gen_resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-04"},
        headers=auth_headers(token),
    )
    tagihan_id = gen_resp.json()[0]["id"]

    pay_resp = client.post(
        f"/api/tagihan/{tagihan_id}/pay",
        json={"payment_method": "transfer"},
        headers=auth_headers(token),
    )
    assert pay_resp.status_code == 200
    assert pay_resp.json()["status"] == "lunas"
    assert pay_resp.json()["payment_method"] == "transfer"

    saldo_resp = client.get("/api/kas/saldo", headers=auth_headers(token))
    assert saldo_resp.json()["saldo"] == 50000


def test_pay_already_paid_tagihan_fails(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)
    gen_resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-05"},
        headers=auth_headers(token),
    )
    tagihan_id = gen_resp.json()[0]["id"]

    client.post(
        f"/api/tagihan/{tagihan_id}/pay",
        json={"payment_method": "tunai"},
        headers=auth_headers(token),
    )
    second_pay = client.post(
        f"/api/tagihan/{tagihan_id}/pay",
        json={"payment_method": "tunai"},
        headers=auth_headers(token),
    )
    assert second_pay.status_code == 400
