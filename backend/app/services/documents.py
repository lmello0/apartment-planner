from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.api.schemas import DocumentCreateIn, DocumentIn
from app.clock import utcnow
from app.db.models import Document, Installment, Obligation, Task
from app.domain.types import (
    ALLOWED_DOCUMENT_MIMES,
    MAX_DOCUMENT_BYTES,
    DocumentExpiry,
    DocumentStatus,
    document_expiry,
)
from app.services.context import Invalid, NotFound, ensure_milestones
from app.storage import DOWNLOAD_TTL_SECONDS, SignedUpload, Storage

PENDING_TTL = timedelta(hours=24)


def get(session: Session, document_id: str, *, active_only: bool = True) -> Document:
    doc = session.get(Document, document_id)
    if doc is None or (active_only and doc.status != DocumentStatus.ACTIVE.value):
        raise NotFound(f"document {document_id}")
    return doc


def _check_link(session: Session, data: DocumentIn) -> None:
    if data.installment_id and session.get(Installment, data.installment_id) is None:
        raise NotFound(f"installment {data.installment_id}")
    if data.obligation_id and session.get(Obligation, data.obligation_id) is None:
        raise NotFound(f"obligation {data.obligation_id}")
    if data.task_id and session.get(Task, data.task_id) is None:
        raise NotFound(f"task {data.task_id}")
    if data.milestone_key:
        ensure_milestones(session)  # milestone rows are created lazily


def _apply(doc: Document, data: DocumentIn) -> None:
    doc.title, doc.category = data.title, data.category.value
    doc.document_date, doc.valid_until, doc.notes = data.document_date, data.valid_until, data.notes
    doc.installment_id, doc.obligation_id = data.installment_id, data.obligation_id
    doc.task_id = data.task_id
    doc.milestone_key = data.milestone_key.value if data.milestone_key else None


def cleanup_pending(session: Session, storage: Storage, now: datetime | None = None) -> int:
    """Delete PENDING documents (row + object) older than 24 h. Returns how many."""
    cutoff = (now or utcnow()) - PENDING_TTL
    stale = session.scalars(select(Document).where(
        Document.status == DocumentStatus.PENDING.value, Document.created_at < cutoff)).all()
    for doc in stale:
        storage.delete(doc.storage_key)
        session.delete(doc)
    session.flush()
    return len(stale)


def create(session: Session, storage: Storage, data: DocumentCreateIn) -> tuple[Document, SignedUpload]:
    cleanup_pending(session, storage)
    _check_link(session, data)
    key = str(uuid.uuid4())
    doc = Document(
        original_name=data.original_name, mime_type=data.mime_type, size_bytes=data.size_bytes,
        storage_key=key, status=DocumentStatus.PENDING.value)
    _apply(doc, data)
    session.add(doc)
    session.flush()
    return doc, storage.create_upload(key, data.mime_type)


def _reject(session: Session, storage: Storage, doc: Document, reason: str) -> None:
    storage.delete(doc.storage_key)
    session.delete(doc)
    session.commit()  # the rejection must persist even though the request fails with 422
    raise Invalid(reason)


def confirm(session: Session, storage: Storage, document_id: str) -> Document:
    doc = get(session, document_id, active_only=False)
    if doc.status == DocumentStatus.ACTIVE.value:
        return doc
    info = storage.head(doc.storage_key)
    if info is None:
        _reject(session, storage, doc, "file was not uploaded")
    assert info is not None
    mime = info.mime_type.split(";")[0].strip().lower()
    if info.size > MAX_DOCUMENT_BYTES:
        _reject(session, storage, doc, "file is larger than 20 MB")
    if mime not in ALLOWED_DOCUMENT_MIMES:
        _reject(session, storage, doc, f"file type not allowed: {mime}")
    doc.size_bytes, doc.mime_type = info.size, mime
    doc.status = DocumentStatus.ACTIVE.value
    session.flush()
    return doc


def update(session: Session, document_id: str, data: DocumentIn) -> Document:
    doc = get(session, document_id)
    _check_link(session, data)
    _apply(doc, data)
    session.flush()
    return doc


def delete(session: Session, storage: Storage, document_id: str) -> None:
    doc = get(session, document_id, active_only=False)
    storage.delete(doc.storage_key)
    session.delete(doc)
    session.flush()


def download_url(storage: Storage, doc: Document, now: datetime | None = None) -> tuple[str, datetime]:
    url = storage.create_download_url(doc.storage_key, DOWNLOAD_TTL_SECONDS)
    return url, (now or utcnow()) + timedelta(seconds=DOWNLOAD_TTL_SECONDS)


def list_documents(
    session: Session, *, category: str | None = None, q: str | None = None,
    installment_id: str | None = None, obligation_id: str | None = None,
    task_id: str | None = None, milestone_key: str | None = None,
) -> list[Document]:
    stmt = select(Document).where(Document.status == DocumentStatus.ACTIVE.value)
    if category:
        stmt = stmt.where(Document.category == category)
    if q:
        like = f"%{q.strip().lower()}%"
        stmt = stmt.where(or_(
            Document.title.ilike(like), Document.original_name.ilike(like),
            Document.notes.ilike(like)))
    for column, value in ((Document.installment_id, installment_id),
                          (Document.obligation_id, obligation_id),
                          (Document.task_id, task_id),
                          (Document.milestone_key, milestone_key)):
        if value:
            stmt = stmt.where(column == value)
    docs = list(session.scalars(stmt))
    docs.sort(key=lambda d: (d.created_at, d.id), reverse=True)
    return docs


def expiring(session: Session, today, due_soon_days: int) -> list[Document]:
    """ACTIVE documents that are EXPIRED or DUE_SOON, earliest validity first."""
    rows = session.scalars(select(Document).where(
        Document.status == DocumentStatus.ACTIVE.value, Document.valid_until.is_not(None)))
    out = [d for d in rows
           if document_expiry(d.valid_until, today, due_soon_days)
           in (DocumentExpiry.EXPIRED, DocumentExpiry.DUE_SOON)]
    out.sort(key=lambda d: (d.valid_until, d.title))
    return out
