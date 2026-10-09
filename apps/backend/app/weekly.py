from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DailyRecord
from app.money import weekly_split
from app.store_settings import get_int


def week_bounds(day: date, week_starts_on: int) -> tuple[date, date]:
    """`week_starts_on`: 1 = Monday ... 7 = Sunday."""
    start = day - timedelta(days=(day.isoweekday() - week_starts_on) % 7)
    return start, start + timedelta(days=6)


def configured_week_start(db: Session) -> int:
    value = get_int(db, "week_starts_on")
    return value if 1 <= value <= 7 else 1


def week_summary(db: Session, day: date) -> dict:
    week_starts_on = configured_week_start(db)
    start, end = week_bounds(day, week_starts_on)
    records = {r.date: r for r in db.scalars(select(DailyRecord).where(DailyRecord.date.between(start, end)))}
    days = [
        {"date": d, "mode": records[d].mode if d in records else None,
         "total_amount": records[d].total_amount if d in records else 0}
        for d in (start + timedelta(days=i) for i in range(7))
    ]
    total = sum(d["total_amount"] for d in days)
    tithe_pct, offering_pct = get_int(db, "tithe_percent"), get_int(db, "offering_percent")
    tithe, offering, remaining = weekly_split(total, tithe_pct, offering_pct)
    return {"week_start": start, "week_end": end, "total": total, "tithe": tithe, "offering": offering,
            "remaining": remaining, "tithe_percent": tithe_pct, "offering_percent": offering_pct, "days": days}
