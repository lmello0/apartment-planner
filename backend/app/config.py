from __future__ import annotations

from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Config(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    env: str = "development"
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/apartment_planner"
    supabase_url: str = ""
    owner_email: str = ""
    auth_disabled: bool = False
    cors_origins: str = "http://localhost:4200"

    @model_validator(mode="after")
    def _check(self) -> Config:
        if self.auth_disabled and self.env.lower() == "production":
            raise ValueError("AUTH_DISABLED must not be enabled when ENV=production")
        url = self.database_url
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                url = "postgresql+psycopg://" + url[len(prefix):]
        self.database_url = url
        return self

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_config() -> Config:
    return Config()
