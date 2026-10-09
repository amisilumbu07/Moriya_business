import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

import pytest
from fastapi.testclient import TestClient

from app.db import Base, SessionLocal, engine
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
        yield c


def test_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_me_requires_login(client):
    assert client.get("/api/auth/me").status_code == 401


def test_wrong_password_rejected(client):
    r = client.post("/api/auth/login", json={"username": "cashier", "password": "nope"})
    assert r.status_code == 401


def test_login_me_logout_flow(client):
    r = client.post("/api/auth/login", json={"username": "Cashier", "password": "secret123"})
    assert r.status_code == 200
    assert r.json()["username"] == "cashier"
    assert "httponly" in r.headers["set-cookie"].lower()
    assert client.get("/api/auth/me").json()["name"] == "Cashier"
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_production_refuses_to_start_with_unsafe_defaults(monkeypatch):
    import importlib
    import app.main as main_module
    from app.config import settings

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setattr(settings, "auth_secret", "dev-only-secret")
    with pytest.raises(RuntimeError, match="AUTH_SECRET"):
        importlib.reload(main_module)
    monkeypatch.setattr(settings, "auth_secret", "x" * 40)
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        importlib.reload(main_module)
    monkeypatch.delenv("VERCEL")
    importlib.reload(main_module)  # back to a normal app for later tests
