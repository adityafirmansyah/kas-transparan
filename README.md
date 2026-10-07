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

- `docs/screenshot-dashboard.png`
- `docs/screenshot-public-page.png`

## Core features (v1 / MVP)

- **Multi-tenant**: one deployment can serve multiple RT/RW/komunitas, each
  fully isolated (own warga list, own kas, own slug for the public page).
- **Warga management**: add/edit/deactivate residents (nama, no HP, alamat,
  no rumah).
- **Iuran types**: define dues categories (e.g. Iuran Kebersihan, Keamanan,
  Dana Sosial) with nominal amount and period (monthly or one-time).
- **Auto-generate tagihan**: one click creates a billing record for every
  active warga for the current period; safe to re-run (idempotent, skips
  warga who already have a tagihan for that period).
- **Payment recording**: admin/bendahara marks a tagihan lunas, with payment
  method (tunai/transfer) and an optional proof-of-transfer image path —
  automatically creates a matching pemasukan entry in the ledger.
- **Buku kas (cash ledger)**: pemasukan (income, auto from payments or manual
  e.g. donasi) and pengeluaran (expense, manual with category + optional
  receipt image), with running saldo (balance) calculation.
- **Pengeluaran approval workflow**: every expense starts `pending` and must
  be `approved` (or `rejected`) by a `ketua` (chair) role before it affects
  the saldo — lightweight accountability without heavy process.
- **Reports**: monthly summary (total masuk/keluar/saldo) and list of warga
  who haven't paid for a given period.
- **Public transparency page** (`/public/:slug`, no login): the core
  differentiator. Shows aggregate saldo, monthly income/expense totals, and
  expense breakdown by category — **never** individual warga names or
  payment status, to protect privacy.

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

20 tests cover warga CRUD, tagihan auto-generation (incl. idempotency and
inactive-warga skipping), payment recording, kas ledger saldo calculation,
the pengeluaran approval workflow, and the public transparency endpoint
(including a privacy check that no warga name/description leaks).

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
3. Log in via the frontend, add warga, define iuran types, generate tagihan
   for the current month, and start recording payments/expenses.

## Roles

| Role  | Can do |
|-------|--------|
| admin / bendahara | manage warga, iuran types, generate tagihan, record payments, record pemasukan/pengeluaran |
| ketua | read access to warga/tagihan/kas, approve or reject pengeluaran |
| warga | (stretch goal, not in v1) view own tagihan status |
| public (no login) | view the aggregate transparency page at `/public/:slug` |

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
