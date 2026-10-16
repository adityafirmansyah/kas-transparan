"""Tests for delete tagihan endpoint (DELETE /api/tagihan/{id})."""

from app.core.security import create_access_token
from app.models.models import IuranType, Komunitas, Tagihan, TagihanStatus, User, Warga


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_delete_unpaid_tagihan_success(client, db_session):
    kom = Komunitas(nama="RT Test", slug="rt-test-del")
    db_session.add(kom)
    db_session.commit()

    admin = User(komunitas_id=kom.id, username="admin_del", hashed_password="pwd", role="admin")
    db_session.add(admin)
    db_session.commit()

    warga = Warga(komunitas_id=kom.id, nama="Warga Del")
    iuran = IuranType(
        komunitas_id=kom.id, nama="Iuran Kebersihan", nominal=20000, admin_id=admin.id
    )
    db_session.add_all([warga, iuran])
    db_session.commit()

    tagihan = Tagihan(
        komunitas_id=kom.id,
        warga_id=warga.id,
        iuran_type_id=iuran.id,
        periode="2026-11",
        nominal=20000,
        status=TagihanStatus.belum_bayar,
    )
    db_session.add(tagihan)
    db_session.commit()

    token = create_access_token({"sub": admin.id, "role": admin.role.value, "komunitas_id": kom.id})

    # Delete unpaid tagihan
    del_resp = client.delete(f"/api/tagihan/{tagihan.id}", headers=auth_headers(token))
    assert del_resp.status_code == 204

    # Verify deleted from DB
    assert db_session.query(Tagihan).filter(Tagihan.id == tagihan.id).first() is None


def test_delete_paid_tagihan_rejected(client, db_session):
    kom = Komunitas(nama="RT Test 2", slug="rt-test-del-2")
    db_session.add(kom)
    db_session.commit()

    admin = User(komunitas_id=kom.id, username="admin_del2", hashed_password="pwd", role="admin")
    db_session.add(admin)
    db_session.commit()

    warga = Warga(komunitas_id=kom.id, nama="Warga Del 2")
    iuran = IuranType(komunitas_id=kom.id, nama="Iuran Keamanan", nominal=30000, admin_id=admin.id)
    db_session.add_all([warga, iuran])
    db_session.commit()

    tagihan = Tagihan(
        komunitas_id=kom.id,
        warga_id=warga.id,
        iuran_type_id=iuran.id,
        periode="2026-11",
        nominal=30000,
        status=TagihanStatus.lunas,
    )
    db_session.add(tagihan)
    db_session.commit()

    token = create_access_token({"sub": admin.id, "role": admin.role.value, "komunitas_id": kom.id})

    # Attempt delete paid tagihan -> 400 Bad Request
    del_resp = client.delete(f"/api/tagihan/{tagihan.id}", headers=auth_headers(token))
    assert del_resp.status_code == 400
    assert "lunas" in del_resp.json()["detail"]


def test_delete_tagihan_unauthorized_admin(client, db_session):
    kom = Komunitas(nama="RT Test 3", slug="rt-test-del-3")
    db_session.add(kom)
    db_session.commit()

    admin1 = User(komunitas_id=kom.id, username="admin1_del", hashed_password="pwd", role="admin")
    admin2 = User(komunitas_id=kom.id, username="admin2_del", hashed_password="pwd", role="admin")
    db_session.add_all([admin1, admin2])
    db_session.commit()

    warga = Warga(komunitas_id=kom.id, nama="Warga Del 3")
    iuran = IuranType(
        komunitas_id=kom.id, nama="Iuran Khusus Admin 1", nominal=50000, admin_id=admin1.id
    )
    db_session.add_all([warga, iuran])
    db_session.commit()

    tagihan = Tagihan(
        komunitas_id=kom.id,
        warga_id=warga.id,
        iuran_type_id=iuran.id,
        periode="2026-11",
        nominal=50000,
        status=TagihanStatus.belum_bayar,
    )
    db_session.add(tagihan)
    db_session.commit()

    # Admin 2 tries to delete Admin 1's iuran tagihan -> 403 Forbidden
    token2 = create_access_token(
        {"sub": admin2.id, "role": admin2.role.value, "komunitas_id": kom.id}
    )
    del_resp = client.delete(f"/api/tagihan/{tagihan.id}", headers=auth_headers(token2))
    assert del_resp.status_code == 403
