"""Projection of installment amounts with INCC-DI / IGP-M monthly estimates.

Regime (contract cl. 6ª): INCC-DI monthly with a 1-month lag from the base month
(Aug/2026). After HABITE_SE the open balance is corrected by IGP-M plus Price
interest of 1% per month.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.domain.types import CorrectionIndex, money

BASE_MONTH = date(2026, 8, 1)
INDEX_LAG_MONTHS = 1
PRICE_MONTHLY_RATE = Decimal("0.01")


def months_between(start: date, end: date) -> int:
    return (end.year - start.year) * 12 + (end.month - start.month)


def _factor(rate_percent: Decimal, months: int) -> Decimal:
    return (Decimal(1) + rate_percent / Decimal(100)) ** max(months, 0)


def project(
    expected: Decimal,
    due_date: date,
    index: CorrectionIndex,
    incc_monthly: Decimal,
    igpm_monthly: Decimal,
    habite_se: date | None,
    base_month: date = BASE_MONTH,
) -> Decimal:
    if index is CorrectionIndex.NONE:
        return money(expected)

    pre_rate = incc_monthly if index is CorrectionIndex.INCC_DI else igpm_monthly
    total_months = max(0, months_between(base_month, due_date) - INDEX_LAG_MONTHS)

    if habite_se is None or due_date <= habite_se or (
        due_date.year, due_date.month) <= (habite_se.year, habite_se.month):
        return money(expected * _factor(pre_rate, total_months))

    pre_months = min(total_months, max(0, months_between(base_month, habite_se) - INDEX_LAG_MONTHS))
    post_months = months_between(habite_se, due_date)
    post_factor = _factor(igpm_monthly, post_months) * (Decimal(1) + PRICE_MONTHLY_RATE) ** post_months
    return money(expected * _factor(pre_rate, pre_months) * post_factor)
