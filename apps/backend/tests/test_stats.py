import pytest

from tests.conftest_helpers import fresh_db, login, product, receive, sell


@pytest.fixture()
def owner():
    fresh_db()
    c = login("owner")
    yield c
    c.close()


def stats(c, start="2026-09-01", end="2026-09-30"):
    r = c.get(f"/api/stats?start={start}&end={end}")
    assert r.status_code == 200, r.text
    return r.json()


def test_profit_per_product_for_owner(owner):
    pid = product(owner, price=1000)
    receive(owner, pid, 20, cost=300)
    sell(owner, "2026-09-10", (pid, 4, 1000))
    row = stats(owner)["products"][0]
    assert (row["units"], row["revenue"], row["cost"], row["profit"]) == (4, 4000, 1200, 2800)


def test_profit_uses_the_cost_of_the_batches_actually_sold(owner):
    pid = product(owner)
    receive(owner, pid, 3, cost=100, expiry="2026-11-01")   # sold first (FEFO)
    receive(owner, pid, 10, cost=500, expiry="2026-12-01")
    sell(owner, "2026-09-10", (pid, 5, 1000))                # 3 x 100 + 2 x 500 = 1300
    row = stats(owner)["products"][0]
    assert (row["revenue"], row["cost"], row["profit"]) == (5000, 1300, 3700)


def test_cashier_never_receives_cost_or_profit(owner):
    pid = product(owner)
    receive(owner, pid, 5)
    sell(owner, "2026-09-10", (pid, 2, 1000))
    cashier = login("cashier")
    data = stats(cashier)
    assert data["products"][0]["units"] == 2 and data["products"][0]["revenue"] == 2000
    assert data["products"][0]["cost"] is None and data["products"][0]["profit"] is None
    assert data["profit_total"] is None and data["cost_total"] is None
    assert "cost" not in str(cashier.get("/api/stats?start=2026-09-01&end=2026-09-30").json()["categories"])


def test_total_only_days_count_in_totals_but_not_in_products(owner):
    pid = product(owner)
    receive(owner, pid, 5)
    sell(owner, "2026-09-10", (pid, 2, 1000))
    owner.put("/api/sales/2026-09-11", json={"mode": "TOTAL_ONLY", "total_amount": 7000})
    d = stats(owner)
    assert d["total_sales"] == 9000 and d["total_only_days"] == 1 and d["total_only_total"] == 7000
    assert d["revenue_itemised"] == 2000 and len(d["products"]) == 1


def test_date_range_filters_and_edit_delete_are_reflected(owner):
    pid = product(owner)
    receive(owner, pid, 30)
    sell(owner, "2026-08-31", (pid, 1, 1000))
    sell(owner, "2026-09-10", (pid, 2, 1000))
    assert stats(owner)["products"][0]["units"] == 2
    sell(owner, "2026-09-10", (pid, 5, 1000))          # edit the day
    assert stats(owner)["products"][0]["units"] == 5
    owner.delete("/api/sales/2026-09-10")
    d = stats(owner)
    assert d["products"] == [] and d["total_sales"] == 0
    assert stats(owner, "2026-08-01", "2026-08-31")["products"][0]["cost"] == 300


def test_categories_and_ranking(owner):
    a, b, c = product(owner, "A", category="Food"), product(owner, "B", category="Food"), product(owner, "C", category="")
    for p in (a, b, c):
        receive(owner, p, 50)
    sell(owner, "2026-09-10", (a, 5, 100), (b, 9, 100), (c, 1, 100))
    d = stats(owner)
    assert [r["name"] for r in d["products"]] == ["B", "A", "C"]
    assert {x["category"]: x["units"] for x in d["categories"]} == {"Food": 14, "Uncategorised": 1}


def test_slow_movers_only_lists_stocked_products_that_barely_sell(owner):
    fast, slow, never, empty = (product(owner, n) for n in ("Fast", "Slow", "Never", "Empty"))
    for p in (fast, slow, never):
        receive(owner, p, 20)
    sell(owner, "2026-09-10", (fast, 10, 100), (slow, 2, 100))
    names = [s["name"] for s in stats(owner)["slow_movers"]]
    assert names == ["Never", "Slow"]  # Fast sells well; Empty has no stock so is not "slow"


def test_trend_is_daily_for_short_ranges_and_weekly_for_long_ones(owner):
    owner.put("/api/sales/2026-09-10", json={"mode": "TOTAL_ONLY", "total_amount": 500})
    d = stats(owner)
    assert d["trend_group"] == "day" and len(d["trend"]) == 30
    assert next(p for p in d["trend"] if p["date"] == "2026-09-10")["total"] == 500
    long = stats(owner, "2026-01-01", "2026-09-30")
    assert long["trend_group"] == "week" and sum(p["total"] for p in long["trend"]) == 500


def test_range_validation(owner):
    assert owner.get("/api/stats?start=2026-09-30&end=2026-09-01").status_code == 422
    assert owner.get("/api/stats?start=2020-01-01&end=2026-09-01").status_code == 422
