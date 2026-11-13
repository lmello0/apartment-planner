from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import TaskIn
from app.clock import today
from app.db.models import Task
from app.domain.types import TaskSource
from app.services.context import NotFound


def get(session: Session, task_id: str) -> Task:
    task = session.get(Task, task_id)
    if task is None:
        raise NotFound(f"task {task_id}")
    return task


def list_tasks(session: Session, phase: str | None, open_only: bool | None) -> list[Task]:
    stmt = select(Task)
    if phase:
        stmt = stmt.where(Task.phase == phase)
    if open_only is True:
        stmt = stmt.where(Task.done_at.is_(None))
    elif open_only is False:
        stmt = stmt.where(Task.done_at.is_not(None))
    tasks = list(session.scalars(stmt))
    tasks.sort(key=lambda t: (t.due_date is None, t.due_date or today(), t.title))
    return tasks


def _apply(task: Task, data: TaskIn) -> None:
    task.title, task.phase = data.title, data.phase.value
    task.due_date, task.done_at, task.notes = data.due_date, data.done_at, data.notes
    task.obligation_id, task.installment_id = data.obligation_id, data.installment_id


def create(session: Session, data: TaskIn) -> Task:
    task = Task(source=TaskSource.MANUAL.value)
    _apply(task, data)
    session.add(task)
    session.flush()
    return task


def update(session: Session, task_id: str, data: TaskIn) -> Task:
    task = get(session, task_id)
    _apply(task, data)
    session.flush()
    return task


def delete(session: Session, task_id: str) -> None:
    session.delete(get(session, task_id))
    session.flush()


def toggle(session: Session, task_id: str) -> Task:
    task = get(session, task_id)
    task.done_at = None if task.done_at else today()
    session.flush()
    return task
