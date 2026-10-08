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


def test_set_target_warga_restricts_tagihan_generation(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=4)

    # Target only 2 of the 4 warga
    targeted_ids = warga_ids[:2]
    resp_target = client.put(
        f"/api/iuran-types/{iuran['id']}/target-warga",
        json={"warga_ids": targeted_ids},
        headers=auth_headers(token),
    )
    assert resp_target.status_code == 200
    assert set(resp_target.json()["target_warga_ids"]) == set(targeted_ids)

    resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-02"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    created = resp.json()
    assert len(created) == 2
    assert {t["warga_id"] for t in created} == set(targeted_ids)


def test_empty_target_warga_falls_back_to_all_active(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=3)

    # Explicitly set, then clear back to empty (default = all)
    client.put(
        f"/api/iuran-types/{iuran['id']}/target-warga",
        json={"warga_ids": [warga_ids[0]]},
        headers=auth_headers(token),
    )
    resp_clear = client.put(
        f"/api/iuran-types/{iuran['id']}/target-warga",
        json={"warga_ids": []},
        headers=auth_headers(token),
    )
    assert resp_clear.status_code == 200
    assert resp_clear.json()["target_warga_ids"] == []

    resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran["id"], "periode": "2025-03"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 201
    assert len(resp.json()) == 3


def test_set_target_warga_rejects_unknown_warga_id(client, admin_setup):
    token = admin_setup["admin_token"]
    _, iuran = _setup_warga_and_iuran(client, token, n_warga=2)

    resp = client.put(
        f"/api/iuran-types/{iuran['id']}/target-warga",
        json={"warga_ids": ["nonexistent-id"]},
        headers=auth_headers(token),
    )
    assert resp.status_code == 400


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
        json={
            "username": "warga_batch",
            "password": "secret123",
            "nama": "Warga Batch",
            "role": "warga",
        },
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


def test_iuran_ownership_admin_separation(client, admin_setup):
    admin1_token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]
    komunitas_id = admin_setup["komunitas"]["id"]

    # Ketua creates a second admin
    resp_create_admin2 = client.post(
        f"/api/komunitas/{komunitas_id}/users",
        json={
            "username": "admin2",
            "password": "password123",
            "nama": "Admin Dua",
            "role": "admin",
        },
        headers=auth_headers(ketua_token),
    )
    assert resp_create_admin2.status_code == 201
    admin2_id = resp_create_admin2.json()["id"]

    login_admin2 = client.post(
        "/api/auth/login", json={"username": "admin2", "password": "password123"}
    )
    admin2_token = login_admin2.json()["access_token"]

    # Create warga
    w_resp = client.post(
        "/api/warga", json={"nama": "Pak RT Warga"}, headers=auth_headers(admin1_token)
    )
    assert w_resp.status_code == 201

    # Admin 1 creates Iuran "Kas" -> owned by Admin 1
    iuran_kas = client.post(
        "/api/iuran-types",
        json={"nama": "Iuran Kas", "nominal": 20000, "period_type": "monthly"},
        headers=auth_headers(admin1_token),
    ).json()
    assert iuran_kas["admin_id"] is not None

    # Admin 2 creates Iuran "Jalan" -> owned by Admin 2
    iuran_jalan = client.post(
        "/api/iuran-types",
        json={"nama": "Iuran Jalan", "nominal": 50000, "period_type": "monthly"},
        headers=auth_headers(admin2_token),
    ).json()
    assert iuran_jalan["admin_id"] == admin2_id

    # Admin 1 list_iuran_types only sees "Iuran Kas", not "Iuran Jalan"
    a1_list = client.get("/api/iuran-types", headers=auth_headers(admin1_token)).json()
    a1_names = {i["nama"] for i in a1_list}
    assert "Iuran Kas" in a1_names
    assert "Iuran Jalan" not in a1_names

    # Admin 2 list_iuran_types only sees "Iuran Jalan", not "Iuran Kas"
    a2_list = client.get("/api/iuran-types", headers=auth_headers(admin2_token)).json()
    a2_names = {i["nama"] for i in a2_list}
    assert "Iuran Jalan" in a2_names
    assert "Iuran Kas" not in a2_names

    # Ketua sees BOTH
    ketua_list = client.get("/api/iuran-types", headers=auth_headers(ketua_token)).json()
    ketua_names = {i["nama"] for i in ketua_list}
    assert "Iuran Kas" in ketua_names
    assert "Iuran Jalan" in ketua_names

    # Admin 2 generates tagihan for Jalan
    gen_jalan = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran_jalan["id"], "periode": "2026-10"},
        headers=auth_headers(admin2_token),
    )
    assert gen_jalan.status_code == 201
    tagihan_jalan_id = gen_jalan.json()[0]["id"]

    # Admin 1 attempts to generate tagihan for Jalan -> 403 Forbidden!
    gen_forbidden = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran_jalan["id"], "periode": "2026-11"},
        headers=auth_headers(admin1_token),
    )
    assert gen_forbidden.status_code == 403

    # Admin 1 attempts to pay tagihan Jalan -> 403 Forbidden!
    pay_forbidden = client.post(
        f"/api/tagihan/{tagihan_jalan_id}/pay",
        json={"payment_method": "tunai"},
        headers=auth_headers(admin1_token),
    )
    assert pay_forbidden.status_code == 403

    # Admin 1 attempts to batch-pay tagihan Jalan -> 403 Forbidden!
    batch_forbidden = client.post(
        "/api/tagihan/batch-pay",
        json={"tagihan_ids": [tagihan_jalan_id], "payment_method": "tunai"},
        headers=auth_headers(admin1_token),
    )
    assert batch_forbidden.status_code == 403

    # Admin 1 list_tagihan does NOT see tagihan Jalan
    a1_tagihan = client.get(
        "/api/tagihan", params={"periode": "2026-10"}, headers=auth_headers(admin1_token)
    ).json()
    assert all(t["iuran_type_id"] != iuran_jalan["id"] for t in a1_tagihan)

    # Admin 2 list_tagihan DOES see tagihan Jalan
    a2_tagihan = client.get(
        "/api/tagihan", params={"periode": "2026-10"}, headers=auth_headers(admin2_token)
    ).json()
    assert any(t["id"] == tagihan_jalan_id for t in a2_tagihan)

    # Ketua can reassign "Iuran Jalan" from Admin 2 to Admin 1
    reassign_resp = client.patch(
        f"/api/iuran-types/{iuran_jalan['id']}/reassign",
        json={"admin_id": admin_setup["admin_token"] and a1_list[0]["admin_id"]},
        headers=auth_headers(ketua_token),
    )
    assert reassign_resp.status_code == 200

    # Now Admin 1 CAN pay it
    pay_success = client.post(
        f"/api/tagihan/{tagihan_jalan_id}/pay",
        json={"payment_method": "tunai"},
        headers=auth_headers(admin1_token),
    )
    assert pay_success.status_code == 200
