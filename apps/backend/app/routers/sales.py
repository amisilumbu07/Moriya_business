from datetime import date, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import sales as sales_service
from app.db import get_db
from app.deps import current_user
from app.models import DailyRecord, SaleItem, User
from app.weekly import week_bounds, week_summary  # noqa: F401  (week_bounds re-exported)

router = APIRouter(prefix="/api", tags=["sales"], dependencies=[Depends(current_user)])


class SaleItemIn(BaseModel):
    product_id: int
    quantity: int = Field(gt=0, le=100_000)
    unit_price: int = Field(ge=0, le=100_000_000)


class DayIn(BaseModel):
    mode: Literal["DETAILED", "TOTAL_ONLY"]
    total_amount: int | None = Field(default=None, ge=0, le=100_000_000_000)
    note: str = Field(default="", max_length=300)
    items: list[SaleItemIn] = Field(default_factory=list, max_length=200)

    @model_validator(mode="after")
    def check_mode(self):
        if self.mode == "DETAILED":
            if not self.items:
                raise ValueError("Add at least one item sold")
            if self.total_amount is not None:
                raise ValueError("Total is calculated from the items")
        else:
            if self.total_amount is None:
                raise ValueError("Enter the day's total amount")
            if self.items:
                raise ValueError("A total-only day cannot have items")
        return self


class SaleItemOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: int
    unit_price: int
    line_total: int


class DayOut(BaseModel):
    date: date
    mode: str
    total_amount: int
    note: str
    items: list[SaleItemOut]


class DaySummary(BaseModel):
    date: date
    mode: str
    total_amount: int
    item_count: int


class WeekDay(BaseModel):
    date: date
    mode: str | None
    total_amount: int


class WeekOut(BaseModel):
    week_start: date
    week_end: date
    total: int
    tithe: int
    offering: int
    remaining: int
    tithe_percent: int
    offering_percent: int
    days: list[WeekDay]


def _day_out(record: DailyRecord) -> DayOut:
    return DayOut(
        date=record.date, mode=record.mode, total_amount=record.total_amount, note=record.note,
        items=[SaleItemOut(id=i.id, product_id=i.product_id, product_name=i.product.name, quantity=i.quantity,
                           unit_price=i.unit_price, line_total=i.line_total) for i in record.items],
    )


def _check_date(day: date) -> None:
    # One day of slack so a store ahead of the server's clock can still record "today".
    if day > date.today() + timedelta(days=1):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "You cannot record sales for a future date")


@router.get("/sales", response_model=list[DaySummary])
def list_days(
    start: date | None = None, end: date | None = None, limit: int = Query(default=100, ge=1, le=366),
    db: Session = Depends(get_db),
):
    counts = (select(SaleItem.daily_record_id, func.count().label("n")).group_by(SaleItem.daily_record_id)).subquery()
    q = (select(DailyRecord, func.coalesce(counts.c.n, 0))
         .outerjoin(counts, counts.c.daily_record_id == DailyRecord.id)
         .order_by(DailyRecord.date.desc()).limit(limit))
    if start:
        q = q.where(DailyRecord.date >= start)
    if end:
        q = q.where(DailyRecord.date <= end)
    return [DaySummary(date=r.date, mode=r.mode, total_amount=r.total_amount, item_count=n) for r, n in db.execute(q)]


@router.get("/sales/{day}", response_model=DayOut)
def get_day(day: date, db: Session = Depends(get_db)):
    record = db.scalar(select(DailyRecord).where(DailyRecord.date == day))
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No sales recorded for this day")
    return _day_out(record)


@router.put("/sales/{day}", response_model=DayOut)
def save_day(day: date, body: DayIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    _check_date(day)
    try:
        record = sales_service.save_day(
            db, day, mode=body.mode, total_amount=body.total_amount, note=body.note.strip(),
            items=[(i.product_id, i.quantity, i.unit_price) for i in body.items], user=user,
        )
        db.commit()
    except sales_service.SaleError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    except Exception:
        db.rollback()
        raise
    return _day_out(record)


@router.delete("/sales/{day}", status_code=status.HTTP_204_NO_CONTENT)
def delete_day(day: date, db: Session = Depends(get_db)):
    record = db.scalar(select(DailyRecord).where(DailyRecord.date == day))
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No sales recorded for this day")
    sales_service.delete_day(db, record)
    db.commit()


@router.get("/weekly", response_model=WeekOut)
def weekly(day: date | None = Query(default=None, alias="date"), db: Session = Depends(get_db)):
    return week_summary(db, day or date.today())
