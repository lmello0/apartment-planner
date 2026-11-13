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
    # Document storage. "supabase" in production; "local" (disk) for development and tests.
    supabase_service_role_key: str = ""
    storage_backend: str = "supabase"
    storage_bucket: str = "documents"
    storage_local_dir: str = ".devdata/files"
    # How the browser reaches this API; used to build local (dev) upload/download URLs.
    api_public_url: str = "http://localhost:8000"

    @model_validator(mode="after")
    def _check(self) -> Config:
        if self.auth_disabled and self.env.lower() == "production":
            raise ValueError("AUTH_DISABLED must not be enabled when ENV=production")
        if self.storage_backend not in ("supabase", "local"):
            raise ValueError("STORAGE_BACKEND must be 'supabase' or 'local'")
        if self.env.lower() == "production":
            if self.storage_backend != "supabase":
                raise ValueError("STORAGE_BACKEND must be 'supabase' when ENV=production")
            if not self.supabase_url or not self.supabase_service_role_key:
                raise ValueError(
                    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when ENV=production")
        url = self.database_url
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                url = "postgresql+psycopg://" + url[len(prefix):]
        self.database_url = url
        return self

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_config() -> Config:
    return Config()
