"""Weekly warnings: stock close to (or past) expiry and products that need restocking."""
from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import DailyRecord, Product, SaleItem, StockBatch, WarningAck
from app.store_settings import get_int

SALES_WINDOW_DAYS = 28
FAST_SELLING_DAYS = 7  # restock even above the reorder level if stock would last less than this


def expiry_severity(days_left: int) -> str:
    """red = expired or <= 3 days, orange = <= 7, yellow = anything else inside the warning window."""
    if days_left <= 3:
        return "red"
    if days_left <= 7:
        return "orange"
    return "yellow"


def _naive(dt: datetime) -> datetime:
    return dt.replace(tzinfo=None)


def _acks(db: Session, kind: str) -> dict[int, datetime]:
    return {a.ref_id: a.created_at for a in db.scalars(select(WarningAck).where(WarningAck.kind == kind))}


def expiry_warnings(db: Session, today: date) -> list[dict]:
    window = get_int(db, "expiry_warning_days")
    acks = _acks(db, "EXPIRY")
    rows = db.execute(
        select(StockBatch, Product)
        .join(Product, Product.id == StockBatch.product_id)
        .where(StockBatch.quantity_remaining > 0, StockBatch.expiry_date.is_not(None),
               StockBatch.expiry_date <= today + timedelta(days=window))
        .order_by(StockBatch.expiry_date, Product.name)
    )
    return [
        {"batch_id": b.id, "product_id": p.id, "product_name": p.name, "unit": p.unit,
         "quantity_remaining": b.quantity_remaining, "expiry_date": b.expiry_date,
         "days_left": (b.expiry_date - today).days, "severity": expiry_severity((b.expiry_date - today).days),
         "handled": b.id in acks}
        for b, p in rows
    ]


def average_daily_sales(db: Session, product_id: int, today: date) -> float:
    start = today - timedelta(days=SALES_WINDOW_DAYS - 1)
    units = db.scalar(
        select(func.coalesce(func.sum(SaleItem.quantity), 0))
        .join(DailyRecord, DailyRecord.id == SaleItem.daily_record_id)
        .where(SaleItem.product_id == product_id, DailyRecord.date.between(start, today))
    )
    return int(units) / SALES_WINDOW_DAYS


def restock_warnings(db: Session, today: date) -> list[dict]:
    acks = _acks(db, "RESTOCK")
    out = []
    for p in db.scalars(select(Product).where(Product.is_active.is_(True)).order_by(Product.name)):
        on_hand = int(db.scalar(select(func.coalesce(func.sum(StockBatch.quantity_remaining), 0))
                                .where(StockBatch.product_id == p.id)))
        daily = average_daily_sales(db, p.id, today)
        days_left = round(on_hand / daily) if daily > 0 else None
        reasons = []
        if on_hand <= p.reorder_level:
            reasons.append("OUT_OF_STOCK" if on_hand == 0 else "LOW_STOCK")
        if days_left is not None and days_left < FAST_SELLING_DAYS and not reasons:
            reasons.append("SELLING_FAST")
        if not reasons:
            continue
        # A "handled" restock warning comes back once new stock has arrived and run low again.
        ack_time = acks.get(p.id)
        last_received = db.scalar(select(func.max(StockBatch.created_at)).where(StockBatch.product_id == p.id))
        handled = ack_time is not None and (last_received is None or _naive(ack_time) >= _naive(last_received))
        out.append({"product_id": p.id, "product_name": p.name, "unit": p.unit, "quantity_on_hand": on_hand,
                    "reorder_level": p.reorder_level, "avg_daily_sales": round(daily, 2), "days_left": days_left,
                    "reasons": reasons, "handled": handled})
    out.sort(key=lambda w: (w["days_left"] is None, w["days_left"] if w["days_left"] is not None else 0, w["product_name"]))
    return out


def all_warnings(db: Session, today: date) -> dict:
    expiry, restock = expiry_warnings(db, today), restock_warnings(db, today)
    return {"expiry": expiry, "restock": restock,
            "counts": {"expiry": sum(not w["handled"] for w in expiry), "restock": sum(not w["handled"] for w in restock)}}
