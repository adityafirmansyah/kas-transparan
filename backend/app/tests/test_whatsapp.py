"""Tests for WhatsApp notification service and billing receipt triggers."""

from datetime import UTC, datetime
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.services.whatsapp import (
    format_rupiah,
    normalize_phone_number,
    send_payment_receipt_notification,
    send_whatsapp_message,
)


def test_normalize_phone_number():
    assert normalize_phone_number("081234567890") == "6281234567890"
    assert normalize_phone_number("+62 812-3456-7890") == "6281234567890"
    assert normalize_phone_number("6281234567890") == "6281234567890"
    assert normalize_phone_number("81234567890") == "6281234567890"
    assert normalize_phone_number("0812.3456.7890") == "6281234567890"
    assert normalize_phone_number(None) is None
    assert normalize_phone_number("") is None
    assert normalize_phone_number("12345") is None  # Too short
    assert normalize_phone_number("0812" * 5) is None  # Too long


def test_normalize_phone_number_rejects_non_indonesian():
    """A stray non-Indonesian or malformed value must never become a recipient."""
    assert normalize_phone_number("+1 415 555 2671") is None  # US
    assert normalize_phone_number("+44 7911 123456") is None  # UK
    assert normalize_phone_number("1234567890") is None  # No 62/0/8 prefix
    assert normalize_phone_number("0062 812 3456 7890") is None  # Double prefix
    assert normalize_phone_number("00000000000000") is None
    assert normalize_phone_number("0215551234") is None  # Jakarta landline
    assert normalize_phone_number("62215551234") is None  # Landline, 62-prefixed


def test_format_wib_time_converts_utc_to_jakarta():
    """A receipt timestamp must never be UTC relabelled as WIB (7h off)."""
    from datetime import UTC, datetime

    from app.services.whatsapp import format_wib_time

    # 2026-10-12 11:43 UTC == 18:43 WIB the same day
    naive_utc = datetime(2026, 10, 12, 11, 43, 0)
    assert format_wib_time(naive_utc) == "12/10/2026 18:43"

    aware_utc = datetime(2026, 10, 12, 11, 43, 0, tzinfo=UTC)
    assert format_wib_time(aware_utc) == "12/10/2026 18:43"

    # A late-UTC instant rolls over to the next WIB day
    assert format_wib_time(datetime(2026, 10, 12, 18, 30, 0)) == "13/10/2026 01:30"


def test_format_rupiah():
    assert format_rupiah(25000) == "Rp 25.000"
    assert format_rupiah(1500000) == "Rp 1.500.000"
    assert format_rupiah(0) == "Rp 0"


def test_send_whatsapp_message_disabled():
    with patch.object(settings, "WHATSAPP_ENABLED", False):
        res = send_whatsapp_message("081234567890", "Test message")
        assert res is False


def test_send_whatsapp_message_invalid_phone():
    with patch.object(settings, "WHATSAPP_ENABLED", True):
        res = send_whatsapp_message("invalid", "Test message")
        assert res is False


@patch("app.services.whatsapp.httpx.Client")
def test_send_whatsapp_message_success(mock_client_cls):
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_client = MagicMock()
    mock_client.post.return_value = mock_resp
    mock_client_cls.return_value.__enter__.return_value = mock_client

    with (
        patch.object(settings, "WHATSAPP_ENABLED", True),
        patch.object(settings, "WHATSAPP_GATEWAY_URL", "https://gateway.example.com/send"),
        patch.object(settings, "WHATSAPP_API_KEY", "secret_key_123"),
    ):
        res = send_whatsapp_message("081234567890", "Halo test!")
        assert res is True
        mock_client.post.assert_called_once()
        args, kwargs = mock_client.post.call_args
        assert args[0] == "https://gateway.example.com/send"
        assert kwargs["headers"]["X-API-Key"] == "secret_key_123"
        assert kwargs["json"]["to"] == "6281234567890"
        assert kwargs["json"]["message"] == "Halo test!"


@patch("app.services.whatsapp.httpx.Client")
def test_send_whatsapp_message_gateway_error(mock_client_cls):
    mock_resp = MagicMock()
    mock_resp.status_code = 500
    mock_resp.text = "Internal Server Error"
    mock_client = MagicMock()
    mock_client.post.return_value = mock_resp
    mock_client_cls.return_value.__enter__.return_value = mock_client

    with (
        patch.object(settings, "WHATSAPP_ENABLED", True),
        patch.object(settings, "WHATSAPP_GATEWAY_URL", "https://gateway.example.com/send"),
    ):
        res = send_whatsapp_message("081234567890", "Test")
        assert res is False


