"""Tests for receipt image upload (pengeluaran / expense proof)."""

import io
from pathlib import Path

import pytest

from app.core.config import settings


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def upload_dir(tmp_path, monkeypatch):
    """Points UPLOAD_DIR at a temp dir so tests never touch the real uploads/."""
    monkeypatch.setattr(settings, "UPLOAD_DIR", str(tmp_path))
    return tmp_path


def _png_bytes() -> bytes:
    # Minimal valid PNG header + IHDR; enough to exercise the byte path.
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
        b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )


def test_upload_receipt_success(client, admin_setup, upload_dir):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/uploads/receipt",
        headers=auth_headers(token),
        files={"file": ("nota.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["receipt_image_path"].startswith("/api/uploads/receipts/")
    assert data["filename"].endswith(".png")

    # The bytes really landed on disk under the receipts subdir.
    stored = Path(settings.UPLOAD_DIR) / "receipts" / data["filename"]
    assert stored.is_file()
    assert stored.read_bytes() == _png_bytes()


def test_upload_receipt_rejects_non_image_extension(client, admin_setup, upload_dir):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/uploads/receipt",
        headers=auth_headers(token),
        files={"file": ("malicious.sh", io.BytesIO(b"#!/bin/sh\nrm -rf /"), "image/png")},
    )
    assert resp.status_code == 400
    assert "tidak didukung" in resp.json()["detail"].lower()


def test_upload_receipt_rejects_non_image_content_type(client, admin_setup, upload_dir):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/uploads/receipt",
        headers=auth_headers(token),
        files={"file": ("nota.png", io.BytesIO(b"plain text"), "text/plain")},
    )
    assert resp.status_code == 400
    assert "gambar" in resp.json()["detail"].lower()


def test_upload_receipt_rejects_oversized_file(client, admin_setup, upload_dir):
    token = admin_setup["admin_token"]
    oversized = b"\x89PNG" + b"\x00" * (5 * 1024 * 1024 + 10)
    resp = client.post(
        "/api/uploads/receipt",
        headers=auth_headers(token),
        files={"file": ("big.png", io.BytesIO(oversized), "image/png")},
    )
    assert resp.status_code == 413


def test_upload_receipt_rejects_empty_file(client, admin_setup, upload_dir):
    token = admin_setup["admin_token"]
    resp = client.post(
        "/api/uploads/receipt",
        headers=auth_headers(token),
        files={"file": ("empty.png", io.BytesIO(b""), "image/png")},
    )
    assert resp.status_code == 400


def test_upload_receipt_requires_auth(client, upload_dir):
    resp = client.post(
        "/api/uploads/receipt",
        files={"file": ("nota.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert resp.status_code == 401


def test_upload_receipt_forbidden_for_ketua(client, admin_setup, upload_dir):
    """Only the admin (bendahara) records expenses, matching /api/kas/pengeluaran."""
    token = admin_setup["ketua_token"]
    resp = client.post(
        "/api/uploads/receipt",
        headers=auth_headers(token),
        files={"file": ("nota.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert resp.status_code == 403


def test_get_receipt_roundtrip(client, admin_setup, upload_dir):
    admin = auth_headers(admin_setup["admin_token"])
    up = client.post(
        "/api/uploads/receipt",
        headers=admin,
        files={"file": ("nota.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    assert up.status_code == 201
    filename = up.json()["filename"]

    # admin can read it back
    got = client.get(f"/api/uploads/receipts/{filename}", headers=admin)
    assert got.status_code == 200
    assert got.content == _png_bytes()

    # ketua (approver) can read it too — they must inspect the nota
    got_ketua = client.get(
        f"/api/uploads/receipts/{filename}",
        headers=auth_headers(admin_setup["ketua_token"]),
    )
    assert got_ketua.status_code == 200


def test_get_receipt_requires_auth(client, admin_setup, upload_dir):
    admin = auth_headers(admin_setup["admin_token"])
    up = client.post(
        "/api/uploads/receipt",
        headers=admin,
        files={"file": ("nota.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    filename = up.json()["filename"]
    assert client.get(f"/api/uploads/receipts/{filename}").status_code == 401


def test_get_receipt_blocks_path_traversal(client, admin_setup, upload_dir):
    admin = auth_headers(admin_setup["admin_token"])
    # A traversal attempt must not escape the receipts dir.
    for evil in ["..%2F..%2Fetc%2Fpasswd", "....//passwd"]:
        resp = client.get(f"/api/uploads/receipts/{evil}", headers=admin)
        assert resp.status_code in (400, 404), f"{evil} -> {resp.status_code}"


def test_get_receipt_unknown_file_404(client, admin_setup, upload_dir):
    admin = auth_headers(admin_setup["admin_token"])
    resp = client.get("/api/uploads/receipts/deadbeefdeadbeef.png", headers=admin)
    assert resp.status_code == 404


def test_pengeluaran_stores_receipt_path(client, admin_setup, upload_dir):
    """The uploaded path is persisted on the pengeluaran entry and returned."""
    admin = auth_headers(admin_setup["admin_token"])
    up = client.post(
        "/api/uploads/receipt",
        headers=admin,
        files={"file": ("nota.png", io.BytesIO(_png_bytes()), "image/png")},
    )
    path = up.json()["receipt_image_path"]

    created = client.post(
        "/api/kas/pengeluaran",
        headers=admin,
        json={
            "kategori": "kebersihan",
            "deskripsi": "Beli sapu dan desinfektan",
            "nominal": 75000,
            "receipt_image_path": path,
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["receipt_image_path"] == path
