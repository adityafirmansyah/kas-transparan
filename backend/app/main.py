"""FastAPI application entrypoint for kas-transparan."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import Base, engine
from app.routers import auth, iuran_types, kas, komunitas, public, reports, tagihan, warga

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="kas-transparan API",
    description="Open-source RT/RW kas (treasury) transparency & iuran management.",
    version="1.0.0",
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