@patch("app.services.whatsapp.send_whatsapp_message")
def test_send_payment_receipt_notification(mock_send):
    mock_send.return_value = True

    with patch.object(settings, "WHATSAPP_ENABLED", True):
        items = [
            {"iuran_nama": "Keamanan", "periode": "2026-10", "nominal": 30000},
            {"iuran_nama": "Kebersihan", "periode": "2026-10", "nominal": 20000},
        ]
        res = send_payment_receipt_notification(
            warga_nama="Budi Santoso",
            warga_no_hp="081234567890",
            items=items,
            total_nominal=50000,
            payment_method="transfer",
            komunitas_nama="RT 05 / RW 02",
            # Pinned instant: pins the WIB conversion at the CALL SITE, not just
            # in format_wib_time, so reverting to a raw strftime goes RED.
            paid_at=datetime(2026, 10, 12, 11, 43, tzinfo=UTC),
        )
        assert res is True
        mock_send.assert_called_once()
        to_arg, msg_arg = mock_send.call_args[0]
        assert to_arg == "081234567890"
        assert "RT 05 / RW 02" in msg_arg
        assert "Budi Santoso" in msg_arg
        assert "Keamanan (2026-10): Rp 30.000" in msg_arg
        assert "Rp 50.000" in msg_arg
        assert "Transfer Bank" in msg_arg
        assert "Waktu*: 12/10/2026 18:43 WIB" in msg_arg
        # The un-converted UTC clock must NOT appear (the 7-hour defect).
        assert "11:43 WIB" not in msg_arg


@patch("app.services.whatsapp.send_whatsapp_message")
def test_send_payment_receipt_notification_guards_bad_input(mock_send):
    """A None payment_method must not raise out of the background task."""
    mock_send.return_value = True

    with patch.object(settings, "WHATSAPP_ENABLED", True):
        res = send_payment_receipt_notification(
            warga_nama="Budi",
            warga_no_hp="081234567890",
            items=[{"iuran_nama": "Keamanan", "periode": "2026-10", "nominal": 1000}],
            total_nominal=1000,
            payment_method=None,  # type: ignore[arg-type]
            komunitas_nama="RT 05",
        )
        assert res is True


@patch("app.services.whatsapp.send_whatsapp_message")
def test_send_payment_receipt_notification_survives_bad_items(mock_send):
    """A malformed items payload is logged and reported, never raised."""
    mock_send.return_value = True

    with patch.object(settings, "WHATSAPP_ENABLED", True):
        res = send_payment_receipt_notification(
            warga_nama="Budi",
            warga_no_hp="081234567890",
            items=[{"nominal": "not-a-number"}],
            total_nominal=1000,
            payment_method="tunai",
            komunitas_nama="RT 05",
        )
        assert res is False
        mock_send.assert_not_called()


@patch("app.services.whatsapp.logger")
def test_api_key_never_logged(mock_logger):
    """The gateway API key must never appear in log output on failure."""
    with (
        patch.object(settings, "WHATSAPP_ENABLED", True),
        patch.object(settings, "WHATSAPP_GATEWAY_URL", "http://127.0.0.1:9/send"),
        patch.object(settings, "WHATSAPP_API_KEY", "SUPER_SECRET_KEY_XYZ"),
    ):
        assert send_whatsapp_message("081234567890", "hi") is False

    rendered = " ".join(str(c) for c in mock_logger.method_calls)
    assert "SUPER_SECRET_KEY_XYZ" not in rendered


