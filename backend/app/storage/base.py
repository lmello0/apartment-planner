from __future__ import annotations

from dataclasses import dataclass, field


class StorageError(Exception):
    """The storage backend failed (network, auth, unexpected status)."""


@dataclass(frozen=True)
class SignedUpload:
    url: str
    method: str = "PUT"
    headers: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ObjectInfo:
    size: int
    mime_type: str
