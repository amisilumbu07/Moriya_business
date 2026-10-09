# Store Inventory & Sales Tracker — Project Plan

A web application for a local over-the-counter store. The cashier records stock and daily sales; the owner sees weekly tithe/offering amounts, sales statistics, and warnings about products that need restocking or are close to expiry.

> **Audience:** this document is written for a junior software engineer. Each phase explains *what* to build, *why*, *how*, and *how to know you're done*. Treat it as the single source of truth: tick the checkboxes as you go and update the document when a decision changes.

---

## 1. Project Overview

### 1.1 Goals
1. Let the cashier **log products (materials) and stock** that come into the store (inventory).
2. **Record daily sales** — either a *detailed list of items sold* or just a *daily total*.
3. Automatically compute the **weekly tithe (10%) and offering (10%)** from the week's earnings.
4. Show **statistical graphs** of which products sell best.
5. Produce **weekly warnings** for products that must be restocked quickly or sold/replaced because they are close to expiry.

### 1.2 Users
| Role | Can do |
|------|--------|
| **Cashier** | Log in, manage stock, record daily sales |
| **Owner** (Phase 6) | Everything above + see tithe/offering, graphs, warnings, manage users |

In Phases 1–5 a single logged-in user can do everything. Roles are separated in Phase 6.

### 1.3 Out of scope (for now)
Online payments, barcode scanners, multi-store support, customer accounts, accounting/tax reports.

### 1.4 Open questions — ask the store owner before Phase 3
These change the maths, so get answers early and record them here:
- [ ] Are tithe and offering calculated on **total sales (revenue)** or on **profit** (sales − purchase cost)? *Default assumed in this plan: total sales.*
- [ ] What does a "week" mean — **Monday–Sunday** or **Sunday–Saturday**? *Default: Monday–Sunday.*
- [ ] What currency and how many decimals? (Affects how money is stored.)
- [ ] Are tithe and offering both 10% (20% total) as stated? *Default: yes, two separate 10% figures.*
- [ ] How many days before expiry should a product trigger a warning? *Default: 14 days, configurable.*

---

## 2. Technology Stack (recommended)

Chosen to be beginner-friendly, one language end to end, and free to host.

| Concern | Choice | Why |
|---------|--------|-----|
| Frontend | **Next.js (App Router) + TypeScript** (`apps/web`) | Pages, forms, charts |
| Backend | **FastAPI (Python 3.12)** (`apps/backend`) | Owns the database, business rules and Excel export |
| Styling | **Tailwind CSS** | Fast, consistent UI |
| Database | **SQLite** file in development, **Neon Postgres** (Vercel Marketplace) in production | SQLite needs zero setup; Neon injects `DATABASE_URL` into Vercel |
| ORM / migrations | **SQLAlchemy 2 + Alembic** | Typed models, versioned schema changes |
| Auth | **Own login in FastAPI**: bcrypt password hashes + signed JWT in an httpOnly cookie | Cashier login, no third-party service |
| Charts | **Recharts** | Simple React charts |
| Validation | **Pydantic** (backend, the source of truth) | Validate all API input |
| Excel export | **openpyxl** | Monthly report as `.xlsx` (see section 11) |
| Testing | **pytest** (backend logic) + **Playwright** (end-to-end, Phase 6) | |
| Hosting | **Vercel Services**: one project, two services (`vercel.json`) | Frontend + backend deploy together; `/api/*` goes to FastAPI |

> **Lesson for the junior:** you may swap any tool, but write the swap and the reason in the *Decision Log* (section 9).

---

## 3. Data Model (draft)

Build this incrementally — add tables only in the phase that needs them.

```
User            id, name, username, passwordHash, role (CASHIER|OWNER), createdAt

Product         id, name, category, unit (piece/kg/litre…), sellingPrice,
                reorderLevel, isActive, createdAt

StockBatch      id, productId → Product, quantityReceived, quantityRemaining,
                costPrice, receivedAt, expiryDate (nullable)
                (one row per delivery; lets us track expiry per batch)

DailyRecord     id, date (unique), mode (DETAILED|TOTAL_ONLY),
                totalAmount, note, recordedById → User

SaleItem        id, dailyRecordId → DailyRecord, productId → Product,
                quantity, unitPrice, lineTotal
                (only used when mode = DETAILED)

Setting         key, value   (tithePercent=10, offeringPercent=10,
                              expiryWarningDays=14, weekStartsOn=1)
```

**Rules to remember**
- Store money as **integers in the smallest unit** (e.g. cents) or `Decimal` — *never* floating-point numbers.
- Selling an item (DETAILED mode) **reduces `quantityRemaining`** on the oldest-expiring batch first (**FEFO** — first-expired, first-out).
- A day in `TOTAL_ONLY` mode has no `SaleItem` rows and does **not** change stock.

