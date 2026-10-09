from sqlalchemy.orm import Session

from app.models import Setting

DEFAULTS = {"tithe_percent": 10, "offering_percent": 10, "expiry_warning_days": 14, "week_starts_on": 1}


def get_int(db: Session, key: str) -> int:
    row = db.get(Setting, key)
    try:
        return int(row.value) if row else DEFAULTS[key]
    except ValueError:
        return DEFAULTS[key]
