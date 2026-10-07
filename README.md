# kas-transparan

Open-source **kas (treasury) transparency & iuran (dues) management** tool for
Indonesian RT/RW / komunitas warga. Built so any neighborhood association can
run its own instance, manage dues and expenses, and give residents a
**public, no-login transparency page** showing where the money goes —
without needing a WhatsApp group screenshot or a spreadsheet nobody trusts.

> Inspired by (and aiming for feature-parity with) Kaswarga.com, AppsRT
> (indowarga.com), IuranKas.com, Wargoo.id, and KitaWarga.id — but free,
> open-source, and self-hostable.

## Screenshots

_(placeholder — add screenshots of the dashboard and public transparency page here
once the UI is running against real data)_

- **Screenshots**: `docs/screenshot-dashboard.png`, `docs/screenshot-public-page.png`, `docs/screenshot-self-check.png`

## Core features (v1 / MVP)

- **Multi-tenant**: one deployment can serve multiple RT/RW/komunitas, each
  fully isolated (own warga list, own kas, own slug for the public page).
- **Warga management**: add, edit, and deactivate residents (nama, no HP / WhatsApp,
  alamat, no rumah). Accessible by both Admin and Ketua.
- **Iuran types**: define dues categories (e.g. Iuran Kebersihan, Keamanan,
  Dana Sosial) with nominal amount and period (monthly or one-time). Managed by Admin.
- **Auto-generate tagihan**: one-click billing generation for every active warga
  for any selected period; idempotent (skips warga who already have a bill for that period).
- **Multi-month & batch payments**:
  - Checkbox selection in single-period billing view ("Bayar Terpilih").
  - 1-click batch payment for multi-month arrears ("Tunggakan Multi-Bulan").
  - Advance / upfront payment recording ("Bayar Dimuka") for residents paying several months ahead, automatically creating bills and marking them paid.
- **Buku kas (cash ledger)**:
  - Pemasukan (income, auto-created from tagihan payments or manual like donasi/hibah).
  - Pengeluaran (expense, with category, date picker, receipt attachment image).
  - Running saldo (balance) calculation automatically maintained.
- **Pengeluaran approval workflow**: every expense starts `pending` and must
  be `approved` (or `rejected`) by the `ketua` (chair) role before it counts toward
  the official saldo.
- **Warga self-check portal (`/public/:slug/cek-tagihan`)**:
  - Residents check their own billing & payment history by entering their registered phone / WhatsApp number without any login.
  - Automatically normalizes phone numbers (supports `+62`, `62`, or `08`).
  - Itemized history of all dues, payment dates, payment methods, and current arrears balance.
- **Public transparency page (`/public/:slug`, no login)**:
  - Shows aggregate saldo, monthly cash inflows/outflows, and expense breakdown by category.
  - Responsive, compact mobile design with 1-click WhatsApp link sharing.
  - **Never** exposes individual resident names or arrears lists to protect resident privacy.
- **Account security**:
  - Self-service password change for admin and ketua in Settings.
  - Strict role-based permissions and tenant boundary checks.

### Explicitly out of scope for v1 (locked decisions)

- No WhatsApp bot / WA reminders (planned for a later phase).
- No payment gateway integration (no QRIS/Midtrans/Xendit) — manual admin
  entry + optional proof-of-transfer image, no OCR.
- No subscription tiers / paywalls / freemium limits — this is free and
  open-source, full stop.
- Warga self-service login is a stretch goal, not required for v1 (minimum
  viable: admin/ketua login + public transparency page for everyone else).

## Tech stack

- **Backend**: FastAPI (Python), SQLAlchemy ORM, JWT auth (python-jose +
  passlib/bcrypt), Pydantic schemas. SQLite by default for easy local dev;
  schema is Postgres-compatible and `docker-compose.yml` runs Postgres.
- **Frontend**: React + Vite + TypeScript (no Next.js — kept deliberately
  lightweight), react-router-dom, axios.
- **Database**: PostgreSQL (recommended for production) or SQLite (fine for
  small/single-RT deployments).
- **Tests**: pytest + httpx (FastAPI TestClient), isolated in-memory SQLite
  per test.

## Default credentials & quick start

When you start the project for the first time with Docker Compose or run the backend locally, the database is automatically seeded with demo data out-of-the-box (`AUTO_SEED=true` when empty):

- **Komunitas Demo**: `RT 05 Sukamaju` (slug: `demo`)
- **Admin / Bendahara**: `admin` / `admin123` (manage dues, record payments & ledger entries)
- **Ketua**: `ketua` / `ketua123` (approve/reject expenses, update community profile, create pengurus accounts)
- **Public Transparency Page**: http://localhost:5173/public/demo (no login required)
- **Warga Self-Check Portal**: http://localhost:5173/public/demo/cek-tagihan (enter registered resident phone number)
- **Preloaded Sample Data**: 3 iuran types (Kebersihan & Keamanan, Dana Sosial, Kas RT) and 4 sample warga households.

### Running or re-running the seeder manually

The seeder is fully idempotent — running it multiple times is safe and will never duplicate records:

```bash
# Locally:
cd backend
source venv/bin/activate
python -m app.seed

# Or via Docker Compose:
docker compose exec backend python -m app.seed
```

To disable auto-seeding in production, set `AUTO_SEED=false` in environment variables.

## Local development

### Option A — Docker Compose (recommended, spins up everything)

```bash
docker compose up --build
```

- Backend API: http://localhost:8000 (docs at `/docs`)
- Frontend: http://localhost:5173
- Postgres: localhost:5432 (user `kas`, password `kas_dev_password`, db `kas_transparan`)

### Option B — run backend & frontend manually

