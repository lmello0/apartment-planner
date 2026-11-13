"""Pydantic DTOs (camelCase JSON). Money is serialized as a 2-place decimal string."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator, model_validator
from pydantic.alias_generators import to_camel

from app.domain.types import (
    ALLOWED_DOCUMENT_MIMES,
    MAX_DOCUMENT_BYTES,
    Category,
    CorrectionIndex,
    DocumentCategory,
    DocumentExpiry,
    DocumentLinkType,
    FundingSource,
    InstallmentStatus,
    MilestoneKey,
    ObligationStatus,
    PaymentMethod,
    Periodicity,
    TaskPhase,
    TaskSource,
    money,
)


def _money_str(value: Decimal) -> str:
    return f"{money(value):.2f}"


Money = Annotated[Decimal, PlainSerializer(_money_str, return_type=str, when_used="json")]
Percent = Annotated[
    Decimal, PlainSerializer(lambda v: f"{v:.2f}", return_type=str, when_used="json")
]


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, from_attributes=True
    )


# ---- outputs -----------------------------------------------------------------------------


class PaymentDto(CamelModel):
    paid_on: date
    amount: Money
    method: PaymentMethod


class InstallmentDto(CamelModel):
    id: str
    obligation_id: str
    obligation_name: str
    seq: int
    count: int
    due_date: date
    expected_amount: Money
    projected_amount: Money
    status: InstallmentStatus
    payment: PaymentDto | None = None
    document_count: int = 0


class ObligationDto(CamelModel):
    id: str
    name: str
    payee: str
    category: Category
    status: ObligationStatus
    funding_source: FundingSource
    correction_index: CorrectionIndex
    periodicity: Periodicity
    count: int | None
    amount: Money
    amounts: list[str] | None
    day_of_month: int | None
    first_due_date: date | None
    anchor_milestone: MilestoneKey | None
    offset_days: int
    notes: str | None
    total_expected: Money
    total_paid: Money


class ObligationDetailDto(ObligationDto):
    installments: list[InstallmentDto]


class MilestoneDto(CamelModel):
    key: MilestoneKey
    label: str
    expected_date: date | None
    actual_date: date | None


class MilestoneUpdateResult(CamelModel):
    milestone: MilestoneDto
    effects: list[str]


class DocumentLink(CamelModel):
    type: DocumentLinkType
    id: str
    label: str


class DocumentDto(CamelModel):
    id: str
    title: str
    category: DocumentCategory
    document_date: date | None
    valid_until: date | None
    notes: str | None
    original_name: str
    mime_type: str
    size_bytes: int
    created_at: datetime
    link: DocumentLink | None
    expiry: DocumentExpiry | None


class UploadInfo(CamelModel):
    url: str
    method: str
    headers: dict[str, str]


class DocumentCreated(CamelModel):
    document: DocumentDto
    upload: UploadInfo


class DownloadUrlDto(CamelModel):
    url: str
    expires_at: datetime


class TaskDto(CamelModel):
    id: str
    title: str
    phase: TaskPhase
    due_date: date | None
    done_at: date | None
    notes: str | None
    obligation_id: str | None
    installment_id: str | None
    source: TaskSource


class SettingsDto(CamelModel):
    monthly_capacity: Money
    incc_monthly_estimate: Percent
    igpm_monthly_estimate: Percent
    due_soon_days: int


class TotalsDto(CamelModel):
    expected: Money
    projected: Money
    projected_correction: Money
    paid: Money
    pending: Money
    overdue: Money


class ByObligationDto(CamelModel):
    obligation_id: str
    name: str
    expected: Money
    projected: Money
    paid: Money
    pending: Money


class MonthlyDto(CamelModel):
    month: str
    expected: Money
    paid: Money


class CapacityDto(CamelModel):
    monthly_capacity: Money
    current_month_commitment: Money
    exceeded: bool


class DashboardDto(CamelModel):
    totals: TotalsDto
    upcoming: list[InstallmentDto]
    overdue: list[InstallmentDto]
    by_obligation: list[ByObligationDto]
    monthly: list[MonthlyDto]
    capacity: CapacityDto
    next_tasks: list[TaskDto]
    expiring_documents: list[DocumentDto] = []


# ---- inputs ------------------------------------------------------------------------------


class PaymentIn(CamelModel):
    paid_on: date
    amount: Decimal = Field(ge=0)
    method: PaymentMethod


class DocumentIn(CamelModel):
    title: str = Field(min_length=1, max_length=300)
    category: DocumentCategory = DocumentCategory.OTHER
    document_date: date | None = None
    valid_until: date | None = None
    notes: str | None = None
    installment_id: str | None = None
    obligation_id: str | None = None
    task_id: str | None = None
    milestone_key: MilestoneKey | None = None

    @model_validator(mode="after")
    def _single_link(self) -> DocumentIn:
        links = [self.installment_id, self.obligation_id, self.task_id, self.milestone_key]
        if sum(x is not None for x in links) > 1:
            raise ValueError("a document can be linked to at most one item")
        return self


class DocumentCreateIn(DocumentIn):
    original_name: str = Field(min_length=1, max_length=500)
    mime_type: str
    size_bytes: int = Field(ge=1, le=MAX_DOCUMENT_BYTES)

    @field_validator("mime_type")
    @classmethod
    def _mime_allowed(cls, v: str) -> str:
        v = v.split(";")[0].strip().lower()
        if v not in ALLOWED_DOCUMENT_MIMES:
            raise ValueError(f"mime type not allowed: {v}")
        return v


class ObligationIn(CamelModel):
    name: str = Field(min_length=1, max_length=200)
    payee: str = Field(default="", max_length=200)
    category: Category = Category.OTHER
    status: ObligationStatus = ObligationStatus.CONTRACTED
    funding_source: FundingSource = FundingSource.OWN
    correction_index: CorrectionIndex = CorrectionIndex.NONE
    periodicity: Periodicity = Periodicity.ONCE
    count: int | None = Field(default=None, ge=1)
    amount: Decimal = Field(default=Decimal("0"), ge=0)
    amounts: list[Decimal] | None = None
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    first_due_date: date | None = None
    anchor_milestone: MilestoneKey | None = None
    offset_days: int = 0
    notes: str | None = None

    @field_validator("amounts")
    @classmethod
    def _amounts_non_negative(cls, v: list[Decimal] | None) -> list[Decimal] | None:
        if v is not None and any(a < 0 for a in v):
            raise ValueError("amounts must be >= 0")
        return v


class MilestoneIn(CamelModel):
    expected_date: date | None = None
    actual_date: date | None = None


class TaskIn(CamelModel):
    title: str = Field(min_length=1, max_length=300)
    phase: TaskPhase = TaskPhase.PRE_CONTRACT
    due_date: date | None = None
    done_at: date | None = None
    notes: str | None = None
    obligation_id: str | None = None
    installment_id: str | None = None


class SettingsIn(CamelModel):
    monthly_capacity: Decimal = Field(ge=0)
    incc_monthly_estimate: Decimal = Field(ge=-10, le=10)
    igpm_monthly_estimate: Decimal = Field(ge=-10, le=10)
    due_soon_days: int = Field(ge=0, le=365)


class SeedPayment(CamelModel):
    seq: int = 1
    paid_on: date
    amount: Decimal
    method: PaymentMethod = PaymentMethod.PIX


class SeedObligation(ObligationIn):
    payments: list[SeedPayment] = []


class SeedMilestone(CamelModel):
    key: MilestoneKey
    expected_date: date | None = None
    actual_date: date | None = None


class SeedSettings(CamelModel):
    monthly_capacity: Decimal = Decimal("0")
    incc_monthly_estimate: Decimal = Decimal("0.50")
    igpm_monthly_estimate: Decimal = Decimal("0.40")
    due_soon_days: int = 7


class SeedTask(CamelModel):
    title: str
    phase: TaskPhase = TaskPhase.PRE_CONTRACT
    due_date: date | None = None
    notes: str | None = None
    obligation_name: str | None = None  # links to the obligation (and its installment `seq`)
    installment_seq: int | None = None


class SeedFile(CamelModel):
    settings: SeedSettings = SeedSettings()
    milestones: list[SeedMilestone] = []
    obligations: list[SeedObligation] = []
    tasks: list[SeedTask] = []
