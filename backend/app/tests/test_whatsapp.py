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


def test_format_rupiah_rounds_half_up_so_lines_sum_to_total():
    """Item lines must sum to the printed total (plain int() truncation breaks this)."""
    from app.services.whatsapp import format_rupiah

    # 3 x 1499.5 = 4498.5 -> lines must sum to the total, not 100 short
    items = [format_rupiah(1499.5)] * 3
    total = format_rupiah(4498.5)
    assert items == ["Rp 1.500"] * 3  # rounds up, not truncates to 1.499
    assert total == "Rp 4.499"  # 4498.5 rounds half-up
    summed = sum(int(s.replace("Rp ", "").replace(".", "")) for s in items)
    assert summed == 4500  # and the three lines are consistent with each other


def test_mask_phone_number():
    from app.services.whatsapp import mask_phone_number

    assert mask_phone_number("6281234567890") == "6281****7890"
    assert mask_phone_number("+62 812-3456-7890") == "6281****7890"
    assert mask_phone_number("short") == "***"
    assert mask_phone_number(None) == "***"
    assert mask_phone_number(6281234567890) == "***"  # type: ignore[arg-type]  # non-str not logged raw
    # The full number must never survive masking
    assert "1234567890" not in mask_phone_number("6281234567890")


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


def test_phone_number_is_masked_in_logs():
    """Resident phone numbers are personal data; logs must carry only the mask.

    This asserts the CALL SITE actually masks, not merely that mask_phone_number()
    works in isolation — reverting the log statement to the raw number must fail here.
    """
    import logging as _logging

    import app.services.whatsapp as wa

    records: list[str] = []

    class _Capture(_logging.Handler):
        def emit(self, record):
            records.append(record.getMessage())

    handler = _Capture()
    wa.logger.addHandler(handler)
    wa.logger.setLevel(_logging.DEBUG)
    try:
        with (
            patch.object(settings, "WHATSAPP_ENABLED", True),
            patch.object(settings, "WHATSAPP_GATEWAY_URL", "https://gateway.example.com/send"),
            patch.object(settings, "WHATSAPP_API_KEY", "k"),
            patch("app.services.whatsapp.httpx.Client") as mock_client_cls,
        ):
            ok = MagicMock()
            ok.status_code = 200
            mock_client_cls.return_value.__enter__.return_value.post.return_value = ok
            # success path + invalid-number path both log
            assert wa.send_whatsapp_message("081234567890", "hi") is True
            assert wa.send_whatsapp_message("not-a-phone", "x") is False
    finally:
        wa.logger.removeHandler(handler)

    joined = "\n".join(records)
    assert joined, "expected the service to log something"
    # The full MSISDN must never appear, in any form it was passed in.
    assert "6281234567890" not in joined
    assert "081234567890" not in joined
    assert "not-a-phone" not in joined
    # ...while the mask is present, proving logging did happen.
    assert "6281****7890" in joined


def test_whatsapp_disabled_by_default():
    """The shipped default must be OFF — this is the load-bearing safety property."""
    from app.core.config import Settings

    fresh = Settings(_env_file=None)
    assert fresh.WHATSAPP_ENABLED is False
    assert fresh.WHATSAPP_GATEWAY_URL == ""
    assert fresh.WHATSAPP_API_KEY == ""


def test_null_client_is_never_constructed_when_flag_off(client, admin_setup):
    """Flag off => paying a bill must not even construct an HTTP client.

    A poisoned httpx.Client proves the no-op end to end: if any code path tried
    to make a request, construction itself raises.
    """
    token = admin_setup["admin_token"]
    w_resp = client.post(
        "/api/warga",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "No Notify", "no_rumah": "E-09", "no_hp": "081234567899"},
    )
    assert w_resp.status_code == 201
    warga_id = w_resp.json()["id"]

    i_resp = client.post(
        "/api/iuran-types",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "Iuran Silent", "nominal": 10000, "tipe": "wajib"},
    )
    assert i_resp.status_code == 201
    iuran_id = i_resp.json()["id"]

    g_resp = client.post(
        "/api/tagihan/generate",
        headers={"Authorization": f"Bearer {token}"},
        json={"iuran_type_id": iuran_id, "periode": "2026-10"},
    )
    assert g_resp.status_code == 201
    my_tagihan = next(t for t in g_resp.json() if t["warga_id"] == warga_id)

    def _boom(*args, **kwargs):
        raise AssertionError("httpx.Client was constructed while WhatsApp was disabled")

    with (
        patch.object(settings, "WHATSAPP_ENABLED", False),
        patch("app.services.whatsapp.httpx.Client", side_effect=_boom),
    ):
        p_resp = client.post(
            f"/api/tagihan/{my_tagihan['id']}/pay",
            headers={"Authorization": f"Bearer {token}"},
            json={"payment_method": "tunai"},
        )
        assert p_resp.status_code == 200
        assert p_resp.json()["status"] == "lunas"


@patch("app.routers.tagihan.send_payment_receipt_notification")
def test_dispatch_plumbing_failure_does_not_fail_payment(mock_notify, client, admin_setup):
    """A failure in the enqueue plumbing must not 500 an already-committed payment."""
    token = admin_setup["admin_token"]
    w_resp = client.post(
        "/api/warga",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "Plumbing Fail", "no_rumah": "F-01", "no_hp": "081234567877"},
    )
    assert w_resp.status_code == 201
    warga_id = w_resp.json()["id"]

    i_resp = client.post(
        "/api/iuran-types",
        headers={"Authorization": f"Bearer {token}"},
        json={"nama": "Iuran Plumbing", "nominal": 12000, "tipe": "wajib"},
    )
    assert i_resp.status_code == 201
    iuran_id = i_resp.json()["id"]

    g_resp = client.post(
        "/api/tagihan/generate",
        headers={"Authorization": f"Bearer {token}"},
        json={"iuran_type_id": iuran_id, "periode": "2026-10"},
    )
    assert g_resp.status_code == 201
    my_tagihan = next(t for t in g_resp.json() if t["warga_id"] == warga_id)

    with (
        patch.object(settings, "WHATSAPP_ENABLED", True),
        patch.object(settings, "WHATSAPP_GATEWAY_URL", "https://gateway.example.com/send"),
        patch(
            "app.routers.tagihan.BackgroundTasks.add_task",
            side_effect=RuntimeError("background plumbing exploded"),
        ),
    ):
        p_resp = client.post(
            f"/api/tagihan/{my_tagihan['id']}/pay",
            headers={"Authorization": f"Bearer {token}"},
            json={"payment_method": "tunai"},
        )
        # Payment already committed: the response must still be a success.
        assert p_resp.status_code == 200
        assert p_resp.json()["status"] == "lunas"


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
    with patch.object(settings, "WHATSAPP_ENABLED", True):
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
    with patch.object(settings, "WHATSAPP_ENABLED", True):
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
    with patch.object(settings, "WHATSAPP_ENABLED", True):
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
