"""Regression tests: the per-transfer proof image was removed by design.

Only the expense receipt (bukti struk) is kept. A payment records its method
(tunai/transfer) and nothing else, so bendahara are never asked to upload
m-banking screenshots for every resident payment.
"""

from app.models.models import Tagihan

PAY_ENDPOINTS = [
    ("/api/tagihan/{id}/pay", "pay"),
    ("/api/tagihan/batch-pay", "batch"),
    ("/api/tagihan/future-pay", "future"),
]


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_tagihan_model_has_no_proof_image_column():
    assert not hasattr(Tagihan, "proof_image_path")


def test_openapi_has_no_proof_image_field(client):
    """The wire contract must not advertise the removed field anywhere."""
    schema = client.get("/openapi.json").json()
    components = schema.get("components", {}).get("schemas", {})
    offenders = [
        name
        for name, definition in components.items()
        if "proof_image_path" in (definition.get("properties") or {})
    ]
    assert offenders == [], f"proof_image_path still exposed on: {offenders}"


def test_pay_endpoints_ignore_proof_image_path(client, admin_setup):
    """A legacy client sending the old field must not error, and it is discarded."""
    token = admin_setup["admin_token"]
    w = client.post(
        "/api/warga",
        headers=auth_headers(token),
        json={"nama": "Legacy Warga", "no_rumah": "Z-99", "no_hp": "081234567800"},
    ).json()
    iuran = client.post(
        "/api/iuran-types",
        headers=auth_headers(token),
        json={"nama": "Iuran Legacy", "nominal": 10000, "tipe": "wajib"},
    ).json()
    gen = client.post(
        "/api/tagihan/generate",
        headers=auth_headers(token),
        json={"iuran_type_id": iuran["id"], "periode": "2026-10"},
    ).json()
    tagihan = next(t for t in gen if t["warga_id"] == w["id"])

    # Old field supplied on purpose — must be accepted-and-ignored, not a 422.
    resp = client.post(
        f"/api/tagihan/{tagihan['id']}/pay",
        headers=auth_headers(token),
        json={"payment_method": "transfer", "proof_image_path": "/uploads/legacy.png"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "lunas"
    assert body["payment_method"] == "transfer"
    assert "proof_image_path" not in body
