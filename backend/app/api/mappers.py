from __future__ import annotations

from datetime import UTC
from decimal import Decimal

from sqlalchemy.orm import Session

from app.api import schemas as s
from app.db.models import Document, Installment, Milestone, Obligation, Settings, Task
from app.domain.dashboard import DashboardData, InstallmentView, status_of
from app.domain.types import (
    MILESTONE_LABELS,
    DocumentLinkType,
    MilestoneKey,
    Periodicity,
    document_expiry,
    money,
)
from app.services.context import Ctx


def installment_dto(inst: Installment, view: InstallmentView, ctx: Ctx) -> s.InstallmentDto:
    pay = inst.payment
    return s.InstallmentDto(
        id=inst.id, obligation_id=view.obligation_id, obligation_name=view.obligation_name,
        seq=view.seq, count=view.count, due_date=inst.due_date,
        expected_amount=inst.expected_amount, projected_amount=view.projected,
        status=status_of(view, ctx.today, ctx.settings.due_soon_days),
        payment=s.PaymentDto(paid_on=pay.paid_on, amount=pay.amount,
                             method=pay.method)  # type: ignore[arg-type]
        if pay else None,
        document_count=ctx.doc_counts.get(inst.id, 0))


def view_dto(view: InstallmentView, ctx: Ctx, by_id: dict[str, Installment]) -> s.InstallmentDto:
    return installment_dto(by_id[view.id], view, ctx)


def obligation_dto(ob: Obligation, ctx: Ctx) -> s.ObligationDto:
    insts = ob.installments
    if insts:
        total_expected = sum((i.expected_amount for i in insts), Decimal(0))
    elif ob.periodicity == Periodicity.OPEN_ENDED.value:
        total_expected = Decimal(0)
    elif ob.amounts:
        total_expected = sum((Decimal(a) for a in ob.amounts), Decimal(0))
    else:
        total_expected = ob.amount * (ob.count or 1)
    total_paid = sum((i.payment.amount for i in insts if i.payment), Decimal(0))
    return s.ObligationDto(
        id=ob.id, name=ob.name, payee=ob.payee, category=ob.category,  # type: ignore[arg-type]
        status=ob.status, funding_source=ob.funding_source,  # type: ignore[arg-type]
        correction_index=ob.correction_index, periodicity=ob.periodicity,  # type: ignore[arg-type]
        count=ob.count, amount=ob.amount, amounts=ob.amounts, day_of_month=ob.day_of_month,
        first_due_date=ob.first_due_date,
        anchor_milestone=ob.anchor_milestone,  # type: ignore[arg-type]
        offset_days=ob.offset_days, notes=ob.notes,
        total_expected=money(total_expected), total_paid=money(total_paid))


def obligation_detail(ob: Obligation, ctx: Ctx) -> s.ObligationDetailDto:
    count = len(ob.installments)
    items = [installment_dto(i, ctx.view(i, count), ctx) for i in ob.installments]
    return s.ObligationDetailDto(**obligation_dto(ob, ctx).model_dump(), installments=items)


def milestone_dto(m: Milestone) -> s.MilestoneDto:
    return s.MilestoneDto(key=MilestoneKey(m.key), label=MILESTONE_LABELS[MilestoneKey(m.key)],
                          expected_date=m.expected_date, actual_date=m.actual_date)


def task_dto(t: Task) -> s.TaskDto:
    return s.TaskDto.model_validate(t)


def settings_dto(row: Settings) -> s.SettingsDto:
    return s.SettingsDto(
        monthly_capacity=row.monthly_capacity, incc_monthly_estimate=row.incc_monthly_estimate,
        igpm_monthly_estimate=row.igpm_monthly_estimate, due_soon_days=row.due_soon_days)


def document_link(session: Session, doc: Document) -> s.DocumentLink | None:
    if doc.installment_id and (inst := session.get(Installment, doc.installment_id)):
        label = f"{inst.obligation.name} {inst.seq}/{len(inst.obligation.installments)}"
        return s.DocumentLink(type=DocumentLinkType.INSTALLMENT, id=inst.id, label=label)
    if doc.obligation_id and (ob := session.get(Obligation, doc.obligation_id)):
        return s.DocumentLink(type=DocumentLinkType.OBLIGATION, id=ob.id, label=ob.name)
    if doc.task_id and (task := session.get(Task, doc.task_id)):
        return s.DocumentLink(type=DocumentLinkType.TASK, id=task.id, label=task.title)
    if doc.milestone_key:
        return s.DocumentLink(
            type=DocumentLinkType.MILESTONE, id=doc.milestone_key,
            label=MILESTONE_LABELS[MilestoneKey(doc.milestone_key)])
    return None


def document_dto(session: Session, doc: Document, ctx: Ctx) -> s.DocumentDto:
    created = doc.created_at if doc.created_at.tzinfo else doc.created_at.replace(tzinfo=UTC)
    return s.DocumentDto(
        id=doc.id, title=doc.title, category=doc.category,  # type: ignore[arg-type]
        document_date=doc.document_date, valid_until=doc.valid_until, notes=doc.notes,
        original_name=doc.original_name, mime_type=doc.mime_type, size_bytes=doc.size_bytes,
        created_at=created, link=document_link(session, doc),
        expiry=document_expiry(doc.valid_until, ctx.today, ctx.settings.due_soon_days))


def dashboard_dto(
    data: DashboardData, ctx: Ctx, by_id: dict[str, Installment], tasks: list[Task],
    expiring_docs: list[s.DocumentDto] | None = None,
) -> s.DashboardDto:
    return s.DashboardDto(
        totals=s.TotalsDto(
            expected=data.expected, projected=data.projected,
            projected_correction=data.projected_correction, paid=data.paid,
            pending=data.pending, overdue=data.overdue_total),
        upcoming=[view_dto(v, ctx, by_id) for v in data.upcoming],
        overdue=[view_dto(v, ctx, by_id) for v in data.overdue],
        by_obligation=[
            s.ByObligationDto(obligation_id=o, name=n, expected=e, projected=pr, paid=p, pending=pe)
            for o, n, e, pr, p, pe in data.by_obligation],
        monthly=[s.MonthlyDto(month=m, expected=e, paid=p) for m, e, p in data.monthly],
        capacity=s.CapacityDto(
            monthly_capacity=ctx.settings.monthly_capacity,
            current_month_commitment=data.current_month_commitment,
            exceeded=data.capacity_exceeded),
        next_tasks=[task_dto(t) for t in tasks],
        expiring_documents=expiring_docs or [])
