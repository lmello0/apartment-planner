"""Dashboard aggregation over installment views (pure)."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Protocol

from app.domain.schedule import add_months
from app.domain.types import InstallmentStatus, money

UPCOMING_DAYS = 30
NEXT_TASKS_LIMIT = 5
ZERO = Decimal("0.00")


@dataclass(frozen=True)
class InstallmentView:
    id: str
    obligation_id: str
    obligation_name: str
    seq: int
    count: int
    due_date: date
    expected: Decimal
    projected: Decimal  # equals the paid amount when paid
    paid_amount: Decimal | None = None
    paid_on: date | None = None

    @property
    def paid(self) -> bool:
        return self.paid_amount is not None


def status_of(view: InstallmentView, today: date, due_soon_days: int) -> InstallmentStatus:
    if view.paid:
        return InstallmentStatus.PAID
    if view.due_date < today:
        return InstallmentStatus.OVERDUE
    if view.due_date <= today + timedelta(days=due_soon_days):
        return InstallmentStatus.DUE_SOON
    return InstallmentStatus.PENDING


class _TaskLike(Protocol):
    due_date: date | None
    done_at: date | None


def next_tasks[T: _TaskLike](tasks: list[T], limit: int = NEXT_TASKS_LIMIT) -> list[T]:
    open_tasks = [t for t in tasks if t.done_at is None]
    open_tasks.sort(key=lambda t: (t.due_date is None, t.due_date or date.max))
    return open_tasks[:limit]


@dataclass
class DashboardData:
    expected: Decimal = ZERO  # contractual (sum of expected amounts)
    projected: Decimal = ZERO  # unpaid at projected amount + paid at amount actually paid
    projected_correction: Decimal = ZERO  # projected - expected
    paid: Decimal = ZERO
    pending: Decimal = ZERO
    overdue_total: Decimal = ZERO
    upcoming: list[InstallmentView] = field(default_factory=list)
    overdue: list[InstallmentView] = field(default_factory=list)
    by_obligation: list[tuple[str, str, Decimal, Decimal, Decimal, Decimal]] = field(default_factory=list)
    monthly: list[tuple[str, Decimal, Decimal]] = field(default_factory=list)
    current_month_commitment: Decimal = ZERO
    capacity_exceeded: bool = False


def build(
    views: list[InstallmentView],
    today: date,
    monthly_capacity: Decimal,
    key_delivery: date | None,
    upcoming_days: int = UPCOMING_DAYS,
) -> DashboardData:
    data = DashboardData()
    ordered = sorted(views, key=lambda v: (v.due_date, v.obligation_name, v.seq))
    horizon = today + timedelta(days=upcoming_days)

    per_ob: dict[str, list] = {}
    for v in ordered:
        data.expected += v.expected
        data.projected += v.projected
        if v.paid:
            data.paid += v.paid_amount or ZERO
        else:
            data.pending += v.projected
            if v.due_date < today:
                data.overdue_total += v.projected
                data.overdue.append(v)
            elif v.due_date <= horizon:
                data.upcoming.append(v)
        entry = per_ob.setdefault(v.obligation_id, [v.obligation_name, ZERO, ZERO, ZERO, ZERO])
        entry[1] += v.expected
        entry[2] += v.projected
        if v.paid:
            entry[3] += v.paid_amount or ZERO
        else:
            entry[4] += v.projected
    data.by_obligation = [(oid, e[0], money(e[1]), money(e[2]), money(e[3]), money(e[4]))
                          for oid, e in per_ob.items()]

    data.expected, data.projected = money(data.expected), money(data.projected)
    data.projected_correction = money(data.projected - data.expected)
    data.paid, data.pending = money(data.paid), money(data.pending)
    data.overdue_total = money(data.overdue_total)

    if ordered:
        first = ordered[0].due_date.replace(day=1)
        last = (key_delivery or ordered[-1].due_date).replace(day=1)
        expected_by: dict[str, Decimal] = defaultdict(lambda: ZERO)
        paid_by: dict[str, Decimal] = defaultdict(lambda: ZERO)
        for v in ordered:
            key = v.due_date.strftime("%Y-%m")
            expected_by[key] += v.projected
            if v.paid:
                paid_by[key] += v.paid_amount or ZERO
        cursor = first
        while cursor <= last:
            key = cursor.strftime("%Y-%m")
            data.monthly.append((key, money(expected_by[key]), money(paid_by[key])))
            cursor = add_months(cursor, 1)

    this_month = today.strftime("%Y-%m")
    data.current_month_commitment = money(
        sum((v.projected for v in ordered if v.due_date.strftime("%Y-%m") == this_month), ZERO))
    data.capacity_exceeded = (
        monthly_capacity > 0 and data.current_month_commitment > monthly_capacity)
    return data
