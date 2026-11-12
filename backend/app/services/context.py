from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clock import today as clock_today
from app.db.models import Installment, Milestone, Settings
from app.domain.dashboard import InstallmentView
from app.domain.projection import project
from app.domain.types import CorrectionIndex, MilestoneKey


class NotFound(Exception):
    pass


class Conflict(Exception):
    pass


def get_settings(session: Session) -> Settings:
    row = session.get(Settings, 1)
    if row is None:
        row = Settings(id=1, monthly_capacity=Decimal("0.00"),
                       incc_monthly_estimate=Decimal("0.50"),
                       igpm_monthly_estimate=Decimal("0.40"), due_soon_days=7)
        session.add(row)
        session.flush()
    return row


def ensure_milestones(session: Session) -> dict[str, Milestone]:
    rows = {m.key: m for m in session.scalars(select(Milestone))}
    for key in MilestoneKey:
        if key.value not in rows:
            rows[key.value] = Milestone(key=key.value)
            session.add(rows[key.value])
    session.flush()
    return rows


def effective_milestones(session: Session) -> dict[MilestoneKey, date | None]:
    rows = ensure_milestones(session)
    return {MilestoneKey(k): (m.actual_date or m.expected_date) for k, m in rows.items()}


@dataclass
class Ctx:
    settings: Settings
    milestones: dict[MilestoneKey, date | None]
    today: date

    @property
    def habite_se(self) -> date | None:
        return self.milestones.get(MilestoneKey.HABITE_SE)

    def view(self, inst: Installment, count: int) -> InstallmentView:
        ob = inst.obligation
        pay = inst.payment
        if pay is not None:
            projected = pay.amount
        else:
            projected = project(
                inst.expected_amount, inst.due_date, CorrectionIndex(ob.correction_index),
                self.settings.incc_monthly_estimate, self.settings.igpm_monthly_estimate,
                self.habite_se)
        return InstallmentView(
            id=inst.id, obligation_id=ob.id, obligation_name=ob.name, seq=inst.seq,
            count=count, due_date=inst.due_date, expected=inst.expected_amount,
            projected=projected, paid_amount=pay.amount if pay else None,
            paid_on=pay.paid_on if pay else None)


def load_ctx(session: Session) -> Ctx:
    return Ctx(get_settings(session), effective_milestones(session), clock_today())


def all_views(session: Session, ctx: Ctx) -> list[tuple[Installment, InstallmentView]]:
    rows = session.scalars(select(Installment)).all()
    counts: dict[str, int] = {}
    for r in rows:
        counts[r.obligation_id] = counts.get(r.obligation_id, 0) + 1
    return [(r, ctx.view(r, counts[r.obligation_id])) for r in rows]
