from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Local development falls back to a SQLite file; production uses the
    # Neon Postgres URL that Vercel injects as DATABASE_URL.
    database_url: str = "sqlite:///./dev.db"
    auth_secret: str = "dev-only-secret-change-me-in-production-0000"
    app_env: str = "development"  # "production" on Vercel
    session_hours: int = 12

    @property
    def sqlalchemy_url(self) -> str:
        """Neon gives `postgres://` / `postgresql://`; SQLAlchemy needs the psycopg driver name."""
        url = self.database_url
        for prefix in ("postgres://", "postgresql://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix):]
        return url

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


settings = Settings()
