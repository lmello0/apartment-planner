import json
import os
from datetime import date
from pathlib import Path

os.environ["AUTH_DISABLED"] = "true"
os.environ["ENV"] = "test"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app import clock  # noqa: E402
from app.api.schemas import SeedFile  # noqa: E402
from app.db import models  # noqa: E402,F401
from app.db.base import Base  # noqa: E402
from app.db.session import get_session  # noqa: E402
from app.main import app  # noqa: E402
from app.services.seed import import_seed  # noqa: E402

EXAMPLE_SEED = Path(__file__).resolve().parents[2] / "seed" / "apto-166.example.json"
TODAY = date(2026, 11, 11)


@pytest.fixture
def session_factory():
    url = os.environ.get("TEST_DATABASE_URL")
    if url:
        engine = create_engine(url)
    else:
        engine = create_engine(
            "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield sessionmaker(engine, expire_on_commit=False)
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def client(session_factory, monkeypatch):
    monkeypatch.setattr(clock, "today", lambda: TODAY)
    monkeypatch.setattr("app.services.context.clock_today", lambda: TODAY)
    monkeypatch.setattr("app.services.tasks.today", lambda: TODAY)

    def override():
        with session_factory() as s:
            yield s

    app.dependency_overrides[get_session] = override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def seeded(client, session_factory):
    seed = SeedFile.model_validate(json.loads(EXAMPLE_SEED.read_text(encoding="utf-8")))
    with session_factory() as s:
        import_seed(s, seed)
        s.commit()
    return client
