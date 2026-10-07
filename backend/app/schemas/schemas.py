"""Pydantic request/response schemas."""
from datetime import datetime, date
from typing import Optional, Literal

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


class UserCreate(BaseModel):
    username: str
    password: str
    role: Literal["admin", "ketua", "warga"] = "admin"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    username: str
    role: str
    komunitas_id: str


# ---------- Komunitas ----------

class KomunitasCreate(BaseModel):
    nama: str
    slug: str
    alamat: Optional[str] = None


class KomunitasOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nama: str
    slug: str
    alamat: Optional[str] = None


# ---------- Warga ----------

class WargaCreate(BaseModel):
    nama: str
    no_hp: Optional[str] = None
    alamat: Optional[str] = None
    no_rumah: Optional[str] = None
    aktif: bool = True


class WargaUpdate(BaseModel):
    nama: Optional[str] = None
    no_hp: Optional[str] = None
    alamat: Optional[str] = None
    no_rumah: Optional[str] = None
    aktif: Optional[bool] = None


class WargaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    nama: str
    no_hp: Optional[str] = None
    alamat: Optional[str] = None
    no_rumah: Optional[str] = None
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


# ---------- Tagihan ----------

class GenerateTagihanRequest(BaseModel):
    iuran_type_id: str
    periode: str  # "YYYY-MM"


class PayTagihanRequest(BaseModel):
    payment_method: Literal["tunai", "transfer"]
    proof_image_path: Optional[str] = None


class TagihanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    warga_id: str
    iuran_type_id: str
    periode: str
    nominal: float
    status: str
    payment_method: Optional[str] = None
    proof_image_path: Optional[str] = None
    paid_at: Optional[datetime] = None


class TagihanWithWargaOut(TagihanOut):
    warga_nama: str
    iuran_nama: str


# ---------- KasEntry ----------

class PemasukanCreate(BaseModel):
    kategori: str
    deskripsi: str
    nominal: float
    tanggal: Optional[date] = None


class PengeluaranCreate(BaseModel):
    kategori: str
    deskripsi: str
    nominal: float
    tanggal: Optional[date] = None
    receipt_image_path: Optional[str] = None


class KasEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tipe: str
    kategori: str
    deskripsi: str
    nominal: float
    tanggal: date
    receipt_image_path: Optional[str] = None
    approval_status: Optional[str] = None
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


# ---------- Public transparency ----------

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
    deskripsi: Optional[str] = None
