"""FastAPI application entrypoint for kas-transparan."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.core.database import Base, SessionLocal, engine, get_db
from app.models.models import Komunitas, User
from app.routers import auth, iuran_types, kas, komunitas, public, reports, tagihan, warga
from app.seed import seed_data

logger = logging.getLogger(__name__)

Base.metadata.create_all(bind=engine)


def _ensure_sqlite_migrations():
    """Lightweight migration to add admin_id to iuran_types if missing (SQLite)."""
    try:
        with engine.connect() as conn:
            # Check existing columns in iuran_types
            result = conn.execute(text("PRAGMA table_info(iuran_types)"))
            columns = [row[1] for row in result.fetchall()]
            if "admin_id" not in columns:
                logger.info("Migrating iuran_types: adding admin_id column...")
                conn.execute(
                    text("ALTER TABLE iuran_types ADD COLUMN admin_id VARCHAR REFERENCES users(id)")
                )
                conn.commit()

            # Backfill existing iuran_types with first admin in their community
            result_nulls = conn.execute(
                text("SELECT id, komunitas_id FROM iuran_types WHERE admin_id IS NULL")
            )
            for iuran_id, kom_id in result_nulls.fetchall():
                first_admin = conn.execute(
                    text(
                        "SELECT id FROM users "
                        "WHERE komunitas_id = :kid AND role = 'admin' "
                        "ORDER BY created_at ASC LIMIT 1"
                    ),
                    {"kid": kom_id},
                ).fetchone()
                if first_admin:
                    conn.execute(
                        text("UPDATE iuran_types SET admin_id = :aid WHERE id = :iid"),
                        {"aid": first_admin[0], "iid": iuran_id},
                    )
                    conn.commit()
    except Exception as exc:
        logger.warning("Migration hook note: %s", exc)


_ensure_sqlite_migrations()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.AUTO_SEED:
        # Determine if get_db has been overridden (e.g. test environment)
        if get_db in app.dependency_overrides:
            override = app.dependency_overrides[get_db]
            gen = override()
            db = next(gen)
            try:
                if db.query(Komunitas).count() == 0 or db.query(User).count() == 0:
                    logger.info("Auto-seeding initial database (override)...")
                    seed_data(db)
            finally:
                try:
                    next(gen)
                except StopIteration:
                    pass
        else:
            with SessionLocal() as db:
                if db.query(Komunitas).count() == 0 or db.query(User).count() == 0:
                    logger.info("Auto-seeding initial database...")
                    seed_data(db)
    yield


app = FastAPI(
    title="kas-transparan API",
    description="Open-source RT/RW kas (treasury) transparency & iuran management.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(komunitas.router)
app.include_router(warga.router)
app.include_router(iuran_types.router)
app.include_router(tagihan.router)
app.include_router(kas.router)
app.include_router(reports.router)
app.include_router(public.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
