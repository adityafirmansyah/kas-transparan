"""Pydantic request/response schemas."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

# ---------- Auth ----------


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    komunitas_id: str
    user_id: str | None = None
    username: str | None = None
    nama: str | None = None


class UserCreate(BaseModel):
    username: str
    password: str
    nama: str
    role: Literal["admin", "ketua", "warga"] = "admin"


class UserUpdate(BaseModel):
    nama: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    nama: str | None = None
    role: str
    komunitas_id: str
    created_at: datetime | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class ChangePasswordResponse(BaseModel):
    detail: str = "Password berhasil diubah"


# ---------- Komunitas ----------


class KomunitasCreate(BaseModel):
    nama: str
    slug: str
    alamat: str | None = None


class KomunitasUpdate(BaseModel):
    nama: str | None = None
    slug: str | None = None
    alamat: str | None = None


class KomunitasOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nama: str
    slug: str
    alamat: str | None = None


# ---------- Warga ----------


class WargaCreate(BaseModel):
    nama: str
    no_hp: str | None = None
    alamat: str | None = None
    no_rumah: str | None = None
    aktif: bool = True


class WargaUpdate(BaseModel):
    nama: str | None = None
    no_hp: str | None = None
    alamat: str | None = None
    no_rumah: str | None = None
    aktif: bool | None = None


class WargaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nama: str
    no_hp: str | None = None
    alamat: str | None = None
    no_rumah: str | None = None
    aktif: bool


# ---------- IuranType ----------


class IuranTypeCreate(BaseModel):
    nama: str
    nominal: float
    period_type: Literal["monthly", "one_time"] = "monthly"
    aktif: bool = True


class IuranTypeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nama: str
    nominal: float
    period_type: str
    aktif: bool
    admin_id: str | None = None
    admin_username: str | None = None


class IuranTypeReassignRequest(BaseModel):
    admin_id: str


# ---------- Tagihan ----------


class GenerateTagihanRequest(BaseModel):
    iuran_type_id: str
    periode: str  # "YYYY-MM"


class PayTagihanRequest(BaseModel):
    payment_method: str  # "tunai" or "transfer"
    proof_image_path: str | None = None


class BatchPayTagihanRequest(BaseModel):
    tagihan_ids: list[str]
    payment_method: str  # "tunai" or "transfer"
    proof_image_path: str | None = None


class TagihanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    warga_id: str
    iuran_type_id: str
    periode: str
    nominal: float
    status: str
    payment_method: str | None = None
    proof_image_path: str | None = None
    paid_at: datetime | None = None


class BatchPayTagihanResponse(BaseModel):
    paid_count: int
    total_nominal: float
    paid_tagihan: list[TagihanOut]


class FuturePaymentItem(BaseModel):
    periode: str
    iuran_type_id: str


class RecordFuturePaymentRequest(BaseModel):
    warga_id: str
    items: list[FuturePaymentItem]
    payment_method: str  # "tunai" or "transfer"
    proof_image_path: str | None = None


class RecordFuturePaymentResponse(BaseModel):
    warga_id: str
    warga_nama: str
    total_paid_count: int
    total_nominal: float
    paid_tagihan: list[TagihanOut]


class TagihanWithWargaOut(TagihanOut):
    warga_nama: str
    iuran_nama: str


# ---------- KasEntry ----------


class PemasukanCreate(BaseModel):
    kategori: str
    deskripsi: str
    nominal: float
    tanggal: date | None = None


class PengeluaranCreate(BaseModel):
    kategori: str
    deskripsi: str
    nominal: float
    tanggal: date | None = None
    receipt_image_path: str | None = None


class KasEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tipe: str
    kategori: str
    deskripsi: str
    nominal: float
    tanggal: date
    receipt_image_path: str | None = None
    approval_status: str | None = None
    created_at: datetime


class ApprovalRequest(BaseModel):
    status: Literal["approved", "rejected"]


# ---------- Reports ----------


class MonthlyReport(BaseModel):
    periode: str
    total_masuk: float
    total_keluar: float
    saldo_awal: float
    saldo_akhir: float


class UnpaidWargaOut(BaseModel):
    warga_id: str
    warga_nama: str
    iuran_nama: str
    nominal: float
    periode: str


class TunggakanPeriodeOut(BaseModel):
    tagihan_id: str
    periode: str
    iuran_nama: str
    nominal: float


class TunggakanMultiOut(BaseModel):
    warga_id: str
    warga_nama: str
    unpaid_periods: list[TunggakanPeriodeOut]
    total_unpaid_count: int
    distinct_months_count: int = 0
    total_nominal: float


# ---------- Warga Self-Check Portal ----------


class WargaSelfCheckTagihan(BaseModel):
    id: str
    periode: str
    iuran_nama: str
    nominal: float
    status: str
    payment_method: str | None = None
    paid_at: datetime | None = None


class WargaSelfCheckResponse(BaseModel):
    warga_nama: str
    no_rumah: str | None = None
    komunitas_nama: str
    total_unpaid_count: int
    total_unpaid_nominal: float
    tagihan_list: list[WargaSelfCheckTagihan]


class PublicSummary(BaseModel):
    komunitas_nama: str
    saldo_akhir: float
    total_masuk_bulan_ini: float
    total_keluar_bulan_ini: float
    pengeluaran_per_kategori: dict[str, float]
    periode: str


class PublicLedgerEntry(BaseModel):
    tipe: str
    kategori: str
    nominal: float
    tanggal: date
    # deskripsi/warga identity intentionally omitted for privacy on pengeluaran->ok to show desc
    deskripsi: str | None = None
