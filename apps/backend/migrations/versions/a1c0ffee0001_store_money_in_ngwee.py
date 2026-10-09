"""store money in ngwee

Revision ID: a1c0ffee0001
Revises: 32979e9bb05d
Create Date: 2026-10-09 17:34:40.194131

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1c0ffee0001'
down_revision: Union[str, Sequence[str], None] = '32979e9bb05d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


MONEY_COLUMNS = [
    ("products", "selling_price"),
    ("stock_batches", "cost_price"),
    ("sale_items", "unit_price"),
    ("sale_items", "line_total"),
    ("daily_records", "total_amount"),
]


def _rescale_report(data: dict, convert) -> dict:
    """Saved weekly reports hold money too; rescale it so old reports stay correct."""
    week = data.get("week") or {}
    for key in ("total", "tithe", "offering", "remaining"):
        if key in week:
            week[key] = convert(week[key])
    for day in week.get("days", []):
        day["total_amount"] = convert(day["total_amount"])
    for row in data.get("top_products", []):
        row["revenue"] = convert(row["revenue"])
    return data


def _rescale(convert_sql: str, convert) -> None:
    bind = op.get_bind()
    for table, column in MONEY_COLUMNS:
        bind.execute(sa.text(f"UPDATE {table} SET {column} = {column} {convert_sql}"))
    reports = sa.table("weekly_reports", sa.column("id", sa.Integer), sa.column("data", sa.JSON))
    for report_id, data in bind.execute(sa.select(reports.c.id, reports.c.data)).all():
        bind.execute(reports.update().where(reports.c.id == report_id).values(data=_rescale_report(data, convert)))


def upgrade() -> None:
    """Whole kwacha -> ngwee (x100). Column types are unchanged; only the unit of the numbers changes."""
    _rescale("* 100", lambda v: v * 100)


def downgrade() -> None:
    """ngwee -> whole kwacha. Rounds to the nearest kwacha, so fractional amounts lose their ngwee."""
    bind = op.get_bind()
    for table, column in MONEY_COLUMNS:
        bind.execute(sa.text(f"UPDATE {table} SET {column} = ({column} + 50) / 100"))
    reports = sa.table("weekly_reports", sa.column("id", sa.Integer), sa.column("data", sa.JSON))
    for report_id, data in bind.execute(sa.select(reports.c.id, reports.c.data)).all():
        bind.execute(reports.update().where(reports.c.id == report_id).values(data=_rescale_report(data, lambda v: (v + 50) // 100)))
