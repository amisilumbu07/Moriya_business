"""Stock maths shared by routers (and, later, sales and warnings)."""
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import StockBatch


def get_quantity_on_hand(db: Session, product_id: int) -> int:
    total = db.scalar(
        select(func.coalesce(func.sum(StockBatch.quantity_remaining), 0)).where(StockBatch.product_id == product_id)
    )
    return int(total)


def get_next_expiry(db: Session, product_id: int) -> date | None:
    """Earliest expiry among batches that still have stock."""
    return db.scalar(
        select(func.min(StockBatch.expiry_date)).where(
            StockBatch.product_id == product_id,
            StockBatch.quantity_remaining > 0,
            StockBatch.expiry_date.is_not(None),
        )
    )


def is_low_stock(quantity_on_hand: int, reorder_level: int) -> bool:
    return quantity_on_hand <= reorder_level
