"""Database tables. Add new tables phase by phase (see PROJECT_PLAN.md section 3)."""
from datetime import date, datetime, timezone

from sqlalchemy import Date, DateTime, ForeignKey, String
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
    """Money is stored as whole currency units (XAF has no decimals); quantities are whole numbers."""

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
