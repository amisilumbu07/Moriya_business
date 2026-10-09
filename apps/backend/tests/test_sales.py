import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

import pytest
from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import Setting, User
from app.money import percent_of, weekly_split
from app.security import hash_password
from app.routers.sales import week_bounds
from datetime import date


@pytest.fixture()
def client():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.add(User(name="Cashier", username="cashier", role="CASHIER", password_hash=hash_password("secret123")))
        db.commit()
    with TestClient(app) as c:
        c.post("/api/auth/login", json={"username": "cashier", "password": "secret123"})
        yield c


# ---- money maths --------------------------------------------------------

def test_worked_example():
    assert weekly_split(500_000, 10, 10) == (50_000, 50_000, 400_000)


def test_zero_week():
    assert weekly_split(0, 10, 10) == (0, 0, 0)


def test_rounding_half_up_and_parts_always_add_up():
    assert percent_of(1005, 10) == 101
    tithe, offering, remaining = weekly_split(1005, 10, 10)
    assert (tithe, offering, remaining) == (101, 101, 803)
    assert tithe + offering + remaining == 1005
    assert percent_of(1004, 10) == 100


def test_week_bounds_monday_and_sunday_start():
    wed = date(2026, 10, 7)
    assert week_bounds(wed, 1) == (date(2026, 10, 5), date(2026, 10, 11))
    assert week_bounds(date(2026, 10, 11), 1) == (date(2026, 10, 5), date(2026, 10, 11))  # Sunday
    assert week_bounds(wed, 7) == (date(2026, 10, 4), date(2026, 10, 10))


# ---- helpers ------------------------------------------------------------

def product(client, name="Rice", price=1000):
    return client.post("/api/products", json={"name": name, "selling_price": price, "reorder_level": 0}).json()["id"]


def receive(client, pid, qty, expiry=None):
    return client.post("/api/stock/receive", json={
        "product_id": pid, "quantity": qty, "cost_price": 1, "received_at": "2026-09-01", "expiry_date": expiry}).json()


def on_hand(client, pid):
    return next(p for p in client.get("/api/products?include_inactive=true").json() if p["id"] == pid)["quantity_on_hand"]


def sell(client, day, pid, qty, price=1000):
    return client.put(f"/api/sales/{day}", json={
        "mode": "DETAILED", "items": [{"product_id": pid, "quantity": qty, "unit_price": price}]})


# ---- sales --------------------------------------------------------------

def test_detailed_day_totals_and_deducts_stock(client):
    pid = product(client)
    receive(client, pid, 10)
    r = client.put("/api/sales/2026-10-05", json={"mode": "DETAILED", "items": [
        {"product_id": pid, "quantity": 3, "unit_price": 1000}, {"product_id": pid, "quantity": 2, "unit_price": 900}]})
    assert r.status_code == 200, r.text
    assert r.json()["total_amount"] == 4800
    assert on_hand(client, pid) == 5


def test_total_only_day_does_not_touch_stock(client):
    pid = product(client)
    receive(client, pid, 10)
    r = client.put("/api/sales/2026-10-05", json={"mode": "TOTAL_ONLY", "total_amount": 25_000})
    assert r.status_code == 200 and r.json()["items"] == []
    assert on_hand(client, pid) == 10


def test_cannot_sell_more_than_stock_and_nothing_changes(client):
    pid = product(client)
    receive(client, pid, 5)
    r = sell(client, "2026-10-05", pid, 6)
    assert r.status_code == 409 and "only 5" in r.json()["detail"]
    assert on_hand(client, pid) == 5
    assert client.get("/api/sales/2026-10-05").status_code == 404


def test_failure_mid_day_rolls_back_earlier_rows(client):
    a, b = product(client, "A"), product(client, "B")
    receive(client, a, 10)
    receive(client, b, 1)
    r = client.put("/api/sales/2026-10-05", json={"mode": "DETAILED", "items": [
        {"product_id": a, "quantity": 4, "unit_price": 10}, {"product_id": b, "quantity": 2, "unit_price": 10}]})
    assert r.status_code == 409
    assert on_hand(client, a) == 10 and on_hand(client, b) == 1


def test_fefo_takes_earliest_expiry_first(client):
    pid = product(client)
    late = receive(client, pid, 5, "2026-12-31")
    soon = receive(client, pid, 5, "2026-11-01")
    none = receive(client, pid, 5)
    assert sell(client, "2026-10-05", pid, 7).status_code == 200
    rem = {b["id"]: b["quantity_remaining"] for b in client.get(f"/api/products/{pid}/batches").json()}
    assert rem == {soon["id"]: 0, late["id"]: 3, none["id"]: 5}


def test_edit_restores_then_rededucts(client):
    pid = product(client)
    receive(client, pid, 10)
    sell(client, "2026-10-05", pid, 8)
    assert on_hand(client, pid) == 2
    # Editing to 9 is fine because the original 8 are put back first (10 available).
    assert sell(client, "2026-10-05", pid, 9).status_code == 200
    assert on_hand(client, pid) == 1
    # Editing to 11 fails and leaves the saved day untouched.
    assert sell(client, "2026-10-05", pid, 11).status_code == 409
    assert on_hand(client, pid) == 1
    assert client.get("/api/sales/2026-10-05").json()["items"][0]["quantity"] == 9


