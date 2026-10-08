"""SQLAlchemy ORM models for kas-transparan.

Multi-tenancy: everything hangs off Komunitas (an RT/RW/warga community).
Each row of warga/iuran/tagihan/kas belongs to exactly one komunitas_id.
"""

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    String,
    UniqueConstraint,
)
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import relationship

from app.core.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class UserRole(enum.StrEnum):
    admin = "admin"  # bendahara / treasurer: manages kas + tagihan
    ketua = "ketua"  # chair: approves pengeluaran, read access
    warga = "warga"  # resident: optional self-service account


class PeriodType(enum.StrEnum):
    monthly = "monthly"
    one_time = "one_time"


class PaymentMethod(enum.StrEnum):
    tunai = "tunai"
    transfer = "transfer"


class TagihanStatus(enum.StrEnum):
    belum_bayar = "belum_bayar"
    lunas = "lunas"


class PengeluaranStatus(enum.StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class Komunitas(Base):
    """A tenant: one RT/RW/komunitas deployment-unit."""

    __tablename__ = "komunitas"

    id = Column(String, primary_key=True, default=gen_uuid)
    nama = Column(String, nullable=False)  # e.g. "RT 05 / RW 03 Sukamaju"
    slug = Column(String, unique=True, nullable=False)  # used in public transparency URL
    alamat = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="komunitas", cascade="all, delete-orphan")
    warga = relationship("Warga", back_populates="komunitas", cascade="all, delete-orphan")
    iuran_types = relationship(
        "IuranType", back_populates="komunitas", cascade="all, delete-orphan"
    )
    kas_entries = relationship("KasEntry", back_populates="komunitas", cascade="all, delete-orphan")


class User(Base):
    """Login account: admin/bendahara or ketua. Warga accounts are a stretch goal."""

    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_uuid)
    komunitas_id = Column(String, ForeignKey("komunitas.id"), nullable=False)
    username = Column(String, nullable=False)
    nama = Column(String, nullable=True)  # display name, e.g. "Budi Santoso"
    hashed_password = Column(String, nullable=False)
    role = Column(SAEnum(UserRole), nullable=False, default=UserRole.admin)
    created_at = Column(DateTime, default=datetime.utcnow)

    komunitas = relationship("Komunitas", back_populates="users")

    __table_args__ = (
        UniqueConstraint("komunitas_id", "username", name="uq_user_komunitas_username"),
    )


class Warga(Base):
    """A resident household within a komunitas."""

    __tablename__ = "warga"

    id = Column(String, primary_key=True, default=gen_uuid)
    komunitas_id = Column(String, ForeignKey("komunitas.id"), nullable=False)
    nama = Column(String, nullable=False)
    no_hp = Column(String, nullable=True)
    alamat = Column(String, nullable=True)
    no_rumah = Column(String, nullable=True)
    aktif = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    komunitas = relationship("Komunitas", back_populates="warga")
    tagihan = relationship("Tagihan", back_populates="warga", cascade="all, delete-orphan")


class IuranType(Base):
    """A dues/fee type, e.g. 'Iuran Kebersihan', 'Iuran Keamanan', 'Dana Sosial'."""

    __tablename__ = "iuran_types"

    id = Column(String, primary_key=True, default=gen_uuid)
    komunitas_id = Column(String, ForeignKey("komunitas.id"), nullable=False)
    nama = Column(String, nullable=False)
    nominal = Column(Float, nullable=False)
    period_type = Column(SAEnum(PeriodType), nullable=False, default=PeriodType.monthly)
    aktif = Column(Boolean, default=True)
    admin_id = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    komunitas = relationship("Komunitas", back_populates="iuran_types")
    admin_user = relationship("User", foreign_keys=[admin_id])
    tagihan = relationship("Tagihan", back_populates="iuran_type", cascade="all, delete-orphan")


class Tagihan(Base):
    """A billing instance: one iuran type x one warga x one period."""

    __tablename__ = "tagihan"

    id = Column(String, primary_key=True, default=gen_uuid)
    komunitas_id = Column(String, ForeignKey("komunitas.id"), nullable=False)
    warga_id = Column(String, ForeignKey("warga.id"), nullable=False)
    iuran_type_id = Column(String, ForeignKey("iuran_types.id"), nullable=False)
    periode = Column(String, nullable=False)  # "YYYY-MM" for monthly, or free text for one_time
    nominal = Column(Float, nullable=False)
    status = Column(SAEnum(TagihanStatus), nullable=False, default=TagihanStatus.belum_bayar)
    payment_method = Column(SAEnum(PaymentMethod), nullable=True)
    proof_image_path = Column(String, nullable=True)
    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    warga = relationship("Warga", back_populates="tagihan")
    iuran_type = relationship("IuranType", back_populates="tagihan")

    __table_args__ = (
        UniqueConstraint(
            "warga_id", "iuran_type_id", "periode", name="uq_tagihan_warga_iuran_periode"
        ),
    )


class KasEntry(Base):
    """A single cash-ledger line: pemasukan (income) or pengeluaran (expense)."""

    __tablename__ = "kas_entries"

    id = Column(String, primary_key=True, default=gen_uuid)
    komunitas_id = Column(String, ForeignKey("komunitas.id"), nullable=False)
    tipe = Column(String, nullable=False)  # "pemasukan" | "pengeluaran"
    kategori = Column(
        String, nullable=False
    )  # e.g. "iuran", "donasi", "kebersihan", "keamanan", "lainnya"
    deskripsi = Column(String, nullable=False)
    nominal = Column(Float, nullable=False)
    tanggal = Column(Date, nullable=False, default=date.today)
    receipt_image_path = Column(String, nullable=True)
    tagihan_id = Column(
        String, ForeignKey("tagihan.id"), nullable=True
    )  # link if auto-generated from payment
    approval_status = Column(SAEnum(PengeluaranStatus), nullable=True)  # only set for pengeluaran
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    approved_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    komunitas = relationship("Komunitas", back_populates="kas_entries")
