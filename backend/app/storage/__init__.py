"""Object storage behind a small interface: Supabase Storage (production) or local disk (dev)."""

from __future__ import annotations

from functools import lru_cache
from typing import Protocol

from app.config import Config, get_config
from app.storage.base import ObjectInfo, SignedUpload, StorageError
from app.storage.local import LocalStorage
from app.storage.supabase import SupabaseStorage

DOWNLOAD_TTL_SECONDS = 300


class Storage(Protocol):
    def create_upload(self, key: str, mime_type: str) -> SignedUpload:
        """Signed upload target the browser can PUT the file to."""

    def create_download_url(self, key: str, expires_in: int = DOWNLOAD_TTL_SECONDS) -> str: ...

    def head(self, key: str) -> ObjectInfo | None:
        """Size and mime type of the stored object, or None when it does not exist."""

    def upload(self, key: str, data: bytes, mime_type: str) -> None:
        """Server-side upload (CLI import)."""

    def delete(self, key: str) -> None: ...


def build_storage(config: Config) -> Storage:
    if config.storage_backend == "local":
        return LocalStorage(config.storage_local_dir, config.api_public_url)
    return SupabaseStorage(
        config.supabase_url, config.supabase_service_role_key, config.storage_bucket)


@lru_cache
def _cached(config_key: tuple) -> Storage:
    return build_storage(get_config())


def get_storage() -> Storage:
    """FastAPI dependency (override in tests)."""
    c = get_config()
    return _cached((c.storage_backend, c.supabase_url, c.storage_bucket, c.storage_local_dir, c.api_public_url))


__all__ = [
    "DOWNLOAD_TTL_SECONDS", "LocalStorage", "ObjectInfo", "SignedUpload", "Storage",
    "StorageError", "SupabaseStorage", "build_storage", "get_storage",
]
