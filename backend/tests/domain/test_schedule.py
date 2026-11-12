from datetime import date
from decimal import Decimal as D

from app.domain.schedule import ExistingInstallment, generate, reconcile
from app.domain.types import MilestoneKey, Periodicity, ScheduleSpec

BROKERAGE = ScheduleSpec(
    periodicity=Periodicity.MONTHLY,
    amount=D("2548.00"),
    count=6,
    amounts=(D("2548.00"),) * 5 + (D("2545.60"),),
    day_of_month=15,
    first_due_date=date(2026, 8, 15),
)


def test_brokerage_generates_six_installments_summing_15285_60():
    plan = generate(BROKERAGE, {})
    assert len(plan) == 6
    assert [p.due_date for p in plan][0] == date(2026, 8, 15)
    assert plan[-1].due_date == date(2027, 1, 15)
    assert sum(p.expected_amount for p in plan) == D("15285.60")


def test_monthly_1_due_dates_16_feb_to_16_jul_2027():
    spec = ScheduleSpec(Periodicity.MONTHLY, D("1500"), count=6, day_of_month=16,
                        first_due_date=date(2027, 2, 16))
    plan = generate(spec, {})
    assert [p.due_date for p in plan] == [date(2027, m, 16) for m in range(2, 8)]


def test_annual_two_installments():
    spec = ScheduleSpec(Periodicity.ANNUAL, D("10000"), count=2, first_due_date=date(2026, 12, 31))
    assert [p.due_date for p in generate(spec, {})] == [date(2026, 12, 31), date(2027, 12, 31)]


def test_day_is_clamped_to_month_end():
    spec = ScheduleSpec(Periodicity.MONTHLY, D("1"), count=3, day_of_month=31,
                        first_due_date=date(2027, 1, 31))
    assert [p.due_date for p in generate(spec, {})] == [
        date(2027, 1, 31), date(2027, 2, 28), date(2027, 3, 31)]


def test_anchored_once_follows_milestone_plus_offset():
    spec = ScheduleSpec(Periodicity.ONCE, D("302000.40"), anchor_milestone=MilestoneKey.KEY_DELIVERY,
                        offset_days=2)
    plan = generate(spec, {MilestoneKey.KEY_DELIVERY: date(2028, 2, 28)})
    assert plan[0].due_date == date(2028, 3, 1)


def test_anchor_without_date_generates_nothing():
    spec = ScheduleSpec(Periodicity.ONCE, D("1"), anchor_milestone=MilestoneKey.HABITE_SE)
    assert generate(spec, {MilestoneKey.HABITE_SE: None}) == []


def test_open_ended_generates_twelve_months_from_anchor():
    spec = ScheduleSpec(Periodicity.OPEN_ENDED, D("800"), anchor_milestone=MilestoneKey.INSPECTION_CALL)
    plan = generate(spec, {MilestoneKey.INSPECTION_CALL: date(2028, 1, 10)})
    assert len(plan) == 12
    assert plan[1].due_date == date(2028, 2, 10)


def test_reconcile_never_touches_paid_installments():
    planned = generate(BROKERAGE, {})
    existing = [ExistingInstallment("a", 1, date(2026, 8, 15), D("2548.00"), paid=True),
                ExistingInstallment("b", 2, date(2026, 9, 15), D("2548.00"), paid=False),
                ExistingInstallment("z", 9, date(2030, 1, 1), D("1"), paid=False)]
    changed = [p for p in planned]
    r = reconcile(existing, changed)
    assert "a" not in r.update and "a" not in r.delete
    assert "b" in r.update
    assert r.delete == ["z"]
    assert sorted(p.seq for p in r.create) == [3, 4, 5, 6]


def test_reconcile_keeps_paid_even_if_no_longer_planned():
    existing = [ExistingInstallment("a", 7, date(2026, 8, 15), D("1"), paid=True)]
    r = reconcile(existing, [])
    assert r.delete == [] and r.update == {} and r.create == []
