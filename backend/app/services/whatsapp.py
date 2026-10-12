"""WhatsApp Notification Service for kas-transparan.

Dispatches payment receipts to residents through a configurable HTTP gateway:
any service accepting ``POST {"to": "<msisdn>", "message": "<text>"}`` with an
API key header.
"""

import logging
import re
from datetime import UTC, datetime
from decimal import ROUND_HALF_UP, Decimal
from zoneinfo import ZoneInfo

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Indonesian mobile numbers in international form: 62 + 8 + 7..12 digits.
_ID_MOBILE_RE = re.compile(r"^628[0-9]{7,12}$")
_WIB = ZoneInfo("Asia/Jakarta")


def normalize_phone_number(phone: str | None) -> str | None:
    """Normalizes an Indonesian mobile number to 62-prefixed digits, or None.

    Accepts 08xxx, 8xxx, 62xxx and +62xxx with any common separators.
    Rejects non-Indonesian numbers, landlines, and malformed input so a stray
    value in ``Warga.no_hp`` can never be dispatched as a WhatsApp recipient.
    """
    if not isinstance(phone, str):
        return None
    cleaned = re.sub(r"[^0-9]", "", phone.strip())
    if not cleaned:
        return None
    if cleaned.startswith("0"):
        cleaned = "62" + cleaned[1:]
    elif cleaned.startswith("8"):
        cleaned = "62" + cleaned

    if not _ID_MOBILE_RE.match(cleaned):
        return None
    return cleaned


def mask_phone_number(phone: str | None) -> str:
    """Masks a phone number for logs (e.g. 6281****7890).

    Resident phone numbers are personal data, so they must never be written to
    logs in full.
    """
    if not isinstance(phone, str):
        return "***"
    digits = re.sub(r"[^0-9]", "", phone)
    if len(digits) < 7:
        return "***"
    return f"{digits[:4]}****{digits[-4:]}"


def format_rupiah(nominal: float) -> str:
    """Formats nominal as Indonesian Rupiah, rounding half-up to whole rupiah.

    Uses Decimal so printed item lines always sum to the printed total (plain
    ``int()`` truncates, which can make the receipt appear to not add up).
    """
    value = Decimal(str(nominal)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return f"Rp {int(value):,}".replace(",", ".")


def format_wib_time(moment: datetime) -> str:
    """Formats an instant as WIB (Asia/Jakarta) local time.

    Naive datetimes are treated as UTC (the app's own ``datetime.utcnow()``
    convention) so the receipt never shows a timestamp labelled WIB that is
    actually UTC.
    """
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(_WIB).strftime("%d/%m/%Y %H:%M")


def send_whatsapp_message(to: str, message: str) -> bool:
    """Sends a text message through the configured WhatsApp gateway.

    Never raises: any transport error is logged and reported as ``False`` so a
    notification failure can never propagate into a payment transaction.
    """
    if not settings.WHATSAPP_ENABLED:
        logger.debug("WhatsApp notification skipped: WHATSAPP_ENABLED is False")
        return False

    if not settings.WHATSAPP_GATEWAY_URL:
        logger.warning("WhatsApp notification skipped: WHATSAPP_GATEWAY_URL is not set")
        return False

    recipient = normalize_phone_number(to)
    if not recipient:
        logger.warning(
            f"WhatsApp notification skipped: invalid phone number '{mask_phone_number(to)}'"
        )
        return False

    headers = {
        "Content-Type": "application/json",
    }
    if settings.WHATSAPP_API_KEY:
        headers["X-API-Key"] = settings.WHATSAPP_API_KEY

    payload = {
        "to": recipient,
        "message": message,
    }

    masked = mask_phone_number(recipient)
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(
                settings.WHATSAPP_GATEWAY_URL,
                headers=headers,
                json=payload,
            )
            if resp.status_code >= 400:
                logger.error(
                    f"Failed to send WA to {masked}: HTTP {resp.status_code} - {resp.text[:200]}"
                )
                return False

            logger.info(f"WhatsApp message sent successfully to {masked}")
            return True
    except Exception as exc:
        logger.error(f"Error dispatching WhatsApp message to {masked}: {exc}")
        return False


def send_payment_receipt_notification(
    warga_nama: str,
    warga_no_hp: str | None,
    items: list[dict],
    total_nominal: float,
    payment_method: str,
    komunitas_nama: str,
    paid_at: datetime | None = None,
) -> bool:
    """Formats and dispatches a structured payment receipt via WhatsApp.

    Never raises: formatting or dispatch problems are logged and reported as
    ``False`` so a notification failure can never affect a recorded payment.
    """
    if not warga_no_hp or not settings.WHATSAPP_ENABLED:
        return False

    try:
        if paid_at is None:
            paid_at = datetime.now(UTC)

        # items format: [{"iuran_nama": "Keamanan", "periode": "2026-10", "nominal": 25000}]
        item_rows = []
        for it in items:
            iuran_nama = it.get("iuran_nama", "Iuran")
            periode = it.get("periode", "-")
            nominal = it.get("nominal", 0)
            item_rows.append(f"• {iuran_nama} ({periode}): {format_rupiah(nominal)}")

        items_text = "\n".join(item_rows)
        method_label = "Tunai" if str(payment_method or "").lower() == "tunai" else "Transfer Bank"
        time_str = format_wib_time(paid_at)

        message = (
            f"*BUKTI PEMBAYARAN IURAN*\n"
            f"*{komunitas_nama}*\n\n"
            f"Halo Bapak/Ibu {warga_nama},\n"
            f"Pembayaran iuran Anda telah berhasil dicatat di sistem Kas Transparan:\n\n"
            f"{items_text}\n\n"
            f"• *Total*: {format_rupiah(total_nominal)}\n"
            f"• *Metode*: {method_label}\n"
            f"• *Waktu*: {time_str} WIB\n\n"
            f"Terima kasih telah berkontribusi menjaga transparansi kas lingkungan kita! 🙏"
        )
    except Exception as exc:
        logger.error(f"Error formatting WhatsApp receipt for warga '{warga_nama}': {exc}")
        return False

    return send_whatsapp_message(warga_no_hp, message)
