"""Schedule generation and reconciliation of installments."""

from __future__ import annotations

import calendar
from collections.abc import Mapping
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from app.domain.types import MilestoneKey, Periodicity, PlannedInstallment, ScheduleSpec, money

OPEN_ENDED_HORIZON = 12


def add_months(d: date, months: int, day: int | None = None) -> date:
    index = d.year * 12 + (d.month - 1) + months
    year, month = divmod(index, 12)
    month += 1
    wanted = day or d.day
    return date(year, month, min(wanted, calendar.monthrange(year, month)[1]))


def _first_due(spec: ScheduleSpec, milestones: Mapping[MilestoneKey, date | None]) -> date | None:
    if spec.anchor_milestone is not None:
        anchor = milestones.get(spec.anchor_milestone)
        if anchor is None:
            return None
        start = anchor + timedelta(days=spec.offset_days)
        if spec.day_of_month and spec.periodicity in (Periodicity.MONTHLY, Periodicity.OPEN_ENDED):
            first = add_months(start, 0, spec.day_of_month)
            return first if first >= start else add_months(start, 1, spec.day_of_month)
        return start
    return spec.first_due_date


def _count(spec: ScheduleSpec) -> int:
    if spec.periodicity is Periodicity.ONCE:
        return 1
    if spec.periodicity is Periodicity.OPEN_ENDED:
        return spec.count or OPEN_ENDED_HORIZON
    if spec.amounts and spec.count is None:
        return len(spec.amounts)
    return spec.count or 1


def generate(
    spec: ScheduleSpec, milestones: Mapping[MilestoneKey, date | None]
) -> list[PlannedInstallment]:
    """Due dates and expected amounts. Empty when the anchor date is still unknown."""
    first = _first_due(spec, milestones)
    if first is None:
        return []
    day = spec.day_of_month or first.day
    out: list[PlannedInstallment] = []
    for i in range(_count(spec)):
        if spec.periodicity is Periodicity.ONCE:
            due = first
        elif spec.periodicity is Periodicity.ANNUAL:
            due = add_months(first, 12 * i)
        else:
            due = add_months(first, i, day)
        amount = spec.amounts[i] if spec.amounts and i < len(spec.amounts) else spec.amount
        out.append(PlannedInstallment(i + 1, due, money(amount)))
    return out


@dataclass(frozen=True)
class ExistingInstallment:
    id: str
    seq: int
    due_date: date
    expected_amount: Decimal
    paid: bool


@dataclass
class Reconciliation:
    update: dict[str, PlannedInstallment] = field(default_factory=dict)
    create: list[PlannedInstallment] = field(default_factory=list)
    delete: list[str] = field(default_factory=list)


def reconcile(
    existing: list[ExistingInstallment], planned: list[PlannedInstallment]
) -> Reconciliation:
    """Diff stored installments against a fresh plan. Paid installments are never touched."""
    result = Reconciliation()
    by_seq = {p.seq: p for p in planned}
    seen: set[int] = set()
    for inst in existing:
        seen.add(inst.seq)
        if inst.paid:
            continue
        target = by_seq.get(inst.seq)
        if target is None:
            result.delete.append(inst.id)
        else:
            result.update[inst.id] = target
    result.create = [p for p in planned if p.seq not in seen]
    return result
