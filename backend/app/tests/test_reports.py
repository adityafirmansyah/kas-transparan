"""Tests: /api/reports/unpaid and /api/reports/tunggakan-multi (multi-month arrears)."""


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


def _generate(client, token, iuran_id, periode):
    resp = client.post(
        "/api/tagihan/generate",
        json={"iuran_type_id": iuran_id, "periode": periode},
        headers=auth_headers(token),
    )
    return resp.json()


def _pay(client, token, tagihan_id):
    client.post(
        f"/api/tagihan/{tagihan_id}/pay",
        json={"payment_method": "transfer"},
        headers=auth_headers(token),
    )


def test_tunggakan_multi_warga_unpaid_across_multiple_periods(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)

    _generate(client, token, iuran["id"], "2025-01")
    _generate(client, token, iuran["id"], "2025-02")
    _generate(client, token, iuran["id"], "2025-03")

    resp = client.get(
        "/api/reports/tunggakan-multi",
        params={"periode_start": "2025-01", "periode_end": "2025-03"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    entry = data[0]
    assert entry["warga_id"] == warga_ids[0]
    assert entry["total_unpaid_count"] == 3
    assert entry["distinct_months_count"] == 3
    assert entry["total_nominal"] == 150000
    assert {p["periode"] for p in entry["unpaid_periods"]} == {"2025-01", "2025-02", "2025-03"}


def test_tunggakan_multi_multiple_iuran_types_same_month(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran1 = _setup_warga_and_iuran(client, token, n_warga=1)
    iuran2 = client.post(
        "/api/iuran-types",
        json={"nama": "Dana Sosial", "nominal": 20000, "period_type": "monthly"},
        headers=auth_headers(token),
    ).json()

    # Generate 2 iuran types for 2 distinct months (total 4 tagihan, 2 months)
    _generate(client, token, iuran1["id"], "2025-01")
    _generate(client, token, iuran2["id"], "2025-01")
    _generate(client, token, iuran1["id"], "2025-02")
    _generate(client, token, iuran2["id"], "2025-02")

    resp = client.get(
        "/api/reports/tunggakan-multi",
        params={"periode_start": "2025-01", "periode_end": "2025-02"},
        headers=auth_headers(token),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    entry = data[0]
    # 4 unpaid bills total, but spanning only 2 distinct calendar months
    assert entry["total_unpaid_count"] == 4
    assert entry["distinct_months_count"] == 2
    assert all("tagihan_id" in p and p["tagihan_id"] for p in entry["unpaid_periods"])
    assert entry["total_nominal"] == 140000


def test_tunggakan_multi_warga_unpaid_only_one_period_in_range(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)

    gen_jan = _generate(client, token, iuran["id"], "2025-01")
    _generate(client, token, iuran["id"], "2025-02")

    # Pay January -> only February remains unpaid in range
    _pay(client, token, gen_jan[0]["id"])

    resp = client.get(
        "/api/reports/tunggakan-multi",
        params={"periode_start": "2025-01", "periode_end": "2025-02"},
        headers=auth_headers(token),
    )
    data = resp.json()
    assert len(data) == 1
    assert data[0]["total_unpaid_count"] == 1
    assert data[0]["unpaid_periods"][0]["periode"] == "2025-02"


def test_tunggakan_multi_warga_with_no_unpaid_in_range_excluded(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=2)

    gen = _generate(client, token, iuran["id"], "2025-01")
    # Pay warga 0's tagihan, leave warga 1's unpaid
    tagihan_for_warga0 = next(t for t in gen if t["warga_id"] == warga_ids[0])
    _pay(client, token, tagihan_for_warga0["id"])

    resp = client.get(
        "/api/reports/tunggakan-multi",
        params={"periode_start": "2025-01", "periode_end": "2025-01"},
        headers=auth_headers(token),
    )
    data = resp.json()
    assert len(data) == 1
    assert data[0]["warga_id"] == warga_ids[1]


def test_tunggakan_multi_range_boundary_inclusivity(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)

    _generate(client, token, iuran["id"], "2025-01")
    _generate(client, token, iuran["id"], "2025-02")
    _generate(client, token, iuran["id"], "2025-03")

    # Range excludes January and March -- only February should count
    resp = client.get(
        "/api/reports/tunggakan-multi",
        params={"periode_start": "2025-02", "periode_end": "2025-02"},
        headers=auth_headers(token),
    )
    data = resp.json()
    assert len(data) == 1
    assert data[0]["total_unpaid_count"] == 1
    assert data[0]["unpaid_periods"][0]["periode"] == "2025-02"


def test_tunggakan_multi_rejects_warga_role(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)
    _generate(client, token, iuran["id"], "2025-01")

    komunitas_id = admin_setup["komunitas"]["id"]
    client.post(
        f"/api/komunitas/{komunitas_id}/users",
        json={"username": "warga1", "password": "secret123", "role": "warga"},
    )
    warga_login = client.post(
        "/api/auth/login", json={"username": "warga1", "password": "secret123"}
    )
    warga_token = warga_login.json()["access_token"]

    resp = client.get(
        "/api/reports/tunggakan-multi",
        params={"periode_start": "2025-01", "periode_end": "2025-01"},
        headers=auth_headers(warga_token),
    )
    assert resp.status_code == 403


def test_tunggakan_multi_rejects_unauthenticated(client, admin_setup):
    token = admin_setup["admin_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)
    _generate(client, token, iuran["id"], "2025-01")

    resp = client.get(
        "/api/reports/tunggakan-multi",
        params={"periode_start": "2025-01", "periode_end": "2025-01"},
    )
    assert resp.status_code == 401


def test_tunggakan_multi_allows_ketua_role(client, admin_setup):
    token = admin_setup["admin_token"]
    ketua_token = admin_setup["ketua_token"]
    warga_ids, iuran = _setup_warga_and_iuran(client, token, n_warga=1)
    _generate(client, token, iuran["id"], "2025-01")

    resp = client.get(
        "/api/reports/tunggakan-multi",
        params={"periode_start": "2025-01", "periode_end": "2025-01"},
        headers=auth_headers(ketua_token),
    )
    assert resp.status_code == 200
