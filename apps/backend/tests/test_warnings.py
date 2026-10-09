from datetime import date, timedelta

import pytest

from app.config import settings
from app.db import SessionLocal
from app.models import Setting
from app.reports import generate_report
from app.warnings import expiry_severity, expiry_warnings, restock_warnings
from tests.conftest_helpers import fresh_db, login, product, receive, sell

TODAY = date(2026, 10, 1)


@pytest.fixture()
def client():
    fresh_db()
    c = login("cashier")
    yield c
    c.close()


def iso(days):
    return (TODAY + timedelta(days=days)).isoformat()


def test_severity_boundaries():
    assert [expiry_severity(d) for d in (-5, 0, 3, 4, 7, 8, 14)] == [
        "red", "red", "red", "orange", "orange", "yellow", "yellow"]


def test_expiry_date_maths(client):
    pid = product(client)
    for offset in (-1, 0, 3, 4, 7, 8, 14, 15):
        receive(client, pid, 5, expiry=iso(offset))
    receive(client, pid, 5)                                  # no expiry date -> never warns
    receive(client, pid, 0 + 1, expiry=iso(1))               # will be emptied below
    batches = client.get(f"/api/products/{pid}/batches").json()
    empty = next(b for b in batches if b["expiry_date"] == iso(1))
    client.post("/api/stock/adjust", json={"batch_id": empty["id"], "quantity_change": -1, "reason": "gone"})
    with SessionLocal() as db:
        got = [(w["days_left"], w["severity"]) for w in expiry_warnings(db, TODAY)]
    assert got == [(-1, "red"), (0, "red"), (3, "red"), (4, "orange"), (7, "orange"), (8, "yellow"), (14, "yellow")]


def test_batch_expiring_in_five_days_is_orange(client):
    pid = product(client)
    receive(client, pid, 5, expiry=iso(5))
    with SessionLocal() as db:
        w = expiry_warnings(db, TODAY)
    assert len(w) == 1 and w[0]["severity"] == "orange" and w[0]["days_left"] == 5


def test_warning_window_comes_from_settings(client):
    pid = product(client)
    receive(client, pid, 5, expiry=iso(8))
    receive(client, pid, 5, expiry=iso(6))
    with SessionLocal() as db:
        db.add(Setting(key="expiry_warning_days", value="7"))
        db.commit()
        assert [w["days_left"] for w in expiry_warnings(db, TODAY)] == [6]


def test_restock_list_and_reasons(client):
    low = product(client, "Low", reorder=5)
    out = product(client, "Out", reorder=5)
    fine = product(client, "Fine", reorder=5)
    receive(client, low, 5)
    receive(client, fine, 6)
    with SessionLocal() as db:
        got = {w["product_name"]: w["reasons"] for w in restock_warnings(db, date.today())}
    assert got == {"Low": ["LOW_STOCK"], "Out": ["OUT_OF_STOCK"]}


def test_selling_fast_product_is_flagged_with_days_left(client):
    pid = product(client, "Fast", reorder=0)
    receive(client, pid, 33)
    today = date.today()
    sell(client, (today - timedelta(days=2)).isoformat(), (pid, 28, 100))
    with SessionLocal() as db:
        w = restock_warnings(db, today)
    assert len(w) == 1 and w[0]["reasons"] == ["SELLING_FAST"]
    assert w[0]["avg_daily_sales"] == 1.0 and w[0]["days_left"] == 5


def test_mark_expiry_handled_and_unhandle(client):
    pid = product(client)
    batch = receive(client, pid, 5, expiry=(date.today() + timedelta(days=2)).isoformat())
    assert client.get("/api/warnings").json()["counts"]["expiry"] == 1
    assert client.post("/api/warnings/handle", json={"kind": "EXPIRY", "ref_id": batch["id"]}).status_code == 204
    w = client.get("/api/warnings").json()
    assert w["counts"]["expiry"] == 0 and w["expiry"][0]["handled"] is True
    client.delete(f"/api/warnings/handle?kind=EXPIRY&ref_id={batch['id']}")
    assert client.get("/api/warnings").json()["counts"]["expiry"] == 1
    assert client.post("/api/warnings/handle", json={"kind": "EXPIRY", "ref_id": 9999}).status_code == 404


def test_handled_restock_returns_after_new_stock_runs_low_again(client):
    pid = product(client, reorder=5)
    receive(client, pid, 3)
    assert client.post("/api/warnings/handle", json={"kind": "RESTOCK", "ref_id": pid}).status_code == 204
    assert client.get("/api/warnings").json()["counts"]["restock"] == 0
    batch = receive(client, pid, 20)                           # restocked: warning gone
    assert client.get("/api/warnings").json()["restock"] == []
    client.post("/api/stock/adjust", json={"batch_id": batch["id"], "quantity_change": -19, "reason": "sold off"})
    w = client.get("/api/warnings").json()
    assert w["counts"]["restock"] == 1 and w["restock"][0]["handled"] is False


def test_warnings_require_login():
    fresh_db()
    from fastapi.testclient import TestClient
    from app.main import app
    with TestClient(app) as anon:
        assert anon.get("/api/warnings").status_code == 401
        assert anon.get("/api/stats?start=2026-09-01&end=2026-09-30").status_code == 401


# ---- weekly report --------------------------------------------------------

def test_generate_report_stores_week_numbers_and_snapshot(client):
    pid = product(client, reorder=0)
    receive(client, pid, 50)
    sell(client, "2026-09-21", (pid, 10, 1000))
    client.put("/api/sales/2026-09-22", json={"mode": "TOTAL_ONLY", "total_amount": 90_000})
    with SessionLocal() as db:
        report = generate_report(db, date(2026, 9, 23), TODAY)   # any day in the week resolves to Monday
        db.commit()
        assert report.week_start == date(2026, 9, 21)
        assert report.data["week"]["total"] == 100_000 and report.data["week"]["tithe"] == 10_000
        assert report.data["top_products"][0]["units"] == 10
        again = generate_report(db, date(2026, 9, 21), TODAY)    # idempotent
        assert again.id == report.id
    r = client.get("/api/reports/2026-09-21").json()
    assert r["week"]["remaining"] == 80_000


def test_cron_requires_secret_and_generates_report(client, monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "")
    assert client.get("/api/cron/weekly-report").status_code == 503
    monkeypatch.setattr(settings, "cron_secret", "s3cret")
    assert client.get("/api/cron/weekly-report").status_code == 401
    assert client.get("/api/cron/weekly-report", headers={"Authorization": "Bearer nope"}).status_code == 401
    r = client.get("/api/cron/weekly-report", headers={"Authorization": "Bearer s3cret"})
    assert r.status_code == 200
    assert client.get("/api/cron/weekly-report", headers={"Authorization": "Bearer s3cret"}).status_code == 200
    reports = client.get("/api/reports").json()
    assert [x["week_start"] for x in reports] == [r.json()["week_start"]]  # one row, not two


def test_listing_reports_catches_up_without_cron(client):
    reports = client.get("/api/reports").json()
    assert len(reports) == 1
    assert client.get("/api/reports/1999-01-04").status_code == 404
