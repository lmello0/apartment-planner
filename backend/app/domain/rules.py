"""Milestone rules: what changes when a milestone date is set."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from app.domain.schedule import add_months
from app.domain.types import MILESTONE_LABELS, MilestoneKey, TaskPhase

DOCS_TASK_DAYS = 10
INSPECTION_TASK_DAYS = 7
ASSISTANCE_MONTHS = 3
MATRICULA_TASK_DAYS = 30
MATRICULA_NOTES = (
    "Notificação do ITBI (Decreto 18.564/2026, art. 32, I). Multa: R$ 290,69 se fora do prazo; "
    "R$ 581,38 se não fizer. Entrega presencial (Praça IV Centenário) ou pelo Portal de Serviços "
    "da Prefeitura em PDF.")


@dataclass(frozen=True)
class TaskSpec:
    rule_key: str
    title: str
    phase: TaskPhase
    due_date: date
    notes: str | None = None


@dataclass
class RuleResult:
    tasks: list[TaskSpec] = field(default_factory=list)
    effects: list[str] = field(default_factory=list)


def fmt(d: date) -> str:
    return d.strftime("%d/%m/%Y")


def evaluate(
    key: MilestoneKey, effective: date | None, anchored_obligations: list[str]
) -> RuleResult:
    """`effective` is actual_date or expected_date; `anchored_obligations` are the names of
    obligations whose schedule is anchored to this milestone (they get re-generated)."""
    result = RuleResult()
    label = MILESTONE_LABELS[key]
    if effective is None:
        result.effects.append(f"Marco «{label}» sem data: tarefas e parcelas ancoradas ficam sem data.")
        return result

    if key is MilestoneKey.DOCS_CALL:
        due = effective + timedelta(days=DOCS_TASK_DAYS)
        result.tasks.append(TaskSpec(
            "DOCS_CALL:docs", "Entregar a documentação solicitada na convocação",
            TaskPhase.SIGNING, due))
        result.effects.append(
            f"Tarefa criada: entregar a documentação até {fmt(due)} ({DOCS_TASK_DAYS} dias).")
    elif key is MilestoneKey.INSPECTION_CALL:
        due = effective + timedelta(days=INSPECTION_TASK_DAYS)
        assist = add_months(effective, ASSISTANCE_MONTHS)
        result.tasks.append(TaskSpec(
            "INSPECTION_CALL:inspect", "Realizar a vistoria e registrar pendências do imóvel",
            TaskPhase.KEY_DELIVERY, due))
        result.tasks.append(TaskSpec(
            "INSPECTION_CALL:assistance", "Fim do prazo de assistência: conferir pendências",
            TaskPhase.POST_DELIVERY, assist))
        result.effects.append(f"Tarefa criada: vistoria até {fmt(due)} ({INSPECTION_TASK_DAYS} dias).")
        result.effects.append(f"Tarefa criada: fim da assistência em {fmt(assist)} (+3 meses).")
        result.effects.append(f"Condomínio e IPTU passam a vencer a partir de {fmt(effective)}.")
    elif key is MilestoneKey.FINANCING_SIGNED:
        result.effects.append(
            f"Juros de obra iniciam em {fmt(effective)}; diferença do financiamento e "
            "registro do contrato passam a vencer nessa data.")
    elif key is MilestoneKey.CONTRACT_REGISTERED:
        due = effective + timedelta(days=MATRICULA_TASK_DAYS)
        result.tasks.append(TaskSpec(
            "CONTRACT_REGISTERED:matricula",
            "Apresentar matrícula atualizada à Prefeitura de Santo André",
            TaskPhase.SIGNING, due, MATRICULA_NOTES))
        result.effects.append(
            f"Tarefa criada: apresentar a matrícula atualizada à Prefeitura até {fmt(due)} "
            f"({MATRICULA_TASK_DAYS} dias); multa de R$ 290,69 se fora do prazo.")
    elif key is MilestoneKey.HABITE_SE:
        result.effects.append(
            "Parcelas em aberto após o habite-se passam para IGP-M + juros Price de 1% a.m.")
    elif key is MilestoneKey.KEY_DELIVERY:
        result.effects.append(
            f"Parcelas «na entrega» foram reancoradas para as chaves em {fmt(effective)}.")

    for name in anchored_obligations:
        result.effects.append(f"Parcelas não pagas de «{name}» recalculadas (âncora {fmt(effective)}).")
    return result
