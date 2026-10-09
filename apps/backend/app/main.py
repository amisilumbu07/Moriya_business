from fastapi import FastAPI

from app.config import settings
from app.routers import auth, health, inventory, sales, stats, warnings

if settings.is_production and settings.auth_secret.startswith("dev-only"):
    raise RuntimeError("Set AUTH_SECRET to a long random value in production")
if settings.is_production and settings.sqlalchemy_url.startswith("sqlite"):
    raise RuntimeError("Set DATABASE_URL to the Postgres (Neon) connection string in production")

app = FastAPI(title="Store Inventory API", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(inventory.router)
app.include_router(sales.router)
app.include_router(stats.router)
app.include_router(warnings.router)
