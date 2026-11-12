from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import PaymentIn
from app.db.models import Installment, Payment
from app.domain.types import money
from app.services.context import Conflict, NotFound


def get_installment(session: Session, installment_id: str) -> Installment:
    inst = session.get(Installment, installment_id)
    if inst is None:
        raise NotFound(f"installment {installment_id}")
    return inst


def register(session: Session, installment_id: str, data: PaymentIn) -> Installment:
    inst = get_installment(session, installment_id)
    if inst.payment is not None:
        raise Conflict("installment already paid")
    inst.payment = Payment(paid_on=data.paid_on, amount=money(data.amount),
                           method=data.method.value, receipt_path=data.receipt_path)
    session.flush()
    return inst


def undo(session: Session, installment_id: str) -> Installment:
    inst = get_installment(session, installment_id)
    if inst.payment is not None:
        session.delete(inst.payment)
        session.flush()
        session.expire(inst, ["payment"])
    return inst


def list_installments(session: Session) -> list[Installment]:
    return list(session.scalars(select(Installment).order_by(Installment.due_date, Installment.seq)))
