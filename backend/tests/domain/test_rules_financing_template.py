from datetime import date
from decimal import Decimal as D

from app.domain.financing import FINANCING_REFERENCE, financing_difference
from app.domain.rules import evaluate
from app.domain.task_template import TEMPLATE
from app.domain.types import MILESTONE_LABELS, MilestoneKey, ObligationStatus, TaskPhase


def test_financing_contracted_280000_creates_difference_22000_40():
    assert financing_difference(ObligationStatus.CONTRACTED, D("280000.00")) == D("22000.40")


def test_financing_equal_or_greater_creates_none():
    assert financing_difference(ObligationStatus.CONTRACTED, FINANCING_REFERENCE) is None
    assert financing_difference(ObligationStatus.CONTRACTED, D("310000")) is None


def test_estimated_financing_creates_none():
    assert financing_difference(ObligationStatus.ESTIMATED, D("100")) is None


def test_inspection_call_creates_task_plus_7_days_and_assistance():
    r = evaluate(MilestoneKey.INSPECTION_CALL, date(2028, 1, 10), ["Condomínio + IPTU"])
    due = {t.rule_key: t.due_date for t in r.tasks}
    assert due["INSPECTION_CALL:inspect"] == date(2028, 1, 17)
    assert due["INSPECTION_CALL:assistance"] == date(2028, 4, 10)
    assert any("Condomínio" in e for e in r.effects)


def test_docs_call_creates_task_plus_10_days():
    r = evaluate(MilestoneKey.DOCS_CALL, date(2027, 3, 1), [])
    assert r.tasks[0].due_date == date(2027, 3, 11)


def test_cleared_milestone_has_no_tasks():
    r = evaluate(MilestoneKey.DOCS_CALL, None, [])
    assert r.tasks == [] and r.effects


def test_template_covers_every_phase_in_portuguese():
    assert {t.phase for t in TEMPLATE} == set(TaskPhase)
    assert all(t.title for t in TEMPLATE)


def test_contract_registered_creates_matricula_task_plus_30_days():
    r = evaluate(MilestoneKey.CONTRACT_REGISTERED, date(2026, 12, 10), [])
    assert len(r.tasks) == 1
    t = r.tasks[0]
    assert t.rule_key == "CONTRACT_REGISTERED:matricula"
    assert t.title == "Apresentar matrícula atualizada à Prefeitura de Santo André"
    assert t.phase is TaskPhase.SIGNING
    assert t.due_date == date(2027, 1, 9)
    assert t.notes is not None and "Decreto 18.564/2026, art. 32, I" in t.notes
    assert "R$ 290,69" in t.notes and "R$ 581,38" in t.notes
    assert any("09/01/2027" in e and "matrícula" in e for e in r.effects)


def test_contract_registered_cleared_has_no_tasks():
    r = evaluate(MilestoneKey.CONTRACT_REGISTERED, None, [])
    assert r.tasks == [] and r.effects


def test_contract_registered_sits_between_financing_signed_and_docs_call():
    order = list(MilestoneKey)
    assert order.index(MilestoneKey.CONTRACT_REGISTERED) == order.index(
        MilestoneKey.FINANCING_SIGNED) + 1
    assert order.index(MilestoneKey.DOCS_CALL) == order.index(MilestoneKey.CONTRACT_REGISTERED) + 1
    assert MILESTONE_LABELS[MilestoneKey.CONTRACT_REGISTERED] == "Registro do contrato no cartório"
