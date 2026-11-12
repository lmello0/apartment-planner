from datetime import date
from decimal import Decimal as D

from app.domain.projection import BASE_MONTH, project
from app.domain.types import CorrectionIndex, money

INCC, IGPM = D("0.50"), D("0.40")


def p(amount, due, index=CorrectionIndex.INCC_DI, habite=None):
    return project(D(amount), due, index, INCC, IGPM, habite)


def test_base_month_and_next_month_have_no_correction_due_to_lag():
    assert BASE_MONTH == date(2026, 8, 1)
    assert p("1000", date(2026, 8, 31)) == D("1000.00")
    assert p("1000", date(2026, 9, 16)) == D("1000.00")


def test_incc_applies_one_month_lag():
    assert p("1000", date(2026, 10, 16)) == D("1005.00")
    assert p("10000", date(2026, 12, 31)) == money(D("10000") * D("1.005") ** 3)


def test_no_index_means_no_projection():
    assert p("500", date(2030, 1, 1), CorrectionIndex.NONE) == D("500.00")


def test_igpm_index_uses_igpm_estimate():
    assert p("1000", date(2026, 10, 16), CorrectionIndex.IGPM) == D("1004.00")


def test_post_habite_se_switches_to_igpm_plus_price_one_percent():
    habite = date(2027, 6, 10)
    got = p("1000", date(2027, 8, 16), habite=habite)
    expected = D("1000") * D("1.005") ** 9 * (D("1.004") * D("1.01")) ** 2
    assert got == money(expected)


def test_due_before_habite_se_is_unaffected():
    assert p("1000", date(2027, 5, 16), habite=date(2027, 6, 10)) == p("1000", date(2027, 5, 16))


def test_projection_follows_configurable_estimate():
    assert project(D("1000"), date(2026, 10, 16), CorrectionIndex.INCC_DI, D("1.00"), IGPM, None) == D("1010.00")
