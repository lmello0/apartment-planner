from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.schemas import ObligationIn
from app.db.models import Installment, Obligation, Task
from app.domain.financing import DIFFERENCE_NAME, financing_difference
from app.domain.schedule import ExistingInstallment, generate, reconcile
from app.domain.types import (
    Category,
    CorrectionIndex,
    FundingSource,
    MilestoneKey,
    ObligationStatus,
    Periodicity,
    ScheduleSpec,
    money,
)
from app.services.context import NotFound, effective_milestones


def to_spec(ob: Obligation) -> ScheduleSpec:
    return ScheduleSpec(
        periodicity=Periodicity(ob.periodicity),
        amount=ob.amount,
        count=ob.count,
        amounts=tuple(Decimal(a) for a in ob.amounts) if ob.amounts else None,
        day_of_month=ob.day_of_month,
        first_due_date=ob.first_due_date,
        anchor_milestone=MilestoneKey(ob.anchor_milestone) if ob.anchor_milestone else None,
        offset_days=ob.offset_days,
    )


def sync_installments(session: Session, ob: Obligation) -> None:
    """Regenerate the unpaid installments of one obligation (paid ones are never touched)."""
    planned = generate(to_spec(ob), effective_milestones(session))
    session.refresh(ob, ["installments"])
    existing = [
        ExistingInstallment(i.id, i.seq, i.due_date, i.expected_amount, i.payment is not None)
        for i in ob.installments
    ]
    diff = reconcile(existing, planned)
    by_id = {i.id: i for i in ob.installments}
    for inst_id, plan in diff.update.items():
        inst = by_id[inst_id]
        inst.due_date, inst.expected_amount = plan.due_date, plan.expected_amount
    for inst_id in diff.delete:
        session.delete(by_id[inst_id])
    for plan in diff.create:
        session.add(Installment(obligation_id=ob.id, seq=plan.seq, due_date=plan.due_date,
                                expected_amount=plan.expected_amount))
    session.flush()
    session.expire(ob, ["installments"])


def regenerate_anchored(session: Session, key: MilestoneKey) -> list[str]:
    obs = session.scalars(select(Obligation).where(Obligation.anchor_milestone == key.value)).all()
    for ob in obs:
        sync_installments(session, ob)
    return [ob.name for ob in obs]


def _apply(ob: Obligation, data: ObligationIn) -> None:
    ob.name, ob.payee = data.name, data.payee
    ob.category, ob.status = data.category.value, data.status.value
    ob.funding_source, ob.correction_index = data.funding_source.value, data.correction_index.value
    ob.periodicity, ob.count = data.periodicity.value, data.count
    ob.amount = money(data.amount)
    ob.amounts = [f"{money(a):.2f}" for a in data.amounts] if data.amounts else None
    ob.day_of_month, ob.first_due_date = data.day_of_month, data.first_due_date
    ob.anchor_milestone = data.anchor_milestone.value if data.anchor_milestone else None
    ob.offset_days, ob.notes = data.offset_days, data.notes


def get(session: Session, obligation_id: str) -> Obligation:
    ob = session.get(Obligation, obligation_id)
    if ob is None:
        raise NotFound(f"obligation {obligation_id}")
    return ob


def list_all(session: Session) -> list[Obligation]:
    return list(session.scalars(select(Obligation).order_by(Obligation.name)))


def create(session: Session, data: ObligationIn) -> Obligation:
    ob = Obligation()
    _apply(ob, data)
    session.add(ob)
    session.flush()
    sync_installments(session, ob)
    sync_financing_difference(session)
    return ob


def update_obligation(session: Session, obligation_id: str, data: ObligationIn) -> Obligation:
    ob = get(session, obligation_id)
    _apply(ob, data)
    session.flush()
    sync_installments(session, ob)
    sync_financing_difference(session)
    return ob


def delete(session: Session, obligation_id: str) -> None:
    ob = get(session, obligation_id)
    ids = [i.id for i in ob.installments]
    session.execute(update(Task).where(Task.obligation_id == ob.id).values(obligation_id=None))
    if ids:
        session.execute(update(Task).where(Task.installment_id.in_(ids)).values(installment_id=None))
    session.delete(ob)
    session.flush()
    sync_financing_difference(session)


def sync_financing_difference(session: Session) -> None:
    """Create/update/remove the automatic FINANCING_DIFFERENCE obligation (cl. 6ª §4º)."""
    financing = session.scalars(
        select(Obligation).where(Obligation.category == Category.FINANCING.value)
        .order_by(Obligation.name)).first()
    diff_amount = (
        financing_difference(ObligationStatus(financing.status), financing.amount)
        if financing else None)
    auto = session.scalars(select(Obligation).where(
        Obligation.category == Category.FINANCING_DIFFERENCE.value,
        Obligation.auto_generated.is_(True))).first()

    if diff_amount is None:
        if auto is not None and not any(i.payment for i in auto.installments):
            session.execute(update(Task).where(Task.obligation_id == auto.id)
                            .values(obligation_id=None))
            session.delete(auto)
            session.flush()
        return

    if auto is None:
        auto = Obligation(auto_generated=True)
        session.add(auto)
    auto.name, auto.payee = DIFFERENCE_NAME, "Caixa / recursos próprios"
    auto.category = Category.FINANCING_DIFFERENCE.value
    auto.status = ObligationStatus.CONTRACTED.value
    auto.funding_source = FundingSource.OWN.value
    auto.correction_index = CorrectionIndex.NONE.value
    auto.periodicity, auto.count = Periodicity.ONCE.value, 1
    auto.amount, auto.amounts = diff_amount, None
    auto.anchor_milestone, auto.offset_days = MilestoneKey.FINANCING_SIGNED.value, 0
    auto.first_due_date, auto.day_of_month = None, None
    auto.notes = ("Gerada automaticamente: financiamento contratado abaixo de "
                  "R$ 302.000,40 (cláusula 6ª §4º).")
    session.flush()
    sync_installments(session, auto)
