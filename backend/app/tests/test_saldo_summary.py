from datetime import date

from app.core.security import create_access_token
from app.models.models import KasEntry, Komunitas, PengeluaranStatus, User


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_saldo_summary_includes_current_month_breakdown(client, db_session):
    kom = Komunitas(nama="RT Kas Test", slug="rt-kas-test")
    db_session.add(kom)
    db_session.commit()

    admin = User(komunitas_id=kom.id, username="admin_kas", hashed_password="pwd", role="admin")
    db_session.add(admin)
    db_session.commit()

    today = date.today()
    # Income in current month
    in1 = KasEntry(
        komunitas_id=kom.id,
        tipe="pemasukan",
        kategori="iuran",
        deskripsi="Iuran masuk bln ini",
        nominal=500000,
        tanggal=today,
        created_by=admin.id,
    )
    # Income in past month
    in_past = KasEntry(
        komunitas_id=kom.id,
        tipe="pemasukan",
        kategori="donasi",
        deskripsi="Donasi tahun lalu",
        nominal=1000000,
        tanggal=date(today.year - 1, 1, 1),
        created_by=admin.id,
    )
    # Approved Expense in current month
    out1 = KasEntry(
        komunitas_id=kom.id,
        tipe="pengeluaran",
        kategori="kebersihan",
        deskripsi="Sapu dan tong sampah",
        nominal=200000,
        tanggal=today,
        approval_status=PengeluaranStatus.approved,
        created_by=admin.id,
    )
    db_session.add_all([in1, in_past, out1])
    db_session.commit()

    token = create_access_token({"sub": admin.id, "role": admin.role.value, "komunitas_id": kom.id})
    resp = client.get("/api/kas/saldo", headers=auth_headers(token))
    assert resp.status_code == 200
    data = resp.json()
    assert data["saldo"] == 1300000.0  # 1.5M in - 200k out
    assert data["total_masuk_bulan_ini"] == 500000.0
    assert data["total_keluar_bulan_ini"] == 200000.0
    assert data["periode"] == today.strftime("%Y-%m")
