"""Weekly report snapshots. Generated automatically every Monday (cron) and stored for later viewing."""
import json
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import WeeklyReport
from app.stats import build_stats
from app.warnings import all_warnings
from app.weekly import configured_week_start, week_bounds, week_summary


def last_completed_week_start(db: Session, today: date) -> date:
    return week_bounds(today, configured_week_start(db))[0] - timedelta(days=7)


def generate_report(db: Session, week_start: date, today: date, force: bool = False) -> WeeklyReport:
    existing = db.scalar(select(WeeklyReport).where(WeeklyReport.week_start == week_start))
    if existing and not force:
        return existing
    summary = week_summary(db, week_start)
    stats = build_stats(db, summary["week_start"], summary["week_end"], include_profit=False)
    data = {
        "week": summary,
        "top_products": [{k: r[k] for k in ("name", "unit", "units", "revenue")} for r in stats["products"][:5]],
        "total_only_days": stats["total_only_days"],
        "warnings": all_warnings(db, today),
        "slow_movers": stats["slow_movers"],
    }
    data = json.loads(json.dumps(data, default=str))  # dates -> ISO strings so it fits a JSON column
    if existing:
        existing.data = data
        report = existing
    else:
        report = WeeklyReport(week_start=summary["week_start"], week_end=summary["week_end"], data=data)
        db.add(report)
    db.flush()
    return report
