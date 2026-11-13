from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo


def today() -> date:
    """Current date in São Paulo. Tests monkeypatch this."""
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def utcnow() -> datetime:
    """Current instant (timezone-aware UTC). Tests may monkeypatch this."""
    return datetime.now(UTC)
