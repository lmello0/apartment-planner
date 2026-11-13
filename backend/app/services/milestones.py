from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Milestone, Task
from app.domain import rules
from app.domain.types import MilestoneKey, TaskSource
from app.services import obligations
from app.services.context import ensure_milestones


def list_all(session: Session) -> list[Milestone]:
    rows = ensure_milestones(session)
    return [rows[k.value] for k in MilestoneKey]


def set_dates(
    session: Session, key: MilestoneKey, expected: date | None, actual: date | None
) -> tuple[Milestone, list[str]]:
    row = ensure_milestones(session)[key.value]
    row.expected_date, row.actual_date = expected, actual
    session.flush()

    names = obligations.regenerate_anchored(session, key)
    effective = actual or expected
    result = rules.evaluate(key, effective, names)

    # Upsert the RULE tasks of this milestone by rule_key: open ones are updated in place
    # (never duplicated), done ones are history and stay, obsolete open ones are removed.
    existing = {t.rule_key: t for t in session.scalars(select(Task).where(
        Task.source == TaskSource.RULE.value, Task.rule_key.like(f"{key.value}:%")))}
    wanted = {spec.rule_key for spec in result.tasks}
    for rule_key, task in existing.items():
        if rule_key not in wanted and task.done_at is None:
            session.delete(task)
    for spec in result.tasks:
        task = existing.get(spec.rule_key)
        if task is None:
            session.add(Task(title=spec.title, phase=spec.phase.value, due_date=spec.due_date,
                             notes=spec.notes, source=TaskSource.RULE.value,
                             rule_key=spec.rule_key))
        elif task.done_at is None:
            task.title, task.phase = spec.title, spec.phase.value
            task.due_date, task.notes = spec.due_date, spec.notes
    session.flush()
    return row, result.effects
