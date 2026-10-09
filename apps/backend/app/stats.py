"""Sales statistics. Product figures come from itemised days only; total-only days have no product detail."""
from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DailyRecord, Product, SaleAllocation, SaleItem, StockBatch
from app.weekly import configured_week_start, week_bounds

SLOW_MOVER_MAX_UNITS = 2
MAX_RANGE_DAYS = 731


def product_figures(db: Session, start: date, end: date) -> dict[int, dict]:
    """{product_id: {units, revenue, cost}} for itemised sales in the range. cost = what the sold units cost us."""
    rows = db.execute(
        select(SaleItem.product_id, func.sum(SaleItem.quantity), func.sum(SaleItem.line_total))
        .join(DailyRecord, DailyRecord.id == SaleItem.daily_record_id)
        .where(DailyRecord.date.between(start, end))
        .group_by(SaleItem.product_id)
    )
    figures = {pid: {"units": int(u), "revenue": int(r), "cost": 0} for pid, u, r in rows}
    cost_rows = db.execute(
        select(SaleItem.product_id, func.sum(SaleAllocation.quantity * StockBatch.cost_price))
        .join(SaleAllocation, SaleAllocation.sale_item_id == SaleItem.id)
        .join(StockBatch, StockBatch.id == SaleAllocation.batch_id)
        .join(DailyRecord, DailyRecord.id == SaleItem.daily_record_id)
        .where(DailyRecord.date.between(start, end))
        .group_by(SaleItem.product_id)
    )
    for pid, cost in cost_rows:
        figures[pid]["cost"] = int(cost)
    return figures


def trend(db: Session, start: date, end: date) -> tuple[str, list[dict]]:
    """Daily totals for ranges up to ~2 months, weekly totals beyond that."""
    totals = {r.date: r.total_amount for r in db.scalars(select(DailyRecord).where(DailyRecord.date.between(start, end)))}
    days = [start + timedelta(days=i) for i in range((end - start).days + 1)]
    if len(days) <= 62:
        return "day", [{"date": d, "total": totals.get(d, 0)} for d in days]
    week_starts_on = configured_week_start(db)
    buckets: dict[date, int] = {}
    for d in days:
        buckets[week_bounds(d, week_starts_on)[0]] = buckets.get(week_bounds(d, week_starts_on)[0], 0) + totals.get(d, 0)
    return "week", [{"date": d, "total": t} for d, t in sorted(buckets.items())]


def build_stats(db: Session, start: date, end: date, include_profit: bool) -> dict:
    figures = product_figures(db, start, end)
    products = {p.id: p for p in db.scalars(select(Product))}

    rows = []
    for pid, f in figures.items():
        p = products[pid]
        row = {"product_id": pid, "name": p.name, "category": p.category or "Uncategorised", "unit": p.unit,
               "units": f["units"], "revenue": f["revenue"], "cost": None, "profit": None}
        if include_profit:
            row["cost"], row["profit"] = f["cost"], f["revenue"] - f["cost"]
        rows.append(row)
    rows.sort(key=lambda r: (-r["units"], r["name"]))

    categories: dict[str, dict] = {}
    for r in rows:
        c = categories.setdefault(r["category"], {"category": r["category"], "units": 0, "revenue": 0})
        c["units"] += r["units"]
        c["revenue"] += r["revenue"]

    slow = []
    for p in products.values():
        if not p.is_active:
            continue
        on_hand = int(db.scalar(select(func.coalesce(func.sum(StockBatch.quantity_remaining), 0))
                                .where(StockBatch.product_id == p.id)))
        units = figures.get(p.id, {}).get("units", 0)
        if on_hand > 0 and units <= SLOW_MOVER_MAX_UNITS:  # something is sitting on the shelf and barely selling
            slow.append({"product_id": p.id, "name": p.name, "unit": p.unit, "units": units, "quantity_on_hand": on_hand})
    slow.sort(key=lambda s: (s["units"], -s["quantity_on_hand"], s["name"]))

    group, series = trend(db, start, end)
    records = db.execute(select(DailyRecord.mode, func.count(), func.coalesce(func.sum(DailyRecord.total_amount), 0))
                         .where(DailyRecord.date.between(start, end)).group_by(DailyRecord.mode)).all()
    by_mode = {m: (int(n), int(t)) for m, n, t in records}
    detailed_days, detailed_total = by_mode.get("DETAILED", (0, 0))
    total_only_days, total_only_total = by_mode.get("TOTAL_ONLY", (0, 0))

    out = {
        "start": start, "end": end, "products": rows,
        "categories": sorted(categories.values(), key=lambda c: -c["revenue"]),
        "slow_movers": slow[:10], "trend_group": group, "trend": series,
        "total_sales": detailed_total + total_only_total,
        "detailed_days": detailed_days, "total_only_days": total_only_days, "total_only_total": total_only_total,
        "slow_mover_max_units": SLOW_MOVER_MAX_UNITS,
        "revenue_itemised": sum(r["revenue"] for r in rows),
        "profit_total": None, "cost_total": None,
    }
    if include_profit:
        out["cost_total"] = sum(r["cost"] for r in rows)
        out["profit_total"] = out["revenue_itemised"] - out["cost_total"]
    return out
