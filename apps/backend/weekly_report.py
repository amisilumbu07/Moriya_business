"""Generate the report for the last finished week (use this for a local scheduled job; Vercel uses cron).

Usage:  uv run python weekly_report.py
"""
from datetime import date

from app.db import SessionLocal
from app.reports import generate_report, last_completed_week_start


def main() -> None:
    today = date.today()
    with SessionLocal() as db:
        week = last_completed_week_start(db, today)
        generate_report(db, week, today)
        db.commit()
    print(f"Report ready for week starting {week}.")


if __name__ == "__main__":
    main()
