from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.api.schemas import ObligationIn, PaymentIn, SeedFile
from app.db.models import Installment, Milestone, Obligation, Payment, Settings, Task
from app.domain.task_template import TEMPLATE
from app.domain.types import MilestoneKey, TaskSource, money
from app.services import milestones, obligations, payments
from app.services.context import ensure_milestones, get_settings


def wipe(session: Session) -> None:
    for model in (Task, Payment, Installment, Obligation, Milestone, Settings):
        session.execute(delete(model))
    session.flush()


def import_seed(session: Session, seed: SeedFile) -> dict[str, int]:
    """Idempotent: wipes everything and reloads settings, milestones, obligations, template."""
    wipe(session)
    s = get_settings(session)
    s.monthly_capacity = money(seed.settings.monthly_capacity)
    s.incc_monthly_estimate = seed.settings.incc_monthly_estimate
    s.igpm_monthly_estimate = seed.settings.igpm_monthly_estimate
    s.due_soon_days = seed.settings.due_soon_days

    ensure_milestones(session)
    for m in seed.milestones:
        milestones.set_dates(session, MilestoneKey(m.key), m.expected_date, m.actual_date)

    for item in seed.obligations:
        ob = obligations.create(session, ObligationIn(**item.model_dump(exclude={"payments"})))
        by_seq = {i.seq: i for i in session.scalars(
            select(Installment).where(Installment.obligation_id == ob.id))}
        for pay in item.payments:
            inst = by_seq[pay.seq]
            payments.register(session, inst.id, PaymentIn(
                paid_on=pay.paid_on, amount=pay.amount, method=pay.method))

    for st in seed.tasks:
        ob = session.scalar(select(Obligation).where(Obligation.name == st.obligation_name)) \
            if st.obligation_name else None
        if st.obligation_name and ob is None:
            raise ValueError(f"seed task {st.title!r}: unknown obligation {st.obligation_name!r}")
        inst = None
        if ob is not None:
            inst = session.scalar(select(Installment).where(
                Installment.obligation_id == ob.id, Installment.seq == (st.installment_seq or 1)))
        session.add(Task(
            title=st.title, phase=st.phase.value, due_date=st.due_date, notes=st.notes,
            source=TaskSource.MANUAL.value, obligation_id=ob.id if ob else None,
            installment_id=inst.id if inst else None))

    for t in TEMPLATE:
        session.add(Task(title=t.title, phase=t.phase.value, source=TaskSource.TEMPLATE.value))
    session.flush()
    return {
        "obligations": len(seed.obligations), "milestones": len(seed.milestones),
        "tasks": len(seed.tasks), "templateTasks": len(TEMPLATE),
    }



