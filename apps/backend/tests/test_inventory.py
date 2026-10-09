import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.inventory import get_next_expiry, get_quantity_on_hand
from app.main import app
from app.models import User
from app.security import hash_password


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


def make_product(client, **kw):
    body = {"name": "Rice", "category": "Food", "unit": "kg", "selling_price": 1000, "reorder_level": 5, **kw}
    r = client.post("/api/products", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def receive(client, pid, qty, expiry=None, received="2026-10-01"):
    r = client.post("/api/stock/receive", json={
        "product_id": pid, "quantity": qty, "cost_price": 700, "received_at": received, "expiry_date": expiry})
    assert r.status_code == 201, r.text
    return r.json()


def test_endpoints_require_login():
    with TestClient(app) as anon:
        assert anon.get("/api/products").status_code == 401
        assert anon.post("/api/stock/receive", json={}).status_code == 401


def test_quantity_and_next_expiry_utilities(client):
    pid = make_product(client)["id"]
    receive(client, pid, 10, "2026-12-01")
    b2 = receive(client, pid, 4, "2026-11-01")
    receive(client, pid, 3)  # no expiry
    with SessionLocal() as db:
        assert get_quantity_on_hand(db, pid) == 17
        assert get_next_expiry(db, pid) == date(2026, 11, 1)
    # Emptying the earliest batch moves next expiry on to the following one.
    client.post("/api/stock/adjust", json={"batch_id": b2["id"], "quantity_change": -4, "reason": "spoiled"})
    with SessionLocal() as db:
        assert get_quantity_on_hand(db, pid) == 13
        assert get_next_expiry(db, pid) == date(2026, 12, 1)


def test_empty_product_has_zero_and_no_expiry(client):
    pid = make_product(client)["id"]
    with SessionLocal() as db:
        assert get_quantity_on_hand(db, pid) == 0
        assert get_next_expiry(db, pid) is None


def test_low_stock_threshold(client):
    pid = make_product(client, reorder_level=5)["id"]
    batch = receive(client, pid, 6)

    def low():
        return client.get("/api/products").json()[0]["low_stock"]

    assert low() is False  # 6 > 5
    client.post("/api/stock/adjust", json={"batch_id": batch["id"], "quantity_change": -1, "reason": "damaged"})
    assert low() is True  # 5 <= 5


def test_validation(client):
    assert client.post("/api/products", json={"name": "X", "selling_price": -1}).status_code == 422
    assert client.post("/api/products", json={"name": "   ", "selling_price": 1}).status_code == 422
    assert client.post("/api/products", json={"name": "X", "selling_price": "abc"}).status_code == 422
    pid = make_product(client)["id"]
    base = {"product_id": pid, "cost_price": 1, "received_at": "2026-10-05"}
    assert client.post("/api/stock/receive", json={**base, "quantity": -3}).status_code == 422
    assert client.post("/api/stock/receive", json={**base, "quantity": 0}).status_code == 422
    assert client.post("/api/stock/receive", json={**base, "quantity": 1, "cost_price": -1}).status_code == 422
    r = client.post("/api/stock/receive", json={**base, "quantity": 1, "expiry_date": "2026-10-04"})
    assert r.status_code == 422
    assert client.post("/api/stock/receive", json={**base, "quantity": 1, "expiry_date": "2026-10-05"}).status_code == 201


def test_adjust_cannot_go_negative_and_requires_reason(client):
    pid = make_product(client)["id"]
    batch = receive(client, pid, 3)
    r = client.post("/api/stock/adjust", json={"batch_id": batch["id"], "quantity_change": -4, "reason": "oops"})
    assert r.status_code == 409
    assert client.post("/api/stock/adjust", json={"batch_id": batch["id"], "quantity_change": -1, "reason": ""}).status_code == 422
    assert client.post("/api/stock/adjust", json={"batch_id": batch["id"], "quantity_change": 0, "reason": "x"}).status_code == 422
    r = client.post("/api/stock/adjust", json={"batch_id": batch["id"], "quantity_change": 2, "reason": "miscount"})
    assert r.json()["quantity_remaining"] == 5


def test_deactivate_hides_product_but_keeps_history(client):
    pid = make_product(client)["id"]
    receive(client, pid, 5)
    assert client.patch(f"/api/products/{pid}", json={"is_active": False}).json()["is_active"] is False
    assert client.get("/api/products").json() == []
    assert len(client.get("/api/products?include_inactive=true").json()) == 1
    assert len(client.get(f"/api/products/{pid}/batches").json()) == 1
    assert client.post("/api/stock/receive", json={
        "product_id": pid, "quantity": 1, "cost_price": 1, "received_at": "2026-10-05"}).status_code == 409


def test_search_and_category_filter(client):
    make_product(client, name="Rice", category="Food")
    make_product(client, name="Soap", category="Cleaning")
    assert [p["name"] for p in client.get("/api/products?search=ric").json()] == ["Rice"]
    assert [p["name"] for p in client.get("/api/products?category=Cleaning").json()] == ["Soap"]
    assert client.get("/api/categories").json() == ["Cleaning", "Food"]
