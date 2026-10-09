"""Database tables. Add new tables phase by phase (see PROJECT_PLAN.md section 3)."""
from datetime import date, datetime, timezone

from sqlalchemy import JSON, BigInteger, Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    role: Mapped[str] = mapped_column(String(10), default="CASHIER")  # CASHIER | OWNER
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Setting(Base):
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(String(200))


class Product(Base):
    """Money is stored as whole kwacha (ZMW; no ngwee yet); quantities are whole numbers."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), index=True)
    category: Mapped[str] = mapped_column(String(50), default="", index=True)
    unit: Mapped[str] = mapped_column(String(20), default="piece")
    selling_price: Mapped[int] = mapped_column(default=0)
    reorder_level: Mapped[int] = mapped_column(default=0)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    batches: Mapped[list["StockBatch"]] = relationship(back_populates="product")


class StockBatch(Base):
    """One delivery of a product; expiry is tracked per batch."""

    __tablename__ = "stock_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity_received: Mapped[int]
    quantity_remaining: Mapped[int]
    cost_price: Mapped[int] = mapped_column(default=0)
    received_at: Mapped[date] = mapped_column(Date)
    expiry_date: Mapped[date | None] = mapped_column(Date, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    product: Mapped[Product] = relationship(back_populates="batches")


class StockAdjustment(Base):
    """Audit row for every manual correction (spoiled, damaged, miscount...)."""

    __tablename__ = "stock_adjustments"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("stock_batches.id"), index=True)
    quantity_change: Mapped[int]  # negative removes stock
    reason: Mapped[str] = mapped_column(String(200))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class DailyRecord(Base):
    """One row per calendar day. DETAILED days have SaleItem rows; TOTAL_ONLY days do not and never touch stock."""

    __tablename__ = "daily_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    mode: Mapped[str] = mapped_column(String(12))  # DETAILED | TOTAL_ONLY
    total_amount: Mapped[int] = mapped_column(BigInteger, default=0)
    note: Mapped[str] = mapped_column(String(300), default="")
    recorded_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    items: Mapped[list["SaleItem"]] = relationship(
        back_populates="record", cascade="all, delete-orphan", order_by="SaleItem.id"
    )


class SaleItem(Base):
    __tablename__ = "sale_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    daily_record_id: Mapped[int] = mapped_column(ForeignKey("daily_records.id"), index=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), index=True)
    quantity: Mapped[int]
    unit_price: Mapped[int] = mapped_column(BigInteger)
    line_total: Mapped[int] = mapped_column(BigInteger)

    record: Mapped[DailyRecord] = relationship(back_populates="items")
    product: Mapped[Product] = relationship()
    allocations: Mapped[list["SaleAllocation"]] = relationship(cascade="all, delete-orphan")


class SaleAllocation(Base):
    """Which batch each sold unit came from (FEFO), so an edit or delete can put stock back exactly."""

    __tablename__ = "sale_allocations"

    id: Mapped[int] = mapped_column(primary_key=True)
    sale_item_id: Mapped[int] = mapped_column(ForeignKey("sale_items.id"), index=True)
    batch_id: Mapped[int] = mapped_column(ForeignKey("stock_batches.id"), index=True)
    quantity: Mapped[int]


class WarningAck(Base):
    """'Mark as handled' for a warning. kind = EXPIRY (ref = batch id) or RESTOCK (ref = product id)."""

    __tablename__ = "warning_acks"
    __table_args__ = (UniqueConstraint("kind", "ref_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    ref_id: Mapped[int]
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class WeeklyReport(Base):
    """Snapshot generated after each week ends, so past weeks can be reviewed exactly as they were."""

    __tablename__ = "weekly_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    week_start: Mapped[date] = mapped_column(Date, unique=True, index=True)
    week_end: Mapped[date] = mapped_column(Date)
    data: Mapped[dict] = mapped_column(JSON)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
