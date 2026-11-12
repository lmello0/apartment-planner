from __future__ import annotations

from decimal import Decimal

from app.api import schemas as s
from app.db.models import Installment, Milestone, Obligation, Settings, Task
from app.domain.dashboard import DashboardData, InstallmentView, status_of
from app.domain.types import MILESTONE_LABELS, MilestoneKey, Periodicity, money
from app.services.context import Ctx


def installment_dto(inst: Installment, view: InstallmentView, ctx: Ctx) -> s.InstallmentDto:
    pay = inst.payment
    return s.InstallmentDto(
        id=inst.id, obligation_id=view.obligation_id, obligation_name=view.obligation_name,
        seq=view.seq, count=view.count, due_date=inst.due_date,
        expected_amount=inst.expected_amount, projected_amount=view.projected,
        status=status_of(view, ctx.today, ctx.settings.due_soon_days),
        payment=s.PaymentDto(paid_on=pay.paid_on, amount=pay.amount,
                             method=pay.method, receipt_path=pay.receipt_path)  # type: ignore[arg-type]
        if pay else None)


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


def dashboard_dto(
    data: DashboardData, ctx: Ctx, by_id: dict[str, Installment], tasks: list[Task]
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
        next_tasks=[task_dto(t) for t in tasks])
