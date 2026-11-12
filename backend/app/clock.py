from datetime import date, datetime
from zoneinfo import ZoneInfo


def today() -> date:
    """Current date in São Paulo. Tests monkeypatch this."""
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()