**Backend:**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload
```

By default this uses SQLite (`backend/kas_transparan.db`) — no Postgres
needed for local dev. To use Postgres instead, set `DATABASE_URL` env var
(see `backend/app/core/config.py`), e.g.:

```bash
export DATABASE_URL=postgresql://kas:kas_dev_password@localhost:5432/kas_transparan
```

**Frontend:**

```bash
cd frontend
npm install
cp .env.example .env   # set VITE_API_BASE_URL if backend isn't on localhost:8000
npm run dev
```

Visit http://localhost:5173.

### Running backend tests

```bash
cd backend
source venv/bin/activate
pytest -v
```

74 automated tests cover warga CRUD, tagihan auto-generation (incl. idempotency and
inactive-warga skipping), payment recording, advance/future payments,
multi-month arrears aggregation, kas ledger saldo calculation,
the pengeluaran approval workflow, the public transparency endpoint
(including a privacy check that no warga name/description leaks),
the warga self-check portal phone lookup, user authentication (login, /me, change password),
and role-based permission boundaries.

### Linting & formatting (backend)

Backend Python code is linted and formatted with [ruff](https://docs.astral.sh/ruff/)
(config in `backend/pyproject.toml`). Run both before opening a PR:

```bash
cd backend
source venv/bin/activate
ruff check .      # lint (pyflakes, pycodestyle, isort, pyupgrade, bugbear)
ruff format .     # auto-format
```

`ruff check .` also runs on every PR via GitHub Actions
(`.github/workflows/lint.yml`).

### Linting & type-checking (frontend)

The frontend is TypeScript (`.tsx`/`.ts`), linted with
[ESLint](https://eslint.org/) (flat config in `frontend/eslint.config.js`,
using `typescript-eslint` + `eslint-plugin-react-hooks` +
`eslint-plugin-react-refresh`) and formatted with
[Prettier](https://prettier.io/) (config in `frontend/.prettierrc`;
`eslint-config-prettier` disables any ESLint stylistic rules that would
conflict with it). Type-checking is `tsc --noEmit` via the project's
`tsconfig.json`/`tsconfig.app.json`/`tsconfig.node.json`.

Run all three before opening a PR:

```bash
cd frontend
npm install
npm run lint           # eslint .
npm run format:check   # prettier --check . (use `npm run format` to auto-fix)
npm run typecheck      # tsc -b --noEmit
npm run build           # tsc -b && vite build — also fails on type errors
```

All three (`lint`, `format:check`, `typecheck`) also run on every PR via
GitHub Actions (`.github/workflows/lint.yml`, `frontend-lint` job).

## Getting started with a new komunitas

1. `POST /api/komunitas` with `{ "nama": "RT 05 Sukamaju", "slug": "rt05-sukamaju" }`
   to create your tenant. The `slug` becomes the public URL:
   `https://yourdomain/public/rt05-sukamaju`.
2. `POST /api/komunitas/{id}/users` to create an `admin` (bendahara) account
   and a `ketua` account.
3. Log in as Ketua to configure community settings or add further pengurus accounts.
4. Log in as Admin to add residents, configure dues categories, generate monthly bills, and record transactions.

## Roles & Permissions Matrix

| Area / Feature | Action | Admin (Bendahara) | Ketua RT/RW | Warga / Publik |
|---|---|:---:|:---:|:---:|
| **Komunitas Profile** | Update nama, slug, alamat | ❌ | ✅ | ❌ |
| **Pengurus Accounts** | Tambah akun pengurus baru | ❌ | ✅ (Max 1 Ketua) | ❌ |
| **Data Warga** | Tambah, Edit, Nonaktifkan, Hapus warga | ✅ | ✅ | ❌ |
| | Lihat daftar warga | ✅ | ✅ | ❌ |
| **Jenis Iuran** | Tambah & Hapus jenis iuran | ✅ | ❌ | ❌ |
| | Lihat daftar iuran aktif | ✅ | ✅ (Full-width) | ❌ |
| **Tagihan & Iuran** | Generate tagihan bulan ini | ✅ | ❌ | ❌ |
| | Catat bayar lunas (single, batch, dimuka) | ✅ | ❌ | ❌ |
| | Lihat daftar tagihan & laporan tunggakan | ✅ | ✅ (Read-only) | ❌ |
| **Buku Kas** | Catat pemasukan & pengeluaran kas | ✅ | ❌ | ❌ |
| | Approval / reject pengeluaran kas | ❌ | ✅ | ❌ |
| | Lihat buku kas & saldo | ✅ | ✅ | ❌ |
| **Self-Service Akun** | Ganti password akun sendiri (`/me`) | ✅ | ✅ | ❌ |
| **Portal Transparansi** | Cek tagihan mandiri via nomor HP | — | — | ✅ (`/public/:slug/cek-tagihan`) |
| | Laporan kas publik agregat (tanpa nama) | — | — | ✅ (`/public/:slug`) |

## Project structure

```
kas-transparan/
├── backend/            FastAPI app (app/models, app/schemas, app/routers, app/tests)
├── frontend/           Vite + React app
├── docker-compose.yml  Postgres + backend + frontend for local dev
└── LICENSE             MIT
```

## Contributing

This is an open-source project and contributions are welcome.

1. Fork the repo, create a feature branch off `main`.
2. Keep backend changes covered by pytest tests where it makes sense
   (models/business logic, not UI).
3. Open a PR describing what changed and why. Please don't bundle unrelated
   changes into one PR.
4. Be kind — this tool is meant to help volunteer treasurers who are
   usually doing this on top of a full-time job.

Ideas for future phases (not yet built): WhatsApp reminder bot, QRIS/payment
gateway integration, warga self-service portal, OCR for payment proof
verification.

## License

MIT — see [LICENSE](./LICENSE).
