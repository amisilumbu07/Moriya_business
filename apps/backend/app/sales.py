"""Saving, editing and deleting a day's sales. Stock moves only through these functions."""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DailyRecord, Product, SaleAllocation, SaleItem, StockBatch, User


class SaleError(Exception):
    """A business-rule failure with a message that is safe to show the cashier."""


def restore_stock(db: Session, record: DailyRecord) -> None:
    for item in record.items:
        for alloc in item.allocations:
            batch = db.get(StockBatch, alloc.batch_id)
            if batch is not None:
                batch.quantity_remaining += alloc.quantity


def _take_fefo(db: Session, product: Product, quantity: int, item: SaleItem) -> None:
    """Deduct from the batch that expires first (no-expiry batches last), recording each allocation."""
    batches = db.scalars(
        select(StockBatch)
        .where(StockBatch.product_id == product.id, StockBatch.quantity_remaining > 0)
        .order_by(StockBatch.expiry_date.is_(None), StockBatch.expiry_date, StockBatch.received_at, StockBatch.id)
    ).all()
    available = sum(b.quantity_remaining for b in batches)
    if quantity > available:
        raise SaleError(f"Not enough {product.name} in stock: you entered {quantity} but only {available} are available.")
    left = quantity
    for batch in batches:
        if left == 0:
            break
        take = min(left, batch.quantity_remaining)
        batch.quantity_remaining -= take
        item.allocations.append(SaleAllocation(batch_id=batch.id, quantity=take))
        left -= take


def save_day(db: Session, day: date, *, mode: str, total_amount: int | None, note: str,
             items: list[tuple[int, int, int]], user: User) -> DailyRecord:
    """Create or replace the record for `day`. `items` are (product_id, quantity, unit_price).

    Everything happens in one transaction: on any error the caller rolls back and stock is untouched.
    """
    record = db.scalar(select(DailyRecord).where(DailyRecord.date == day))
    previous_products: set[int] = set()
    if record is None:
        record = DailyRecord(date=day, recorded_by_id=user.id)
        db.add(record)
    else:
        previous_products = {i.product_id for i in record.items}
        restore_stock(db, record)
        record.items.clear()
        db.flush()

    record.mode = mode
    record.note = note
    total = 0
    if mode == "DETAILED":
        # Same product on several rows is fine, but stock is checked per row against what is left.
        for product_id, quantity, unit_price in items:
            product = db.get(Product, product_id)
            if product is None:
                raise SaleError("One of the products no longer exists.")
            if not product.is_active and product_id not in previous_products:
                raise SaleError(f"{product.name} is deactivated and cannot be sold.")
            item = SaleItem(product_id=product_id, quantity=quantity, unit_price=unit_price,
                            line_total=quantity * unit_price)
            _take_fefo(db, product, quantity, item)
            record.items.append(item)
            db.flush()
            total += item.line_total
    else:
        total = total_amount or 0
    record.total_amount = total
    db.flush()
    return record


def delete_day(db: Session, record: DailyRecord) -> None:
    restore_stock(db, record)
    db.delete(record)
