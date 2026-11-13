"""Pure domain vocabulary: enums and value objects. No framework imports."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum

CENT = Decimal("0.01")


def money(value: Decimal | str | int) -> Decimal:
    """Quantize to 2 places (half up)."""
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


class MilestoneKey(StrEnum):
    FINANCING_SIGNED = "FINANCING_SIGNED"
    CONTRACT_REGISTERED = "CONTRACT_REGISTERED"
    DOCS_CALL = "DOCS_CALL"
    HABITE_SE = "HABITE_SE"
    INSPECTION_CALL = "INSPECTION_CALL"
    KEY_DELIVERY = "KEY_DELIVERY"


class Category(StrEnum):
    BUILDER_INSTALLMENT = "BUILDER_INSTALLMENT"
    BROKERAGE = "BROKERAGE"
    FINANCING = "FINANCING"
    FINANCING_DIFFERENCE = "FINANCING_DIFFERENCE"
    CONSTRUCTION_INTEREST = "CONSTRUCTION_INTEREST"
    FEE_TAX = "FEE_TAX"
    CONDO_IPTU = "CONDO_IPTU"
    OTHER = "OTHER"


class ObligationStatus(StrEnum):
    ESTIMATED = "ESTIMATED"
    CONTRACTED = "CONTRACTED"


class FundingSource(StrEnum):
    OWN = "OWN"
    FGTS = "FGTS"
    SUBSIDY = "SUBSIDY"
    FINANCING = "FINANCING"


class CorrectionIndex(StrEnum):
    NONE = "NONE"
    INCC_DI = "INCC_DI"
    IGPM = "IGPM"


class Periodicity(StrEnum):
    ONCE = "ONCE"
    MONTHLY = "MONTHLY"
    ANNUAL = "ANNUAL"
    OPEN_ENDED = "OPEN_ENDED"


class InstallmentStatus(StrEnum):
    PENDING = "PENDING"
    DUE_SOON = "DUE_SOON"
    OVERDUE = "OVERDUE"
    PAID = "PAID"


class PaymentMethod(StrEnum):
    PIX = "PIX"
    BOLETO = "BOLETO"
    DEBIT = "DEBIT"
    FGTS = "FGTS"
    SUBSIDY = "SUBSIDY"


class TaskPhase(StrEnum):
    PRE_CONTRACT = "PRE_CONTRACT"
    CREDIT_APPROVAL = "CREDIT_APPROVAL"
    SIGNING = "SIGNING"
    CONSTRUCTION = "CONSTRUCTION"
    KEY_DELIVERY = "KEY_DELIVERY"
    POST_DELIVERY = "POST_DELIVERY"


class TaskSource(StrEnum):
    TEMPLATE = "TEMPLATE"
    RULE = "RULE"
    MANUAL = "MANUAL"


class DocumentCategory(StrEnum):
    PAYMENT_RECEIPT = "PAYMENT_RECEIPT"
    CONTRACT = "CONTRACT"
    PERSONAL_ID = "PERSONAL_ID"
    INCOME_FGTS_TAX = "INCOME_FGTS_TAX"
    FINANCING = "FINANCING"
    TAXES_FEES = "TAXES_FEES"
    PROJECT_SPEC = "PROJECT_SPEC"
    OTHER = "OTHER"


DOCUMENT_CATEGORY_LABELS: dict[DocumentCategory, str] = {
    DocumentCategory.PAYMENT_RECEIPT: "Comprovante de pagamento",
    DocumentCategory.CONTRACT: "Contrato",
    DocumentCategory.PERSONAL_ID: "Documento pessoal",
    DocumentCategory.INCOME_FGTS_TAX: "Renda/FGTS/IR",
    DocumentCategory.FINANCING: "Financiamento/Caixa",
    DocumentCategory.TAXES_FEES: "Impostos e taxas",
    DocumentCategory.PROJECT_SPEC: "Projeto/Memorial",
    DocumentCategory.OTHER: "Outros",
}


class DocumentStatus(StrEnum):
    PENDING = "PENDING"
    ACTIVE = "ACTIVE"


class DocumentExpiry(StrEnum):
    VALID = "VALID"
    DUE_SOON = "DUE_SOON"
    EXPIRED = "EXPIRED"


class DocumentLinkType(StrEnum):
    INSTALLMENT = "INSTALLMENT"
    OBLIGATION = "OBLIGATION"
    TASK = "TASK"
    MILESTONE = "MILESTONE"


MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
ALLOWED_DOCUMENT_MIMES: tuple[str, ...] = (
    "application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
)


def document_expiry(valid_until: date | None, today: date, due_soon_days: int) -> DocumentExpiry | None:
    """EXPIRED if `valid_until` is before today, DUE_SOON within `due_soon_days`, else VALID."""
    if valid_until is None:
        return None
    if valid_until < today:
        return DocumentExpiry.EXPIRED
    if (valid_until - today).days <= due_soon_days:
        return DocumentExpiry.DUE_SOON
    return DocumentExpiry.VALID


MILESTONE_LABELS: dict[MilestoneKey, str] = {
    MilestoneKey.FINANCING_SIGNED: "Assinatura do financiamento",
    MilestoneKey.CONTRACT_REGISTERED: "Registro do contrato no cartório",
    MilestoneKey.DOCS_CALL: "Convocação para documentos",
    MilestoneKey.HABITE_SE: "Habite-se",
    MilestoneKey.INSPECTION_CALL: "Convocação para vistoria",
    MilestoneKey.KEY_DELIVERY: "Entrega das chaves",
}


@dataclass(frozen=True)
class ScheduleSpec:
    """Everything needed to generate the due dates/amounts of an obligation."""

    periodicity: Periodicity
    amount: Decimal
    count: int | None = None
    amounts: tuple[Decimal, ...] | None = None
    day_of_month: int | None = None
    first_due_date: date | None = None
    anchor_milestone: MilestoneKey | None = None
    offset_days: int = 0


@dataclass(frozen=True)
class PlannedInstallment:
    seq: int
    due_date: date
    expected_amount: Decimal
