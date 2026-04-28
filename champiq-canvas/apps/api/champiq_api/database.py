from functools import lru_cache

from pydantic_settings import BaseSettings
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/champiq"
    redis_url: str = "redis://localhost:6379/0"
    fernet_key: str = ""

    champmail_base_url: str = "http://103.170.162.2:8000"
    champgraph_base_url: str = "http://103.170.162.2:8081"
    lakeb2b_base_url: str = "https://b2b-pulse.up.railway.app"

    champserver_email: str = ""
    champserver_password: str = ""

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
    return create_async_engine(url, echo=False, pool_pre_ping=True)


@lru_cache
def get_session_factory():
    return async_sessionmaker(get_engine(), expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    factory = get_session_factory()
    async with factory() as session:
        yield session
