from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import JSON, Date, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

MONEY = Numeric(14, 2)


def new_id() -> str:
    return str(uuid.uuid4())


class Milestone(Base):
    __tablename__ = "milestones"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    expected_date: Mapped[date | None] = mapped_column(Date)
    actual_date: Mapped[date | None] = mapped_column(Date)


class Obligation(Base):
    __tablename__ = "obligations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    payee: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="CONTRACTED")
    funding_source: Mapped[str] = mapped_column(String(16), default="OWN")
    correction_index: Mapped[str] = mapped_column(String(16), default="NONE")
    periodicity: Mapped[str] = mapped_column(String(16))
    count: Mapped[int | None] = mapped_column(Integer)
    amount: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0.00"))
    amounts: Mapped[list[str] | None] = mapped_column(JSON)
    day_of_month: Mapped[int | None] = mapped_column(Integer)
    first_due_date: Mapped[date | None] = mapped_column(Date)
    anchor_milestone: Mapped[str | None] = mapped_column(String(32))
    offset_days: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text)
    # Set on the auto-generated FINANCING_DIFFERENCE obligation (managed by the financing rule).
    auto_generated: Mapped[bool] = mapped_column(default=False)

    installments: Mapped[list[Installment]] = relationship(
        back_populates="obligation", cascade="all, delete-orphan", order_by="Installment.seq"
    )


class Installment(Base):
    __tablename__ = "installments"
    __table_args__ = (UniqueConstraint("obligation_id", "seq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    obligation_id: Mapped[str] = mapped_column(
        ForeignKey("obligations.id", ondelete="CASCADE"), index=True
    )
    seq: Mapped[int] = mapped_column(Integer)
    due_date: Mapped[date] = mapped_column(Date, index=True)
    expected_amount: Mapped[Decimal] = mapped_column(MONEY)

    obligation: Mapped[Obligation] = relationship(back_populates="installments")
    payment: Mapped[Payment | None] = relationship(
        back_populates="installment", cascade="all, delete-orphan", uselist=False
    )


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    installment_id: Mapped[str] = mapped_column(
        ForeignKey("installments.id", ondelete="CASCADE"), unique=True
    )
    paid_on: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(MONEY)
    method: Mapped[str] = mapped_column(String(16))
    receipt_path: Mapped[str | None] = mapped_column(String(500))

    installment: Mapped[Installment] = relationship(back_populates="payment")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    title: Mapped[str] = mapped_column(String(300))
    phase: Mapped[str] = mapped_column(String(24))
    due_date: Mapped[date | None] = mapped_column(Date)
    done_at: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    obligation_id: Mapped[str | None] = mapped_column(
        ForeignKey("obligations.id", ondelete="SET NULL")
    )
    installment_id: Mapped[str | None] = mapped_column(
        ForeignKey("installments.id", ondelete="SET NULL")
    )
    source: Mapped[str] = mapped_column(String(16), default="MANUAL")
    rule_key: Mapped[str | None] = mapped_column(String(64))


class Settings(Base):
    """Single-row table (id = 1)."""

    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    monthly_capacity: Mapped[Decimal] = mapped_column(MONEY, default=Decimal("0.00"))
    incc_monthly_estimate: Mapped[Decimal] = mapped_column(Numeric(6, 3), default=Decimal("0.50"))
    igpm_monthly_estimate: Mapped[Decimal] = mapped_column(Numeric(6, 3), default=Decimal("0.40"))
    due_soon_days: Mapped[int] = mapped_column(Integer, default=7)
