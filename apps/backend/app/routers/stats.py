from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.stats import MAX_RANGE_DAYS, build_stats

router = APIRouter(prefix="/api", tags=["stats"])


@router.get("/stats")
def stats(start: date, end: date, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Profit/cost fields are filled in for the owner only; the cashier gets null."""
    if end < start:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "The end date is before the start date")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Choose a range of two years or less")
    return build_stats(db, start, end, include_profit=user.role == "OWNER")
