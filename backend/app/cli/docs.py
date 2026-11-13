"""`import-docs` / `cleanup-docs`: bulk-load local files into the document store."""

from __future__ import annotations

import json
import mimetypes
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.schemas import DocumentCreateIn
from app.db.models import Document, Obligation
from app.domain.types import (
    ALLOWED_DOCUMENT_MIMES,
    DOCUMENT_CATEGORY_LABELS,
    MAX_DOCUMENT_BYTES,
    DocumentCategory,
)
from app.services import documents
from app.storage import Storage

EXTRA_MIMES = {".heic": "image/heic", ".heif": "image/heif", ".webp": "image/webp"}

# Map file shape (keys are paths relative to the directory, with "/" separators):
#   { "files": { "sub/name.pdf": { "title": "...", "category": "CONTRACT",
#       "documentDate"?: "YYYY-MM-DD", "validUntil"?: "YYYY-MM-DD", "notes"?: "...",
#       "obligationName"?: "...", "milestoneKey"?: "HABITE_SE" } } }


@dataclass
class Plan:
    rel: str
    path: Path
    entry: dict | None
    mime: str | None
    size: int
    problem: str | None = None


def guess_mime(path: Path) -> str | None:
    ext = path.suffix.lower()
    return EXTRA_MIMES.get(ext) or mimetypes.guess_type(path.name)[0]


def build_plan(directory: Path, mapping: dict) -> list[Plan]:
    files = mapping.get("files", {})
    plans: list[Plan] = []
    for path in sorted(p for p in directory.rglob("*") if p.is_file() and not p.name.startswith(".")):
        rel = path.relative_to(directory).as_posix()
        entry = files.get(rel)
        mime, size = guess_mime(path), path.stat().st_size
        problem = None
        if entry is None:
            problem = "not in map"
        elif mime not in ALLOWED_DOCUMENT_MIMES:
            problem = f"type not allowed ({mime})"
        elif size > MAX_DOCUMENT_BYTES:
            problem = "larger than 20 MB"
        plans.append(Plan(rel, path, entry, mime, size, problem))
    return plans


def describe(plan: Plan) -> str:
    if plan.entry is None:
        return f"{plan.rel}\n    -> ?? NOT IN MAP"
    label = DOCUMENT_CATEGORY_LABELS[DocumentCategory(plan.entry["category"])]
    extra = f"  [SKIP: {plan.problem}]" if plan.problem else ""
    return (f"{plan.rel}\n    -> {plan.entry['category']} ({label}) · "
            f"{plan.entry.get('title', plan.path.stem)}{extra}")


def apply_plan(session: Session, storage: Storage, plans: list[Plan]) -> dict[str, int]:
    done = skipped = 0
    for plan in plans:
        if plan.problem or plan.entry is None or plan.mime is None:
            print(f"skip {plan.rel}: {plan.problem}")
            skipped += 1
            continue
        if session.scalar(select(Document.id).where(
                Document.original_name == plan.path.name, Document.status == "ACTIVE")):
            print(f"skip {plan.rel}: already imported")
            skipped += 1
            continue
        e = plan.entry
        obligation_id = None
        if e.get("obligationName"):
            ob = session.scalar(select(Obligation).where(Obligation.name == e["obligationName"]))
            if ob is None:
                print(f"skip {plan.rel}: unknown obligation {e['obligationName']!r}")
                skipped += 1
                continue
            obligation_id = ob.id
        data = DocumentCreateIn.model_validate({
            "title": e.get("title", plan.path.stem), "category": e["category"],
            "documentDate": e.get("documentDate"), "validUntil": e.get("validUntil"),
            "notes": e.get("notes"), "obligationId": obligation_id,
            "milestoneKey": e.get("milestoneKey"), "originalName": plan.path.name,
            "mimeType": plan.mime, "sizeBytes": plan.size})
        doc, _ = documents.create(session, storage, data)
        storage.upload(doc.storage_key, plan.path.read_bytes(), plan.mime)
        documents.confirm(session, storage, doc.id)
        session.commit()
        print(f"ok   {plan.rel}")
        done += 1
    return {"imported": done, "skipped": skipped}


def load_map(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))
