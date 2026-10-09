"""Create default settings and the first accounts.

Usage:  uv run python seed.py
Set SEED_OWNER_PASSWORD / SEED_CASHIER_PASSWORD in the environment to choose
passwords; otherwise development defaults are used (never do that in production).
"""
import os

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import Setting, User
from app.security import hash_password

DEFAULT_SETTINGS = {
    "tithe_percent": "10",
    "offering_percent": "10",
    "expiry_warning_days": "14",
    "week_starts_on": "1",  # 1 = Monday ... 7 = Sunday
    "currency": "ZMW",
}


def main() -> None:
    owner_pw = os.environ.get("SEED_OWNER_PASSWORD")
    cashier_pw = os.environ.get("SEED_CASHIER_PASSWORD")
    if settings.is_production and not (owner_pw and cashier_pw):
        raise SystemExit("Set SEED_OWNER_PASSWORD and SEED_CASHIER_PASSWORD for production.")

    with SessionLocal() as db:
        for key, value in DEFAULT_SETTINGS.items():
            if db.get(Setting, key) is None:
                db.add(Setting(key=key, value=value))
        for name, username, role, pw in [
            ("Store Owner", "owner", "OWNER", owner_pw or "owner-dev-pass"),
            ("Cashier", "cashier", "CASHIER", cashier_pw or "cashier-dev-pass"),
        ]:
            if db.scalar(select(User).where(User.username == username)) is None:
                db.add(User(name=name, username=username, role=role, password_hash=hash_password(pw)))
        db.commit()
    print("Seed complete.")


if __name__ == "__main__":
    main()
