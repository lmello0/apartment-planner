from __future__ import annotations

from sqlalchemy.orm import Session

from app.api.schemas import SettingsIn
from app.db.models import Settings
from app.domain.types import money
from app.services.context import get_settings


def update(session: Session, data: SettingsIn) -> Settings:
    row = get_settings(session)
    row.monthly_capacity = money(data.monthly_capacity)
    row.incc_monthly_estimate = data.incc_monthly_estimate
    row.igpm_monthly_estimate = data.igpm_monthly_estimate
    row.due_soon_days = data.due_soon_days
    session.flush()
    return row
