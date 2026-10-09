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

## Weekly report schedule
- **On Vercel:** `vercel.json` calls `/api/cron/weekly-report` every Monday 06:00 UTC. Set `CRON_SECRET` (long random value) in the project's environment variables; the endpoint refuses requests without it.
- **Locally:** `cd apps/backend && uv run python weekly_report.py` (or schedule it with your OS). Opening the Reports page also creates the last finished week's report if it is missing.

## Who sees what
Both roles can use stock, sales, statistics, warnings and reports. **Profit and cost per product are owner-only** (the API returns `null` for them to cashiers). Full role separation is Phase 6.

## Tests and checks
```bash
cd apps/backend && uv run pytest
cd apps/web && npm run lint && npm run build
```
