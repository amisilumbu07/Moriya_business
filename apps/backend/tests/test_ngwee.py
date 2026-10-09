"""Money is stored in ngwee (1/100 kwacha). Covers the conversion migration and ngwee-level maths."""
import json
import os
import sqlite3
import subprocess
import sys
from pathlib import Path

import pytest

from app.money import weekly_split
from tests.conftest_helpers import fresh_db, login, product, receive, sell

BACKEND = Path(__file__).resolve().parent.parent
PREVIOUS_REVISION = "32979e9bb05d"


def alembic(db_file: Path, *args: str):
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db_file}"}
    r = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=env, capture_output=True, text=True)
    assert r.returncode == 0, r.stderr[-800:]


def test_migration_converts_kwacha_to_ngwee_and_back(tmp_path):
    db = tmp_path / "mig.db"
    alembic(db, "upgrade", PREVIOUS_REVISION)
    con = sqlite3.connect(db)
    con.execute("insert into users (id,name,username,password_hash,role,is_active,created_at) values (1,'o','o','x','OWNER',1,'2026-01-01')")
    con.execute("insert into products (id,name,category,unit,selling_price,reorder_level,is_active,created_at) values (1,'Rice','','piece',1500,0,1,'2026-01-01')")
    con.execute("insert into stock_batches (id,product_id,quantity_received,quantity_remaining,cost_price,received_at,created_at) values (1,1,10,10,1100,'2026-01-01','2026-01-01')")
    con.execute("insert into daily_records (id,date,mode,total_amount,note,recorded_by_id,created_at,updated_at) values (1,'2026-01-02','DETAILED',3000,'',1,'2026-01-02','2026-01-02')")
    con.execute("insert into sale_items (id,daily_record_id,product_id,quantity,unit_price,line_total) values (1,1,1,2,1500,3000)")
    report = {"week": {"total": 3000, "tithe": 300, "offering": 300, "remaining": 2400, "days": [{"date": "2026-01-02", "mode": "DETAILED", "total_amount": 3000}]},
              "top_products": [{"name": "Rice", "unit": "piece", "units": 2, "revenue": 3000}]}
    con.execute("insert into weekly_reports (week_start,week_end,data,generated_at) values ('2025-12-29','2026-01-04',?,'2026-01-05')", (json.dumps(report),))
    con.commit(); con.close()

    alembic(db, "upgrade", "head")
    con = sqlite3.connect(db)
    assert con.execute("select selling_price from products").fetchone() == (150_000,)
    assert con.execute("select cost_price from stock_batches").fetchone() == (110_000,)
    assert con.execute("select unit_price, line_total from sale_items").fetchone() == (150_000, 300_000)
    assert con.execute("select total_amount from daily_records").fetchone() == (300_000,)
    data = json.loads(con.execute("select data from weekly_reports").fetchone()[0])
    assert data["week"]["total"] == 300_000 and data["week"]["tithe"] == 30_000
    assert data["week"]["days"][0]["total_amount"] == 300_000 and data["top_products"][0]["revenue"] == 300_000
    assert con.execute("select quantity_received, quantity_remaining from stock_batches").fetchone() == (10, 10)  # quantities untouched
    con.close()

    alembic(db, "downgrade", PREVIOUS_REVISION)
    con = sqlite3.connect(db)
    assert con.execute("select selling_price from products").fetchone() == (1500,)
    assert con.execute("select total_amount from daily_records").fetchone() == (3000,)
    assert json.loads(con.execute("select data from weekly_reports").fetchone()[0])["week"]["total"] == 3000
    con.close()


def test_tithe_on_ngwee_amounts():
    assert weekly_split(50_000_000, 10, 10) == (5_000_000, 5_000_000, 40_000_000)   # K500,000 -> K50,000 each
    assert weekly_split(1_005, 10, 10) == (101, 101, 803)                           # K10.05 -> 10.1 ngwee each, rounded half up
    assert weekly_split(1_234, 10, 10) == (123, 123, 988)                           # K12.34: parts add up to the total


@pytest.fixture()
def owner():
    fresh_db()
    c = login("owner")
    yield c
    c.close()


def test_ngwee_prices_flow_through_sales_profit_and_weekly(owner):
    pid = product(owner, price=1250)                       # K12.50
    receive(owner, pid, 10, cost=875)                      # cost K8.75
    day = sell(owner, "2026-09-10", (pid, 3, 1250))        # 3 x K12.50
    assert day["total_amount"] == 3750                     # K37.50 exactly, no float error
    stats = owner.get("/api/stats?start=2026-09-01&end=2026-09-30").json()["products"][0]
    assert (stats["revenue"], stats["cost"], stats["profit"]) == (3750, 2625, 1125)  # K37.50, K26.25, K11.25
    w = owner.get("/api/weekly?date=2026-09-10").json()
    assert (w["total"], w["tithe"], w["offering"], w["remaining"]) == (3750, 375, 375, 3000)   # K3.75 / K3.75 / K30.00


def test_total_only_day_accepts_ngwee(owner):
    r = owner.put("/api/sales/2026-09-10", json={"mode": "TOTAL_ONLY", "total_amount": 123_456})  # K1,234.56
    assert r.status_code == 200 and r.json()["total_amount"] == 123_456
