"""Supabase Storage over its REST API (service-role key; the bucket is private).

Endpoints (https://supabase.com/docs/reference/javascript/storage-from-createsigneduploadurl and
the storage-js client): signed upload  POST /object/upload/sign/{bucket}/{path} -> {url} (relative
to /storage/v1, carries ?token=); the browser then does PUT <that url> with the raw file body and
Content-Type. Signed download  POST /object/sign/{bucket}/{path} {expiresIn} -> {signedURL}.
Object metadata  GET /object/info/{bucket}/{path}. Delete  DELETE /object/{bucket} {prefixes}.
"""

from __future__ import annotations

import httpx

from app.storage.base import ObjectInfo, SignedUpload, StorageError


class SupabaseStorage:
    def __init__(self, supabase_url: str, service_key: str, bucket: str,
                 client: httpx.Client | None = None) -> None:
        self.origin = supabase_url.rstrip("/")
        self.base = f"{self.origin}/storage/v1"
        self.bucket = bucket
        self._client = client or httpx.Client(timeout=30)
        # Legacy service_role keys are JWTs (Bearer); new sb_secret_ keys go in `apikey` only.
        self._headers = {"apikey": service_key}
        if service_key.startswith("eyJ"):
            self._headers["Authorization"] = f"Bearer {service_key}"

    def _obj(self, key: str) -> str:
        return f"{self.bucket}/{key}"

    def _absolute(self, relative: str) -> str:
        if relative.startswith("http"):
            return relative
        if relative.startswith("/storage/v1"):
            return f"{self.origin}{relative}"
        return f"{self.base}{relative}"

    def _request(self, method: str, url: str, **kw) -> httpx.Response:
        try:
            return self._client.request(method, url, headers=self._headers, **kw)
        except httpx.HTTPError as exc:
            raise StorageError(f"storage unreachable: {exc}") from exc

    def create_upload(self, key: str, mime_type: str) -> SignedUpload:
        r = self._request("POST", f"{self.base}/object/upload/sign/{self._obj(key)}")
        if r.status_code >= 400:
            raise StorageError(f"signing upload failed ({r.status_code})")
        return SignedUpload(
            url=self._absolute(r.json()["url"]), method="PUT",
            headers={"Content-Type": mime_type, "x-upsert": "false"})

    def create_download_url(self, key: str, expires_in: int = 300) -> str:
        r = self._request("POST", f"{self.base}/object/sign/{self._obj(key)}",
                          json={"expiresIn": expires_in})
        if r.status_code >= 400:
            raise StorageError(f"signing download failed ({r.status_code})")
        return self._absolute(r.json()["signedURL"])

    def head(self, key: str) -> ObjectInfo | None:
        r = self._request("GET", f"{self.base}/object/info/{self._obj(key)}")
        if r.status_code in (400, 404):
            return None
        if r.status_code >= 400:
            raise StorageError(f"object info failed ({r.status_code})")
        data = r.json()
        meta = data.get("metadata") or {}
        size = data.get("size", meta.get("size"))
        mime = data.get("content_type") or data.get("contentType") or meta.get("mimetype")
        if size is None:
            return None
        return ObjectInfo(size=int(size), mime_type=str(mime or "application/octet-stream"))

    def upload(self, key: str, data: bytes, mime_type: str) -> None:
        signed = self.create_upload(key, mime_type)
        r = self._client.request(signed.method, signed.url, headers=signed.headers, content=data)
        if r.status_code >= 400:
            raise StorageError(f"upload failed ({r.status_code})")

    def delete(self, key: str) -> None:
        r = self._request("DELETE", f"{self.base}/object/{self.bucket}", json={"prefixes": [key]})
        if r.status_code >= 400 and r.status_code != 404:
            raise StorageError(f"delete failed ({r.status_code})")
