import hmac
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.db import get_db
from app.deps import current_user
from app.models import Product, StockBatch, User, WarningAck, WeeklyReport
from app.reports import generate_report, last_completed_week_start
from app.warnings import all_warnings

router = APIRouter(prefix="/api", tags=["warnings"])


class HandleIn(BaseModel):
    kind: Literal["EXPIRY", "RESTOCK"]
    ref_id: int


@router.get("/warnings")
def warnings(_: User = Depends(current_user), db: Session = Depends(get_db)):
    return all_warnings(db, date.today())


@router.post("/warnings/handle", status_code=status.HTTP_204_NO_CONTENT)
def mark_handled(body: HandleIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    target = db.get(StockBatch if body.kind == "EXPIRY" else Product, body.ref_id)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Warning target not found")
    ack = db.scalar(select(WarningAck).where(WarningAck.kind == body.kind, WarningAck.ref_id == body.ref_id))
    if ack:
        db.delete(ack)
        db.flush()
    db.add(WarningAck(kind=body.kind, ref_id=body.ref_id, user_id=user.id))
    db.commit()


@router.delete("/warnings/handle", status_code=status.HTTP_204_NO_CONTENT)
def unmark_handled(kind: Literal["EXPIRY", "RESTOCK"] = Query(), ref_id: int = Query(),
                   _: User = Depends(current_user), db: Session = Depends(get_db)):
    ack = db.scalar(select(WarningAck).where(WarningAck.kind == kind, WarningAck.ref_id == ref_id))
    if ack:
        db.delete(ack)
        db.commit()


# ---- weekly reports -------------------------------------------------------

@router.get("/reports")
def list_reports(_: User = Depends(current_user), db: Session = Depends(get_db)):
    """Newest first. Catches up on the last finished week if the Monday cron has not run yet."""
    today = date.today()
    generate_report(db, last_completed_week_start(db, today), today)
    db.commit()
    rows = db.scalars(select(WeeklyReport).order_by(WeeklyReport.week_start.desc()).limit(104))
    return [{"week_start": r.week_start, "week_end": r.week_end, "generated_at": r.generated_at} for r in rows]


@router.get("/reports/{week_start}")
def get_report(week_start: date, _: User = Depends(current_user), db: Session = Depends(get_db)):
    r = db.scalar(select(WeeklyReport).where(WeeklyReport.week_start == week_start))
    if r is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No report for that week")
    return {"week_start": r.week_start, "week_end": r.week_end, "generated_at": r.generated_at, **r.data}


@router.get("/cron/weekly-report")
def cron_weekly_report(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Called by Vercel Cron every Monday morning (see vercel.json)."""
    if not settings.cron_secret:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "CRON_SECRET is not configured")
    expected = f"Bearer {settings.cron_secret}"
    if not authorization or not hmac.compare_digest(authorization, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid cron credentials")
    today = date.today()
    report = generate_report(db, last_completed_week_start(db, today), today)
    db.commit()
    return {"week_start": report.week_start, "week_end": report.week_end}
