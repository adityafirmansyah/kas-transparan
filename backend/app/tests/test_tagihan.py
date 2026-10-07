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


def test_batch_pay_tagihan_success_across_periods_and_iuran(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran1 = _setup_warga_and_iuran(client, token, n_warga=2)

    iuran2_resp = client.post(
        "/api/iuran-types",
        json={"nama": "Iuran Keamanan", "nominal": 30000, "period_type": "monthly"},
        headers=auth_headers(token),
    )
    iuran2 = iuran2_resp.json()

    gen1 = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran1["id"], "periode": "2025-01"},
        headers=auth_headers(token),
    ).json()

    gen2 = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran2["id"], "periode": "2025-02"},
        headers=auth_headers(token),
    ).json()

    # Collect 3 tagihan: 2 from gen1, 1 from gen2
    selected_ids = [gen1[0]["id"], gen1[1]["id"], gen2[0]["id"]]
    expected_total = 50000 + 50000 + 30000  # 130000

    resp = client.post(
        "/api/tagihan/batch-pay",
        json={"tagihan_ids": selected_ids, "payment_method": "transfer"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["paid_count"] == 3
    assert data["total_nominal"] == expected_total
    assert len(data["paid_tagihan"]) == 3
    for pt in data["paid_tagihan"]:
        assert pt["status"] == "lunas"
        assert pt["payment_method"] == "transfer"
        assert pt["paid_at"] is not None

    saldo_resp = client.get("/api/kas/saldo", headers=auth_headers(token))
    assert saldo_resp.json()["saldo"] == expected_total


def test_batch_pay_tagihan_empty_ids_fails(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/tagihan/batch-pay",
        json={"tagihan_ids": [], "payment_method": "tunai"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "kosong" in resp.json()["detail"].lower()


def test_batch_pay_tagihan_invalid_ids_fails(client, admin_setup):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/tagihan/batch-pay",
        json={"tagihan_ids": ["non-existent-id"], "payment_method": "tunai"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 404


def test_batch_pay_tagihan_already_paid_fails(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=2)
    gen = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-06"},
        headers=auth_headers(token),
    ).json()

    # Pay first one individually
    client.post(
        f"/api/tagihan/{gen[0]['id']}/pay",
        json={"payment_method": "tunai"},
        headers=auth_headers(token),
    )

    # Try batch pay both (one is already paid)
    resp = client.post(
        "/api/tagihan/batch-pay",
        json={"tagihan_ids": [gen[0]["id"], gen[1]["id"]], "payment_method": "tunai"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "sudah lunas" in resp.json()["detail"].lower()


def test_batch_pay_role_permissions(client, admin_setup):
    admin_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]
    komunitas_id = admin_setup["komunitas"]["id"]

    # Create warga user
    client.post(
        f"/api/komunitas/{komunitas_id}/users",
        json={"username": "warga_batch", "password": "secret123", "role": "warga"},
        headers=auth_headers(ketua_token),
    )
    warga_login = client.post(
        "/api/auth/login", json={"username": "warga_batch", "password": "secret123"}
    )
    warga_token = warga_login.json()["access_token"]

    warga_ids, iuran = _setup_warga_and_iuran(client, admin_token, n_warga=1)
    gen = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-07"},
        headers=auth_headers(admin_token),
    ).json()
    tagihan_id = gen[0]["id"]

    # Ketua rejected
    resp_ketua = client.post(
        "/api/tagihan/batch-pay",
        json={"tagihan_ids": [tagihan_id], "payment_method": "tunai"},
        headers=auth_headers(ketua_token),
    )
    assert resp_ketua.status_code == 403

    # Warga rejected
    resp_warga = client.post(
        "/api/tagihan/batch-pay",
        json={"tagihan_ids": [tagihan_id], "payment_method": "tunai"},
        headers=auth_headers(warga_token),
    )
    assert resp_warga.status_code == 403

    # Unauthenticated rejected
    resp_unauth = client.post(
        "/api/tagihan/batch-pay",
        json={"tagihan_ids": [tagihan_id], "payment_method": "tunai"},
    )
    assert resp_unauth.status_code == 401

    # Admin succeeds
    resp_admin = client.post(
        "/api/tagihan/batch-pay",
        json={"tagihan_ids": [tagihan_id], "payment_method": "tunai"},
        headers=auth_headers(admin_token),
    )
    assert resp_admin.status_code == 200


def test_record_future_payment_auto_generates_and_marks_paid(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)
    warga_id = warga_ids[0]

    # Future payment for 3 upcoming months: 2026-11, 2026-12, 2027-01
    items = [
        {"periode": "2026-11", "iuran_type_id": iuran["id"]},
        {"periode": "2026-12", "iuran_type_id": iuran["id"]},
        {"periode": "2027-01", "iuran_type_id": iuran["id"]},
    ]
    resp = client.post(
        "/api/tagihan/future-pay",
        json={
            "warga_id": warga_id,
            "items": items,
            "payment_method": "transfer",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_paid_count"] == 3
    assert data["total_nominal"] == 150000.0
    assert len(data["paid_tagihan"]) == 3
    for pt in data["paid_tagihan"]:
        assert pt["status"] == "lunas"
        assert pt["payment_method"] == "transfer"
        assert pt["paid_at"] is not None

    # Verify subsequent batch generate for that future month won't duplicate or overwrite
    gen_resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2026-11"},
        headers=auth_headers(token),
    )
    assert gen_resp.status_code == 201
    # Since this warga already has a tagihan for 2026-11, generate skips them
    assert len(gen_resp.json()) == 0


def test_record_future_payment_pays_existing_unpaid_bill(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)
    warga_id = warga_ids[0]

    # First generate unpaid bill for next month
    client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2026-11"},
        headers=auth_headers(token),
    )

    # Future pay for 2026-11 and 2026-12
    resp = client.post(
        "/api/tagihan/future-pay",
        json={
            "warga_id": warga_id,
            "items": [
                {"periode": "2026-11", "iuran_type_id": iuran["id"]},
                {"periode": "2026-12", "iuran_type_id": iuran["id"]},
            ],
            "payment_method": "tunai",
        },
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    assert resp.json()["total_paid_count"] == 2


def test_record_future_payment_rejects_already_paid(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)
    warga_id = warga_ids[0]

    items = [{"periode": "2026-11", "iuran_type_id": iuran["id"]}]
    # Pay once
    client.post(
        "/api/tagihan/future-pay",
        json={"warga_id": warga_id, "items": items, "payment_method": "tunai"},
        headers=auth_headers(token),
    )
    # Attempt to pay again for the same period
    resp = client.post(
        "/api/tagihan/future-pay",
        json={"warga_id": warga_id, "items": items, "payment_method": "tunai"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400
    assert "sudah lunas" in resp.json()["detail"].lower()
