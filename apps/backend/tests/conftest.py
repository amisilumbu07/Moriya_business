"""Runs before any test module is imported, so the app can never be pointed at the real database.

(A test file that imported `app` before setting DATABASE_URL once wiped dev.db when run on its own.)
"""
import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

import pytest


@pytest.fixture(scope="session", autouse=True)
def _never_touch_the_real_database():
    from app.db import engine

    if not (engine.url.database or "").endswith("test.db"):
        pytest.exit(f"Refusing to run: tests are pointed at {engine.url!s}, not test.db", returncode=2)
    yield