---

## 4. Phase Overview

| Phase | Name | Category | Outcome |
|-------|------|----------|---------|
| 1 | Foundation & Authentication | **Core** | Running app, database, cashier can log in |
| 2 | Inventory Management | **Core** | Products and stock batches can be added, edited, viewed |
| 3 | Sales Recording & Weekly Tithe/Offering | **Core** | Daily sales (detailed or total) and weekly 10% / 10% figures |
| 4 | Sales Statistics & Graphs | Enhancement | Charts of best/worst-selling products |
| 5 | Weekly Warnings (Restock & Expiry) | Enhancement | Warning dashboard and weekly summary |
| 6 | Polish, Roles, Reports & Testing | Hardening | Owner/cashier roles, exports, tests, accessibility |
| 7 | Deployment & Maintenance | Release | Live on the internet, backups, monitoring, handover |

**After Phase 3 you have a usable product (MVP).** Phases 4–7 build on it. Do not start a phase until the previous phase's *Definition of Done* is met.

---

## 5. Core Phases (1–3)

### Phase 1 — Foundation & Authentication
**Goal:** a running application skeleton where the cashier can securely log in.

**Learning focus:** project setup, Git, environment variables, hashing passwords, protected routes.

**Tasks**
- [x] Initialise Git; commit `.gitignore` first (already created — confirm `CLAUDE.md` and `.claude/` are ignored with `git check-ignore -v CLAUDE.md`)
- [x] Scaffold Next.js + TypeScript + Tailwind (`apps/web`) and FastAPI (`apps/backend`)
- [x] Add SQLAlchemy + Alembic, create the `User` and `Setting` models, run the first migration
- [x] Create `.env.example` (committed) and `.env` (ignored) with `DATABASE_URL` and `AUTH_SECRET`
- [x] Write a **seed script** that creates one cashier account and default settings
- [x] Build the login page (username + password); validation happens in the backend with Pydantic
- [x] Hash passwords with **bcrypt/argon2** — never store plain text
- [x] Protect all pages except `/login` (middleware/proxy redirect to login)
- [x] App shell: top navigation, logout button, empty Dashboard page
- [x] Write a `README.md` explaining how to install and run

**Suggested folder structure**
```
vercel.json                 tells Vercel about the two services
apps/web/src/app            pages (login, dashboard, inventory, sales…)
apps/web/src/lib            fetch helper, shared types
apps/web/src/components     reusable UI pieces
apps/web/src/proxy.ts       redirects logged-out visitors to /login
apps/backend/main.py        Vercel entrypoint (imports app.main)
apps/backend/app/           config, db, models, security, routers/
apps/backend/migrations/    Alembic schema versions
apps/backend/seed.py        default settings + first accounts
apps/backend/tests/         pytest
/docs              extra notes, screenshots
```

**Definition of Done**
- Visiting any page while logged out redirects to `/login`
- Wrong password shows a clear error; right password reaches the dashboard
- Logging out ends the session
- A new developer can run the app from the README in under 10 minutes

---

### Phase 2 — Inventory Management
**Goal:** the cashier can log every material/product and the stock that arrives.

**Learning focus:** CRUD (create/read/update/delete), relational data, forms, server-side validation, tables.