@patch("app.routers.tagihan.send_payment_receipt_notification")
def test_pay_tagihan_triggers_whatsapp(mock_notify, client, admin_setup):
    token = admin_setup["admin_token"]
    # Create warga with phone number
    w_resp = client.post(
        "/api/warga",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "Siti Aminah", "no_rumah": "B-12", "no_hp": "081234567891"},
    )
    assert w_resp.status_code == 201
    warga_id = w_resp.json()["id"]

    # Create iuran type
    i_resp = client.post(
        "/api/iuran-types",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "Iuran Kas RT", "nominal": 25000, "tipe": "wajib"},
    )
    assert i_resp.status_code == 201
    iuran_id = i_resp.json()["id"]

    # Generate tagihan
    g_resp = client.post(
        "/api/tagihan/generate",
        headers={"Authorization": f"Bearer {token}"},
        json={"iuran_type_id": iuran_id, "periode": "2026-10"},
    )
    assert g_resp.status_code == 201
    tagihans = g_resp.json()
    my_tagihan = next(t for t in tagihans if t["warga_id"] == warga_id)

    # Pay tagihan
    p_resp = client.post(
        f"/api/tagihan/{my_tagihan['id']}/pay",
        headers={"Authorization": f"Bearer {token}"},
        json={"payment_method": "tunai"},
    )
    assert p_resp.status_code == 200

    # Verify notification task was enqueued
    mock_notify.assert_called_once()
    kwargs = mock_notify.call_args[1]
    assert kwargs["warga_nama"] == "Siti Aminah"
    assert kwargs["warga_no_hp"] == "081234567891"
    assert kwargs["total_nominal"] == 25000
    assert kwargs["payment_method"] == "tunai"


@patch("app.routers.tagihan.send_payment_receipt_notification")
def test_batch_pay_triggers_whatsapp(mock_notify, client, admin_setup):
    token = admin_setup["admin_token"]
    # Create warga with phone number
    w_resp = client.post(
        "/api/warga",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "Ahmad Yani", "no_rumah": "C-01", "no_hp": "081234567890"},
    )
    assert w_resp.status_code == 201
    warga_id = w_resp.json()["id"]

    # Create iuran type
    i_resp = client.post(
        "/api/iuran-types",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "Iuran Sampah", "nominal": 20000, "tipe": "wajib"},
    )
    assert i_resp.status_code == 201
    iuran_id = i_resp.json()["id"]

    # Generate tagihan for 2 periods
    g1 = client.post(
        "/api/tagihan/generate",
        headers={"Authorization": f"Bearer {token}"},
        json={"iuran_type_id": iuran_id, "periode": "2026-11"},
    )
    g2 = client.post(
        "/api/tagihan/generate",
        headers={"Authorization": f"Bearer {token}"},
        json={"iuran_type_id": iuran_id, "periode": "2026-12"},
    )
    t1 = next(t for t in g1.json() if t["warga_id"] == warga_id)
    t2 = next(t for t in g2.json() if t["warga_id"] == warga_id)

    # Batch pay both
    p_resp = client.post(
        "/api/tagihan/batch-pay",
        headers={"Authorization": f"Bearer {token}"},
        json={"tagihan_ids": [t1["id"], t2["id"]], "payment_method": "transfer"},
    )
    assert p_resp.status_code == 200

    # Notification should be sent once aggregated for Ahmad Yani
    mock_notify.assert_called_once()
    kwargs = mock_notify.call_args[1]
    assert kwargs["warga_nama"] == "Ahmad Yani"
    assert kwargs["warga_no_hp"] == "081234567890"
    assert kwargs["total_nominal"] == 40000
    assert len(kwargs["items"]) == 2


@patch("app.routers.tagihan.send_payment_receipt_notification")
def test_future_pay_triggers_whatsapp(mock_notify, client, admin_setup):
    token = admin_setup["admin_token"]
    # Create warga with phone number
    w_resp = client.post(
        "/api/warga",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "Dewi Sartika", "no_rumah": "D-05", "no_hp": "089876543210"},
    )
    assert w_resp.status_code == 201
    warga_id = w_resp.json()["id"]

    # Create iuran type
    i_resp = client.post(
        "/api/iuran-types",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "Iuran Sosial", "nominal": 15000, "tipe": "wajib"},
    )
    assert i_resp.status_code == 201
    iuran_id = i_resp.json()["id"]

    # Future pay for 2 periods
    p_resp = client.post(
        "/api/tagihan/future-pay",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "warga_id": warga_id,
            "items": [
                {"periode": "2027-01", "iuran_type_id": iuran_id},
                {"periode": "2027-02", "iuran_type_id": iuran_id},
            ],
            "payment_method": "transfer",
        },
    )
    assert p_resp.status_code == 200

    mock_notify.assert_called_once()
    kwargs = mock_notify.call_args[1]
    assert kwargs["warga_nama"] == "Dewi Sartika"
    assert kwargs["warga_no_hp"] == "089876543210"
    assert kwargs["total_nominal"] == 30000
    assert len(kwargs["items"]) == 2
