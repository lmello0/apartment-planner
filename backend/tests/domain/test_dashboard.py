from datetime import date
from decimal import Decimal as D

from app.domain.dashboard import InstallmentView, build, next_tasks, status_of
from app.domain.types import InstallmentStatus


def v(id, due, amount, paid=None, name="Corretagem", oid="o1", projected=None):
    return InstallmentView(id, oid, name, 1, 6, due, D(amount), D(projected or amount),
                           D(paid) if paid else None, due if paid else None)


TODAY = date(2026, 11, 11)


def test_status_derivation():
    assert status_of(v("a", date(2026, 11, 1), "1", paid="1"), TODAY, 7) is InstallmentStatus.PAID
    assert status_of(v("a", date(2026, 11, 10), "1"), TODAY, 7) is InstallmentStatus.OVERDUE
    assert status_of(v("a", date(2026, 11, 18), "1"), TODAY, 7) is InstallmentStatus.DUE_SOON
    assert status_of(v("a", date(2026, 11, 19), "1"), TODAY, 7) is InstallmentStatus.PENDING
    assert status_of(v("a", TODAY, "1"), TODAY, 7) is InstallmentStatus.DUE_SOON


def test_totals_upcoming_overdue_and_monthly():
    views = [v("a", date(2026, 10, 15), "2548", paid="2548"),
             v("b", date(2026, 11, 5), "100"),
             v("c", date(2026, 11, 15), "2548"),
             v("d", date(2026, 12, 15), "2548"),
             v("e", date(2027, 1, 15), "10", oid="o2", name="X")]
    d = build(views, TODAY, D("0"), date(2027, 1, 20))
    assert d.paid == D("2548.00")
    assert d.overdue_total == D("100.00") and [x.id for x in d.overdue] == ["b"]
    assert [x.id for x in d.upcoming] == ["c"]
    assert d.pending == D("5206.00")  # projected - paid: includes the overdue 100
    assert d.expected == D("7754.00") and d.projected == d.expected
    assert d.projected == d.paid + d.pending and d.projected_correction == D("0.00")
    assert [m[0] for m in d.monthly] == ["2026-10", "2026-11", "2026-12", "2027-01"]
    assert d.monthly[0] == ("2026-10", D("2548.00"), D("2548.00"))
    assert d.current_month_commitment == D("2648.00")
    assert not d.capacity_exceeded


def test_capacity_exceeded():
    d = build([v("c", date(2026, 11, 15), "2548")], TODAY, D("2000"), None)
    assert d.capacity_exceeded


def test_next_tasks_open_by_due_date_nulls_last_limited():
    class T:
        def __init__(self, due, done=None):
            self.due_date, self.done_at = due, done

    tasks = [T(None), T(date(2026, 12, 1)), T(date(2026, 11, 1), done=TODAY), T(date(2026, 11, 20))]
    got = next_tasks(tasks, 2)
    assert [t.due_date for t in got] == [date(2026, 11, 20), date(2026, 12, 1)]


def test_contract_vs_projected_split():
    # paid at a different amount than contracted; unpaid one carries a projected correction
    views = [v("a", date(2026, 10, 15), "1000", paid="1010", projected="1010"),
             v("b", date(2026, 11, 5), "1000", projected="1020"),   # overdue
             v("c", date(2026, 12, 15), "2000", projected="2100", oid="o2", name="Obra")]
    d = build(views, TODAY, D("0"), None)
    assert d.expected == D("4000.00")               # contractual
    assert d.projected == D("4130.00")              # paid amount + projected unpaid
    assert d.projected_correction == D("130.00")
    assert d.paid == D("1010.00")
    assert d.pending == D("3120.00")                # projected - paid
    assert d.overdue_total == D("1020.00")
    by = {o[0]: o for o in d.by_obligation}
    assert by["o1"][1:] == ("Corretagem", D("2000.00"), D("2030.00"), D("1010.00"), D("1020.00"))
    assert by["o2"][1:] == ("Obra", D("2000.00"), D("2100.00"), D("0.00"), D("2100.00"))
