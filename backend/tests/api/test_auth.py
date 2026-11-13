import pytest
from fastapi.testclient import TestClient

from app.api import deps
from app.config import Config, get_config
from app.main import create_app


def test_auth_disabled_refused_in_production():
    with pytest.raises(ValueError):
        Config(auth_disabled=True, env="production")


def _client(**cfg):
    app = create_app()
    app.dependency_overrides[get_config] = lambda: Config(auth_disabled=False, **cfg)
    return TestClient(app)


def test_missing_token_is_401():
    c = _client(supabase_url="https://x.supabase.co", owner_email="me@x.com")
    assert c.get("/api/settings").status_code == 401


def _token_and_key():
    import jwt
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())

    def make(email):
        return jwt.encode({"email": email, "aud": "authenticated"}, key, algorithm="ES256")

    return make, key.public_key()


class FakeJwks:
    def __init__(self, public):
        self.public = public

    def get_signing_key_from_jwt(self, _token):
        class K:
            key = self.public
        return K()


@pytest.mark.parametrize(("email", "status"), [("me@x.com", 200), ("ME@x.com", 200),
                                               ("other@x.com", 403)])
def test_owner_email_enforced(email, status, monkeypatch, session_factory):
    make, public = _token_and_key()
    monkeypatch.setattr(deps, "_jwks_client", lambda url: FakeJwks(public))
    c = _client(supabase_url="https://x.supabase.co", owner_email="me@x.com")
    from app.db.session import get_session

    def override():
        with session_factory() as s:
            yield s

    c.app.dependency_overrides[get_session] = override
    r = c.get("/api/settings", headers={"Authorization": f"Bearer {make(email)}"})
    assert r.status_code == status


def test_garbage_token_is_401(monkeypatch):
    _, public = _token_and_key()
    monkeypatch.setattr(deps, "_jwks_client", lambda url: FakeJwks(public))
    c = _client(supabase_url="https://x.supabase.co", owner_email="me@x.com")
    assert c.get("/api/settings", headers={"Authorization": "Bearer nope"}).status_code == 401
