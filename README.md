# Store Inventory & Sales Tracker

Next.js frontend (`apps/web`) + FastAPI backend (`apps/backend`). See `PROJECT_PLAN.md` for the roadmap.

## Requirements
Node 20+, Python 3.12+, [uv](https://docs.astral.sh/uv/).

## Run locally
```bash
# Terminal 1 — backend
cd apps/backend
cp .env.example .env            # first time only
uv sync
uv run alembic upgrade head     # create tables
uv run python seed.py           # default settings + owner/cashier accounts
uv run uvicorn main:app --reload --port 8000

# Terminal 2 — frontend
cd apps/web
npm install
npm run dev                     # http://localhost:3000 (/api/* is forwarded to port 8000)
```

## Development logins (from `seed.py`)
| Role | Username | Password |
|------|----------|----------|
| Owner | `owner` | `owner-dev-pass` |
| Cashier | `cashier` | `cashier-dev-pass` |

Set `SEED_OWNER_PASSWORD` / `SEED_CASHIER_PASSWORD` before seeding to choose your own. They are **required** when `APP_ENV=production`.

## Tests and checks
```bash
cd apps/backend && uv run pytest
cd apps/web && npm run lint && npm run build
```
