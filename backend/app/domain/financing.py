"""Financing rule: contracted value below the contract reference creates a difference to pay."""

from __future__ import annotations

from decimal import Decimal

from app.domain.types import ObligationStatus, money

FINANCING_REFERENCE = Decimal("302000.40")
DIFFERENCE_NAME = "Diferença do financiamento"


def financing_difference(
    status: ObligationStatus, amount: Decimal, reference: Decimal = FINANCING_REFERENCE
) -> Decimal | None:
    """Amount of the FINANCING_DIFFERENCE obligation, or None when none is needed.

    Only a CONTRACTED financing below the reference creates a difference (cl. 6ª §4º);
    an equal or greater value, or a still-ESTIMATED one, creates none.
    """
    if status is not ObligationStatus.CONTRACTED:
        return None
    if amount >= reference:
        return None
    return money(reference - amount)