def test_switching_mode_restores_stock(client):
    pid = product(client)
    receive(client, pid, 10)
    sell(client, "2026-10-05", pid, 4)
    client.put("/api/sales/2026-10-05", json={"mode": "TOTAL_ONLY", "total_amount": 5000})
    assert on_hand(client, pid) == 10


def test_delete_day_restores_stock(client):
    pid = product(client)
    receive(client, pid, 10, "2026-12-01")
    receive(client, pid, 10, "2026-11-01")
    sell(client, "2026-10-05", pid, 15)
    assert client.delete("/api/sales/2026-10-05").status_code == 204
    assert on_hand(client, pid) == 20
    assert {b["quantity_remaining"] for b in client.get(f"/api/products/{pid}/batches").json()} == {10}
    assert client.get("/api/sales/2026-10-05").status_code == 404


def test_validation(client):
    pid = product(client)
    receive(client, pid, 10)
    put = lambda body, day="2026-10-05": client.put(f"/api/sales/{day}", json=body).status_code
    assert put({"mode": "DETAILED", "items": []}) == 422
    assert put({"mode": "TOTAL_ONLY"}) == 422
    assert put({"mode": "TOTAL_ONLY", "total_amount": -1}) == 422
    assert put({"mode": "DETAILED", "items": [{"product_id": pid, "quantity": 0, "unit_price": 1}]}) == 422
    assert put({"mode": "DETAILED", "items": [{"product_id": pid, "quantity": 1, "unit_price": -5}]}) == 422
    assert put({"mode": "TOTAL_ONLY", "total_amount": 5}, day="2999-01-01") == 422


def test_deactivated_product_cannot_be_newly_sold_but_old_day_stays_editable(client):
    pid = product(client)
    receive(client, pid, 10)
    sell(client, "2026-10-05", pid, 2)
    client.patch(f"/api/products/{pid}", json={"is_active": False})
    assert sell(client, "2026-10-05", pid, 3).status_code == 200  # was already on that day
    assert sell(client, "2026-10-06", pid, 1).status_code == 409


def test_history_list(client):
    pid = product(client)
    receive(client, pid, 10)
    sell(client, "2026-10-05", pid, 2)
    client.put("/api/sales/2026-10-06", json={"mode": "TOTAL_ONLY", "total_amount": 700})
    rows = client.get("/api/sales").json()
    assert [(r["date"], r["mode"], r["total_amount"], r["item_count"]) for r in rows] == [
        ("2026-10-06", "TOTAL_ONLY", 700, 0), ("2026-10-05", "DETAILED", 2000, 1)]


# ---- weekly summary -----------------------------------------------------

def test_weekly_summary_matches_worked_example(client):
    client.put("/api/sales/2026-09-21", json={"mode": "TOTAL_ONLY", "total_amount": 300_000})
    client.put("/api/sales/2026-09-27", json={"mode": "TOTAL_ONLY", "total_amount": 200_000})
    client.put("/api/sales/2026-09-28", json={"mode": "TOTAL_ONLY", "total_amount": 999})  # next week
    w = client.get("/api/weekly?date=2026-09-24").json()
    assert (w["week_start"], w["week_end"]) == ("2026-09-21", "2026-09-27")
    assert (w["total"], w["tithe"], w["offering"], w["remaining"]) == (500_000, 50_000, 50_000, 400_000)
    assert len(w["days"]) == 7 and w["days"][1]["mode"] is None


def test_weekly_empty_week(client):
    w = client.get("/api/weekly?date=2026-10-08").json()
    assert (w["total"], w["tithe"], w["offering"], w["remaining"]) == (0, 0, 0, 0)


def test_weekly_spanning_two_months(client):
    client.put("/api/sales/2026-09-30", json={"mode": "TOTAL_ONLY", "total_amount": 1000})
    client.put("/api/sales/2026-10-02", json={"mode": "TOTAL_ONLY", "total_amount": 2000})
    w = client.get("/api/weekly?date=2026-10-01").json()
    assert (w["week_start"], w["week_end"], w["total"]) == ("2026-09-28", "2026-10-04", 3000)


def test_weekly_reads_percentages_and_week_start_from_settings(client):
    with SessionLocal() as db:
        db.add_all([Setting(key="tithe_percent", value="5"), Setting(key="offering_percent", value="15"),
                    Setting(key="week_starts_on", value="7")])
        db.commit()
    client.put("/api/sales/2026-10-04", json={"mode": "TOTAL_ONLY", "total_amount": 10_000})  # a Sunday
    w = client.get("/api/weekly?date=2026-10-07").json()
    assert w["week_start"] == "2026-10-04"
    assert (w["tithe"], w["offering"], w["remaining"]) == (500, 1500, 8000)