**Tasks**
- [x] Add `Product` and `StockBatch` models + migration
- [x] **Products page:** list (search + filter by category), add, edit, deactivate (soft delete — don't erase history)
- [x] **Receive stock form:** choose product, quantity, cost price, date received, optional expiry date → creates a `StockBatch`
- [x] **Inventory view:** per product show total quantity on hand (sum of batches), next expiry date, and a "low stock" badge when quantity ≤ `reorderLevel`
- [x] **Stock adjustment:** correct mistakes or record spoiled/damaged goods (with a reason)
- [x] Validation: no negative quantities, prices must be numbers, expiry cannot be before received date
- [x] Utility functions with unit tests: `getQuantityOnHand(productId)`, `getNextExpiry(productId)`

**Definition of Done**
- Cashier can add 10 sample products and receive stock for them
- Quantity on hand is always correct after receiving and adjusting stock
- Low-stock badge appears at the right threshold
- Deactivated products no longer appear in dropdowns but old records still show them

---

### Phase 3 — Sales Recording & Weekly Tithe/Offering
**Goal:** record each day's sales in the way the cashier prefers, and see what is owed each week.

**Learning focus:** transactions, business rules, date handling, aggregating data.

**Tasks**
- [x] Add `DailyRecord` and `SaleItem` models + migration
- [x] **Daily entry page** with a toggle:
  - **Detailed mode:** add rows (product, quantity, price auto-filled but editable) → line totals and day total are calculated
  - **Total-only mode:** one field for the day's total amount
- [x] One record per date; editing a day later must be possible (and must restore/re-deduct stock correctly in detailed mode)
- [x] Use a **database transaction** when saving a detailed day, so stock deduction and sale rows succeed or fail together
- [x] Block selling more than the stock on hand (show a friendly message)
- [x] Deduct stock using **FEFO** (earliest expiry first)
- [x] **Daily history page:** list days, open a day to see its details
- [x] **Weekly summary page:**
  - Week selector (default: current week)
  - Total earnings for the week
  - **Tithe = 10 %** of total, **Offering = 10 %** of total, and **remaining amount**
  - Day-by-day breakdown for the week
- [x] Read percentages and week-start day from `Setting` (don't hard-code 10 or Monday)
- [x] Write unit tests for the money maths (see example below)

**Worked example for tests** (total sales Monday–Sunday = 500 000)
| Item | Calculation | Amount |
|------|-------------|--------|
| Tithe | 10 % × 500 000 | 50 000 |
| Offering | 10 % × 500 000 | 50 000 |
| Remaining | 500 000 − 50 000 − 50 000 | 400 000 |

Also test: a week with no sales (all zeros), rounding (e.g. 10 % of 1 005), and a week that spans two months.

**Definition of Done**
- Cashier can record one day in detailed mode and another in total-only mode
- Stock quantities fall correctly after a detailed day and are restored if the day is deleted/edited
- Weekly page shows correct tithe, offering and remainder that match hand calculations
- All money tests pass

> 🎯 **MVP milestone:** at the end of Phase 3, demo the app to the store owner and collect feedback before continuing.

---

## 6. Enhancement & Release Phases (4–7)

### Phase 4 — Sales Statistics & Graphs
**Goal:** show which products sell and which don't.

**Learning focus:** SQL aggregation (`GROUP BY`), chart libraries, designing readable charts.

**Tasks**
- [x] Query: units sold and revenue per product for a date range
- [x] **Bar chart:** top 10 best-selling products (toggle units / revenue)
- [x] **Line chart:** daily or weekly sales total over time
- [x] **Pie/donut or bar chart:** sales share by category
- [x] Date-range filter: this week, last week, this month, custom
- [x] "Slow movers" list: products with zero or very few sales in the period
- [x] Empty states ("No sales in this period") and loading states
- [x] Note on data quality: total-only days have no product detail, so show a small notice that they're excluded from product charts

**Definition of Done**
- Graphs match numbers you can verify by hand from sample data
- Charts are readable on a phone screen
- Changing the date range updates every chart

---

### Phase 5 — Weekly Warnings (Restock & Expiry)
**Goal:** tell the owner each week what needs action.

**Learning focus:** business rules as code, scheduled jobs, notifications.

**Tasks**
- [x] **Expiry warnings:** list batches expiring within `expiryWarningDays` (colour code: red = expired or ≤ 3 days, orange = ≤ 7, yellow = ≤ 14)
- [x] **Restock warnings:** products at or below `reorderLevel`
- [x] **Smart restock hint:** compare average weekly sales to quantity on hand → "about 2 days of stock left"
- [x] **Warnings page / dashboard card** with counts and a "mark as handled" action
- [x] **Weekly report:** auto-generate every Monday morning (scheduled job / cron) and store it so past weeks can be viewed
- [x] Optional: email or WhatsApp/SMS summary (decide with owner; keep behind a setting)
- [x] Unit tests for date maths (expired today, expires in exactly N days, no expiry date)

**Definition of Done**
- A product with a batch expiring in 5 days appears under the right colour
- A product below its reorder level appears in the restock list
- The weekly report is generated without anyone clicking a button

---

### Phase 6 — Polish, Roles, Reports & Testing
**Goal:** make the app trustworthy and pleasant for daily use.

**Tasks**
- [ ] **Roles:** cashier can record stock/sales; only owner sees tithe/offering, graphs, settings, user management
- [ ] Owner screen to add/disable users and reset passwords
- [ ] **Settings page:** tithe %, offering %, expiry warning days, week start day, currency
- [ ] **Export** weekly summary and inventory to CSV/PDF
- [ ] **Audit trail:** who changed what and when for stock adjustments and edited sales
- [ ] Mobile-friendly layout; large buttons for quick till use
- [ ] Accessibility pass (labels, contrast, keyboard use)
- [ ] Error handling: friendly messages, no raw stack traces
- [ ] Security review: input validation, rate-limit login attempts, authorisation checks on every server action/API route
- [ ] Automated tests: key unit tests + end-to-end test of "log in → receive stock → record sale → view weekly summary"

**Definition of Done**
- A cashier account cannot reach owner-only pages even by typing the URL
- End-to-end test passes in CI
- Another person can use the app on a phone without instructions

---

### Phase 7 — Deployment & Maintenance
**Goal:** the app is live, safe, and maintainable.

**Tasks**
- [ ] Provision Neon Postgres, run `alembic upgrade head` and `seed.py` against it
- [ ] Configure production environment variables (never commit secrets)
- [ ] Deploy (e.g. Vercel); set up preview deployments for branches
- [ ] Custom domain and HTTPS
- [ ] **Backups:** automatic daily database backup + a tested restore procedure
- [ ] Basic monitoring/error logging
- [ ] Set up CI (lint, type-check, tests on every pull request)
- [ ] Write a short **user guide** for the cashier and owner (with screenshots)
- [ ] Hand-over session with the owner and collect final feedback
- [ ] Create a "next ideas" backlog (barcode scanning, supplier list, profit reports, SMS alerts)

**Definition of Done**
- The owner can open the live URL on their phone and log in
- A backup has been restored successfully at least once as a test
- The user guide exists and was followed by a non-developer

---

## 7. Working Practices

**Git workflow**
- `main` is always working; do each task on a short-lived branch (`feature/products-page`)
- Small, frequent commits with clear messages (`Add stock batch model`)
- Open a pull request per feature and review your own diff before merging
- Never commit `.env`, database files, or passwords

**Definition of "task finished"**
1. It works in the browser
2. Inputs are validated
3. Important logic has a test
4. No console errors, lint and type-check pass
5. The checkbox in this document is ticked

**Suggested pacing** (adjust to your availability)
| Phase | Estimate |
|-------|----------|
| 1 | 3–5 days |
| 2 | 5–7 days |
| 3 | 7–10 days |
| 4 | 3–5 days |
| 5 | 4–6 days |
| 6 | 5–7 days |
| 7 | 2–4 days |

---

## 8. Risks & Tips

| Risk | Mitigation |
|------|------------|
| Floating-point money errors | Store integers (smallest currency unit) and test calculations |
| Editing past sales corrupts stock | Use transactions; write tests for edit/delete flows |
| Cashier finds data entry slow | Keep forms keyboard-friendly; auto-fill prices; test with the real cashier after Phase 3 |
| Scope creep | Anything not listed goes in the backlog until after Phase 7 |
| Data loss | Backups in Phase 7; keep SQLite file out of Git; monthly Excel export (section 11) |

---

## 9. Decision Log

Record every significant choice here (date · decision · reason).

| Date | Decision | Reason |
|------|----------|--------|
| 2026-10-09 | Tithe/offering computed on total weekly sales, 10 % each | Matches the original brief; confirm with owner (section 1.4) |
| 2026-10-09 | Stack: Next.js + FastAPI + SQLAlchemy/Alembic, SQLite→Neon Postgres, all on Vercel | Requested by the owner; Python backend owns data and Excel export |
| 2026-10-09 | Quantities are whole numbers; money is whole Zambian kwacha (ZMW, shown as K); stock adjustments target a specific batch and are logged in `stock_adjustments` | Simplest correct model for Phase 2; revisit if the store sells fractional kg/litres |
| 2026-10-09 | Tithe/offering each rounded half-up to a whole unit; remaining = total − tithe − offering (10% of 1 005 → 101 + 101, remaining 803) | Parts always add up to the total; confirm rounding with the owner |
| 2026-10-09 | Each sale line records which batches it drew from (`sale_allocations`) | Edits/deletes restore stock to exactly the right batches |
| 2026-10-09 | UI: five colour skins via CSS variables, toasts, confirm dialogs, live stock checks | Fewer cashier mistakes; skin saved per browser |
| 2026-10-09 | Owner-only profit per product = sales − cost of the exact batches sold (from `sale_allocations`); cashier API responses contain null cost/profit | Profit must never reach the cashier's browser, not just be hidden in the UI |
| 2026-10-09 | Weekly report: Vercel Cron (Mon 06:00 UTC, `CRON_SECRET`) + catch-up when the Reports page is opened + `weekly_report.py` for local scheduling | Report appears without anyone clicking, even if a cron run is missed |
| 2026-10-09 | Smart restock hint uses 28-day average daily sales; products with < 7 days of stock are flagged even above the reorder level | Matches the plan's "compare weekly sales to stock on hand" |
| 2026-10-09 | Currency switched from XAF to Zambian kwacha (ZMW, "K"); amounts are still whole kwacha, ngwee (cents) not supported yet | Requested by the owner; decimals would need money stored in ngwee |
| 2026-10-09 | Monthly Excel export + archiving to stay inside free storage | See section 11 |

---

## 10. Progress Tracker

- [x] Phase 1 — Foundation & Authentication
- [x] Phase 2 — Inventory Management
- [x] Phase 3 — Sales Recording & Weekly Tithe/Offering  *(MVP)*
- [x] Phase 4 — Sales Statistics & Graphs
- [x] Phase 5 — Weekly Warnings
- [ ] Phase 6 — Polish, Roles, Reports & Testing
- [ ] Phase 7 — Deployment & Maintenance

---

## 11. Storage Budget & Monthly Excel Report

**Problem:** the database lives on Vercel's free tier (Neon Postgres, a few hundred MB). Detailed sale lines grow forever, so we keep only what the app needs *right now* in the database and move history to the owner's own computer as Excel files.

### 11.1 What stays in the database vs. what is archived
| Data | Kept in DB | After monthly archive |
|------|-----------|-----------------------|
| Products, users, settings, open stock batches | Always | Unchanged |
| `DailyRecord` totals (one row per day) | Always (tiny) | Kept — weekly tithe/offering and yearly charts still work |
| `SaleItem` detail lines | Current + previous month | **Deleted** once the month is exported and confirmed |
| Fully sold-out / expired `StockBatch` rows | Current + previous month | **Deleted** after export |
| `MonthlySummary` (per product: units, revenue; per month totals) | Always (tiny) | Created at archive time so best-seller graphs still cover old months |

Rough size: a store with 200 sale lines/day ≈ 6 000 rows/month ≈ 1–2 MB/month. Archiving keeps the DB near a constant size instead of growing yearly.

### 11.2 How the monthly report works (built in Phase 6, data model prepared in Phase 3)
1. Owner opens **Reports → Monthly**, picks a month.
2. `GET /api/reports/monthly/{YYYY-MM}.xlsx` — FastAPI builds the workbook with `openpyxl` **in memory** (never written to Vercel's disk, which is read-only and temporary) and streams it to the browser as a download.
3. Workbook sheets: **Summary** (month total, weekly totals, tithe, offering, remainder), **Daily** (one row per day), **Sales detail** (every line sold), **Top products**, **Stock movements & expiries**.
4. The owner saves the file on the PC (e.g. `Reports/2026/2026-09.xlsx`).
5. **Archive step** — a separate button, enabled only after the download: owner types the month to confirm → backend writes the `MonthlySummary` rows and deletes that month's `SaleItem` / finished batches **in one transaction**. Nothing is deleted automatically without this confirmation.
6. A banner on the dashboard shows "Last month not yet exported" after the 3rd of each month, and a **storage meter** (`pg_database_size`) warns the owner above ~70 % of the free allowance.

### 11.3 Safety rules
- Never delete before the owner has downloaded the file (the archive endpoint requires the export of that month to have been requested in the same session, and records `exported_at`).
- Export is idempotent: you can re-download any month still in the DB.
- Test: export → archive → weekly tithe and charts for that month still show the same numbers.

### 11.4 Other ways to stay in the free tier
- Index only what's queried; store money as integers; don't store generated files, PDFs or images in the DB.
- Free Vercel Blob is **not** needed: reports are streamed, not stored.

---

## 12. Running the project locally

```bash
# Backend (terminal 1)
cd apps/backend
cp .env.example .env          # first time only
uv sync
uv run alembic upgrade head   # create tables
uv run python seed.py         # users: owner / cashier (dev passwords in seed.py)
uv run uvicorn main:app --reload --port 8000

# Frontend (terminal 2)
cd apps/web
npm install
npm run dev                   # http://localhost:3000 — /api/* is forwarded to port 8000

# Backend tests
cd apps/backend && uv run pytest
```

## 13. Deploying to Vercel (Phase 7 preview — can be done early)
1. `npm i -g vercel`, then `vercel login` and `vercel link` in the repo root.
2. Provision the database: `vercel integration add neon` (injects `DATABASE_URL`).
3. Set `AUTH_SECRET` (long random string), `APP_ENV=production`, plus `SEED_OWNER_PASSWORD` / `SEED_CASHIER_PASSWORD` locally for seeding.
4. `vercel env pull apps/backend/.env`, then from `apps/backend`: `uv run alembic upgrade head && uv run python seed.py` (runs against Neon from your PC).
5. `vercel deploy` (preview) → `vercel deploy --prod`.
