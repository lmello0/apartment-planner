"""Disk storage for development and tests. Served by the dev-storage routes (never in production)."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path

from app.storage.base import ObjectInfo, SignedUpload

DEV_STORAGE_PATH = "/api/dev-storage"
UPLOAD_TTL_SECONDS = 2 * 3600


class LocalStorage:
    def __init__(self, directory: str | Path, base_url: str = "") -> None:
        self.dir = Path(directory).resolve()
        self.dir.mkdir(parents=True, exist_ok=True)
        # Public base of the API as the browser sees it; empty = relative to the page origin,
        # which only works behind the dev proxy, so default to the local API port.
        self.base_url = base_url or "http://localhost:8000"

    # ---- tokens: "<op>.<key>.<expires>" (op: u = upload, d = download) -----------------------
    @staticmethod
    def _token(op: str, key: str, ttl: int) -> str:
        return f"{op}.{key}.{int(time.time()) + ttl}"

    @staticmethod
    def parse_token(token: str, op: str) -> str | None:
        """Return the key if the token is a valid, unexpired `op` token."""
        parts = token.split(".")
        if len(parts) != 3 or parts[0] != op:
            return None
        try:
            uuid.UUID(parts[1])
            expires = int(parts[2])
        except ValueError:
            return None
        return parts[1] if expires >= time.time() else None

    def _path(self, key: str) -> Path:
        uuid.UUID(key)  # keys are UUIDs; refuses anything that could escape the directory
        return self.dir / key

    def _meta(self, key: str) -> Path:
        return self.dir / f"{key}.meta.json"

    # ---- Storage interface -------------------------------------------------------------------
    def create_upload(self, key: str, mime_type: str) -> SignedUpload:
        token = self._token("u", key, UPLOAD_TTL_SECONDS)
        return SignedUpload(
            url=f"{self.base_url}{DEV_STORAGE_PATH}/{token}", method="PUT",
            headers={"Content-Type": mime_type})

    def create_download_url(self, key: str, expires_in: int = 300) -> str:
        return f"{self.base_url}{DEV_STORAGE_PATH}/{self._token('d', key, expires_in)}"

    def head(self, key: str) -> ObjectInfo | None:
        path = self._path(key)
        if not path.is_file():
            return None
        mime = "application/octet-stream"
        if self._meta(key).is_file():
            mime = json.loads(self._meta(key).read_text()).get("mimeType", mime)
        return ObjectInfo(size=path.stat().st_size, mime_type=mime)

    def upload(self, key: str, data: bytes, mime_type: str) -> None:
        self._path(key).write_bytes(data)
        self._meta(key).write_text(json.dumps({"mimeType": mime_type}))

    def read(self, key: str) -> bytes | None:
        path = self._path(key)
        return path.read_bytes() if path.is_file() else None

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)
        self._meta(key).unlink(missing_ok=True)
