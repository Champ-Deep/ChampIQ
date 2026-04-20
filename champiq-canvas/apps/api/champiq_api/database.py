from functools import lru_cache

from pydantic_settings import BaseSettings
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/champiq"
    redis_url: str = "redis://localhost:6379/0"
    # 32-byte url-safe base64 Fernet key. Generate with:
    # python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    fernet_key: str = "CHANGE_ME_DEV_KEY_w3uKXb3yTqLp2VgqOq8GvMh_1EYb7TDn0VvQ9kC8cqE="

    champmail_base_url: str = "http://localhost:8001"
    champgraph_base_url: str = "http://localhost:3001"
    lakeb2b_base_url: str = "http://localhost:8002"

    # OpenRouter — OpenAI-compatible, one key for many models.
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


def get_engine():
    settings = get_settings()
    return create_async_engine(settings.database_url, echo=False, pool_pre_ping=True)


@lru_cache
def get_session_factory():
    return async_sessionmaker(get_engine(), expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    factory = get_session_factory()
    async with factory() as session:
        yield session
