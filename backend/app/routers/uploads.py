"""Receipt image upload for pengeluaran (expense) entries.

Volunteer treasurers photograph the physical nota/bon and attach it so the
ketua can inspect it before approving the expense. Files are stored on disk
under ``UPLOAD_DIR/receipts`` and served back through the same ``/api`` prefix
so no extra reverse-proxy rule is needed in production.
"""

from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core.config import settings
from app.core.deps import require_roles
from app.models.models import User

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

# Only raster images are accepted: a receipt is a photo or a screenshot.
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_UPLOAD_BYTES = 5 * 1024 * 1024  # 5 MB
_CHUNK = 64 * 1024


def _receipts_dir() -> Path:
    path = Path(settings.UPLOAD_DIR) / "receipts"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _sanitize_extension(filename: str | None) -> str:
    """Returns a safe lowercase extension, or raises 400 for anything else.

    The client-supplied name is never used for the stored path — only its
    extension, and only after it matches the allowlist.
    """
    suffix = Path(filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        allowed = ", ".join(sorted(ALLOWED_EXTENSIONS))
        raise HTTPException(
            status_code=400,
            detail=f"Format file tidak didukung. Gunakan salah satu dari: {allowed}",
        )
    return suffix


@router.post("/receipt", status_code=201)
async def upload_receipt(
    file: UploadFile = File(...),
    user: User = Depends(require_roles("admin")),
):
    """Stores a receipt image and returns the path to attach to a pengeluaran."""
    suffix = _sanitize_extension(file.filename)

    content_type = (file.content_type or "").lower()
    if content_type and not content_type.startswith("image/"):
        raise HTTPException(
            status_code=400,
            detail="File harus berupa gambar (image/*).",
        )

    # Reject oversized uploads before writing anything to disk.
    payload = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Ukuran file terlalu besar (maksimal {MAX_UPLOAD_BYTES // (1024 * 1024)} MB).",
        )
    if not payload:
        raise HTTPException(status_code=400, detail="File kosong.")

    stored_name = f"{uuid4().hex}{suffix}"
    destination = _receipts_dir() / stored_name
    destination.write_bytes(payload)

    return {
        "receipt_image_path": f"/api/uploads/receipts/{stored_name}",
        "filename": stored_name,
    }


@router.get("/receipts/{filename}")
def get_receipt(
    filename: str,
    user: User = Depends(require_roles("admin", "ketua")),
):
    """Serves a stored receipt image to authenticated admin/ketua users.

    The filename is validated as a bare basename so a crafted value such as
    ``../../etc/passwd`` cannot escape the receipts directory.
    """
    if filename != Path(filename).name or Path(filename).suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Nama file tidak valid.")

    target = _receipts_dir() / filename
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Bukti struk tidak ditemukan.")

    return FileResponse(target)
