import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
from app.main import app
from app.models import User
from app.security import hash_password


def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        db.add(User(name="Owner", username="owner", role="OWNER", password_hash=hash_password("secret123")))
        db.add(User(name="Cashier", username="cashier", role="CASHIER", password_hash=hash_password("secret123")))
        db.commit()


def login(username: str) -> TestClient:
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"username": username, "password": "secret123"}).status_code == 200
    return c


def product(c, name="Rice", price=1000, category="Food", reorder=0):
    return c.post("/api/products", json={"name": name, "category": category, "selling_price": price,
                                         "reorder_level": reorder}).json()["id"]


def receive(c, pid, qty, cost=300, expiry=None, received="2026-01-01"):
    r = c.post("/api/stock/receive", json={"product_id": pid, "quantity": qty, "cost_price": cost,
                                           "received_at": received, "expiry_date": expiry})
    assert r.status_code == 201, r.text
    return r.json()


def sell(c, day, *lines):
    r = c.put(f"/api/sales/{day}", json={"mode": "DETAILED", "items": [
        {"product_id": p, "quantity": q, "unit_price": price} for p, q, price in lines]})
    assert r.status_code == 200, r.text
    return r.json()
