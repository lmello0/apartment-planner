from __future__ import annotations

from functools import lru_cache

import jwt
from fastapi import Depends, Header, HTTPException
from jwt import PyJWKClient

from app.config import Config, get_config


@lru_cache
def _jwks_client(url: str) -> PyJWKClient:
    return PyJWKClient(f"{url.rstrip('/')}/auth/v1/.well-known/jwks.json", cache_keys=True)


def get_jwks_client(config: Config = Depends(get_config)) -> PyJWKClient:
    return _jwks_client(config.supabase_url)


def require_owner(
    authorization: str | None = Header(default=None),
    config: Config = Depends(get_config),
) -> str:
    """Validate the Supabase access token and require the owner's e-mail."""
    if config.auth_disabled and config.env.lower() != "production":
        return config.owner_email or "dev@local"
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing bearer token")
    if not config.supabase_url or not config.owner_email:
        raise HTTPException(500, "Auth is not configured")
    token = authorization.split(" ", 1)[1].strip()
    try:
        key = get_jwks_client(config).get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=["RS256", "ES256"], audience="authenticated")
    except jwt.PyJWTError as exc:
        raise HTTPException(401, "Invalid token") from exc
    email = str(claims.get("email", "")).lower()
    if email != config.owner_email.lower():
        raise HTTPException(403, "Forbidden")
    return email
