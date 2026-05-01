from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

_DEFAULT_DB_URL = "postgresql+asyncpg://postgres:postgres@localhost:5432/champiq"


class Settings(BaseSettings):
    database_url: str = _DEFAULT_DB_URL

    @field_validator("database_url", mode="before")
    @classmethod
    def _reject_empty_database_url(cls, v: str) -> str:
        # pydantic-settings uses the env var value even when it's an empty string,
        # ignoring the field default. Treat "" the same as "not set".
        return v if v else _DEFAULT_DB_URL
    redis_url: str = "redis://localhost:6379/0"
    fernet_key: str = ""

    champmail_base_url: str = "http://10.10.21.19:8000"
    # Legacy VPS ChampGraph (port 8081, JWT) — unused in this build, kept here
    # only so old workflows that read settings.champgraph_base_url don't blow up.
    champgraph_base_url: str = "http://10.10.21.19:8081"
    lakeb2b_base_url: str = "https://b2b-pulse.up.railway.app"

    # Graphiti knowledge graph (the new, real ChampGraph backend) — port 8080,
    # X-API-Key header. URL empty = champgraph graph/campaign actions return
    # {"available": false} instead of crashing the canvas.
    champgraph_url: str = ""
    champgraph_api_key: str = ""

    champserver_email: str = ""
    champserver_password: str = ""

    # ChampMail (inline) — Emelia transport
    emelia_api_key: str = ""
    emelia_default_sender_ids: str = ""  # comma-separated UUIDs
    emelia_webhook_secret: str = ""
    emelia_default_from_email: str = ""
    emelia_default_from_name: str = "ChampIQ"
    champmail_unsubscribe_secret: str = ""  # signs unsubscribe tokens; defaults to fernet_key if empty
    public_base_url: str = ""  # e.g. https://champiq-production.up.railway.app — used for unsubscribe URLs

    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "anthropic/claude-sonnet-4"
    openrouter_referrer: str = "https://champiq.local"
    openrouter_app_title: str = "ChampIQ Canvas"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


def _asyncpg_url(url: str) -> str:
    """Ensure the URL uses the asyncpg driver.
    Railway injects plain postgresql:// or postgres:// — rewrite to asyncpg."""
    for prefix in ("postgresql://", "postgres://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix):]
    return url


def get_engine():
    settings = get_settings()
    url = _asyncpg_url(settings.database_url)
    # Pool sizing: defaults of 5 + 10 starve under any concurrency once the
    # canvas runs more than a couple of fan-out items. 20 + 10 is comfortable
    # for a single uvicorn worker handling cron ticks, webhooks, and ad-hoc
    # canvas runs simultaneously. pool_recycle=1800 dodges idle-connection
    # drops some cloud Postgres providers do after ~30 min.
    return create_async_engine(
        url,
        echo=False,
        pool_pre_ping=True,
        pool_size=20,
        max_overflow=10,
        pool_recycle=1800,
    )


@lru_cache
def get_session_factory():
    return async_sessionmaker(get_engine(), expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    factory = get_session_factory()
    async with factory() as session:
        yield session
