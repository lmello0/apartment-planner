from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.api import mappers as m
from app.api import schemas as s
from app.api.deps import require_owner
from app.db.session import get_session
from app.domain import dashboard as dash
from app.domain.types import InstallmentStatus, MilestoneKey
from app.services import documents, milestones, obligations, payments, tasks
from app.services import settings_service as settings_svc
from app.services.context import all_views, load_ctx
from app.services.context import get_settings as get_settings_row
from app.storage import LocalStorage, Storage, get_storage

public = APIRouter(prefix="/api")
dev_storage = APIRouter(prefix="/api/dev-storage")  # registered only when ENV != production
router = APIRouter(prefix="/api", dependencies=[Depends(require_owner)])


@public.get("/health")
def health() -> dict[str, bool]:
    return {"ok": True}



# ---- dashboard ---------------------------------------------------------------------------


@router.get("/dashboard", response_model=s.DashboardDto, response_model_by_alias=True)
def get_dashboard(session: Session = Depends(get_session)):
    ctx = load_ctx(session)
    pairs = all_views(session, ctx)
    by_id = {i.id: i for i, _ in pairs}
    data = dash.build([v for _, v in pairs], ctx.today, ctx.settings.monthly_capacity,
                      ctx.milestones.get(MilestoneKey.KEY_DELIVERY))
    next_ = dash.next_tasks(tasks.list_tasks(session, None, True))
    expiring = [m.document_dto(session, d, ctx) for d in documents.expiring(
        session, ctx.today, ctx.settings.due_soon_days)]
    session.commit()
    return m.dashboard_dto(data, ctx, by_id, next_, expiring)


# ---- installments ------------------------------------------------------------------------


def _one(session: Session, inst) -> s.InstallmentDto:
    ctx = load_ctx(session)
    count = len(inst.obligation.installments)
    return m.installment_dto(inst, ctx.view(inst, count), ctx)


@router.get("/installments", response_model=list[s.InstallmentDto])
def list_installments(
    status: InstallmentStatus | None = None,
    obligation_id: str | None = Query(default=None, alias="obligationId"),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = None,
    session: Session = Depends(get_session),
):
    ctx = load_ctx(session)
    out = []
    for inst, view in all_views(session, ctx):
        if obligation_id and view.obligation_id != obligation_id:
            continue
        if from_ and view.due_date < from_:
            continue
        if to and view.due_date > to:
            continue
        dto = m.installment_dto(inst, view, ctx)
        if status and dto.status != status:
            continue
        out.append(dto)
    out.sort(key=lambda d: (d.due_date, d.obligation_name, d.seq))
    session.commit()
    return out


@router.post("/installments/{installment_id}/payment", response_model=s.InstallmentDto)
def register_payment(installment_id: str, body: s.PaymentIn, session: Session = Depends(get_session)):
    inst = payments.register(session, installment_id, body)
    dto = _one(session, inst)
    session.commit()
    return dto


@router.delete("/installments/{installment_id}/payment", response_model=s.InstallmentDto)
def undo_payment(installment_id: str, session: Session = Depends(get_session)):
    inst = payments.undo(session, installment_id)
    dto = _one(session, inst)
    session.commit()
    return dto


# ---- obligations -------------------------------------------------------------------------


@router.get("/obligations", response_model=list[s.ObligationDto])
def list_obligations(session: Session = Depends(get_session)):
    ctx = load_ctx(session)
    out = [m.obligation_dto(o, ctx) for o in obligations.list_all(session)]
    session.commit()
    return out


@router.get("/obligations/{obligation_id}", response_model=s.ObligationDetailDto)
def get_obligation(obligation_id: str, session: Session = Depends(get_session)):
    ctx = load_ctx(session)
    out = m.obligation_detail(obligations.get(session, obligation_id), ctx)
    session.commit()
    return out


@router.post("/obligations", response_model=s.ObligationDetailDto, status_code=201)
def create_obligation(body: s.ObligationIn, session: Session = Depends(get_session)):
    ob = obligations.create(session, body)
    out = m.obligation_detail(ob, load_ctx(session))
    session.commit()
    return out


@router.put("/obligations/{obligation_id}", response_model=s.ObligationDetailDto)
def update_obligation(obligation_id: str, body: s.ObligationIn,
                      session: Session = Depends(get_session)):
    ob = obligations.update_obligation(session, obligation_id, body)
    out = m.obligation_detail(ob, load_ctx(session))
    session.commit()
    return out


@router.delete("/obligations/{obligation_id}", status_code=204)
def delete_obligation(obligation_id: str, session: Session = Depends(get_session)):
    obligations.delete(session, obligation_id)
    session.commit()
    return Response(status_code=204)


# ---- milestones --------------------------------------------------------------------------


@router.get("/milestones", response_model=list[s.MilestoneDto])
def list_milestones(session: Session = Depends(get_session)):
    out = [m.milestone_dto(x) for x in milestones.list_all(session)]
    session.commit()
    return out


@router.put("/milestones/{key}", response_model=s.MilestoneUpdateResult)
def update_milestone(key: MilestoneKey, body: s.MilestoneIn,
                     session: Session = Depends(get_session)):
    row, effects = milestones.set_dates(session, key, body.expected_date, body.actual_date)
    out = s.MilestoneUpdateResult(milestone=m.milestone_dto(row), effects=effects)
    session.commit()
    return out


# ---- tasks -------------------------------------------------------------------------------


@router.get("/tasks", response_model=list[s.TaskDto])
def list_tasks(phase: str | None = None, open: bool | None = None,
               session: Session = Depends(get_session)):
    return [m.task_dto(t) for t in tasks.list_tasks(session, phase, open)]


@router.post("/tasks", response_model=s.TaskDto, status_code=201)
def create_task(body: s.TaskIn, session: Session = Depends(get_session)):
    out = m.task_dto(tasks.create(session, body))
    session.commit()
    return out


@router.put("/tasks/{task_id}", response_model=s.TaskDto)
def update_task(task_id: str, body: s.TaskIn, session: Session = Depends(get_session)):
    out = m.task_dto(tasks.update(session, task_id, body))
    session.commit()
    return out


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: str, session: Session = Depends(get_session)):
    tasks.delete(session, task_id)
    session.commit()
    return Response(status_code=204)


@router.post("/tasks/{task_id}/toggle", response_model=s.TaskDto)
def toggle_task(task_id: str, session: Session = Depends(get_session)):
    out = m.task_dto(tasks.toggle(session, task_id))
    session.commit()
    return out


# ---- documents ---------------------------------------------------------------------------


@router.get("/documents", response_model=list[s.DocumentDto])
def list_documents(
    category: s.DocumentCategory | None = None,
    q: str | None = None,
    installment_id: str | None = Query(default=None, alias="installmentId"),
    obligation_id: str | None = Query(default=None, alias="obligationId"),
    task_id: str | None = Query(default=None, alias="taskId"),
    milestone_key: MilestoneKey | None = Query(default=None, alias="milestoneKey"),
    session: Session = Depends(get_session),
):
    ctx = load_ctx(session)
    rows = documents.list_documents(
        session, category=category.value if category else None, q=q,
        installment_id=installment_id, obligation_id=obligation_id, task_id=task_id,
        milestone_key=milestone_key.value if milestone_key else None)
    out = [m.document_dto(session, d, ctx) for d in rows]
    session.commit()
    return out


@router.post("/documents", response_model=s.DocumentCreated, status_code=201)
def create_document(body: s.DocumentCreateIn, session: Session = Depends(get_session),
                    storage: Storage = Depends(get_storage)):
    doc, upload = documents.create(session, storage, body)
    out = s.DocumentCreated(
        document=m.document_dto(session, doc, load_ctx(session)),
        upload=s.UploadInfo(url=upload.url, method=upload.method, headers=upload.headers))
    session.commit()
    return out


@router.post("/documents/{document_id}/confirm", response_model=s.DocumentDto)
def confirm_document(document_id: str, session: Session = Depends(get_session),
                     storage: Storage = Depends(get_storage)):
    doc = documents.confirm(session, storage, document_id)
    out = m.document_dto(session, doc, load_ctx(session))
    session.commit()
    return out


@router.put("/documents/{document_id}", response_model=s.DocumentDto)
def update_document(document_id: str, body: s.DocumentIn, session: Session = Depends(get_session)):
    doc = documents.update(session, document_id, body)
    out = m.document_dto(session, doc, load_ctx(session))
    session.commit()
    return out


@router.delete("/documents/{document_id}", status_code=204)
def delete_document(document_id: str, session: Session = Depends(get_session),
                    storage: Storage = Depends(get_storage)):
    documents.delete(session, storage, document_id)
    session.commit()
    return Response(status_code=204)


@router.get("/documents/{document_id}/download-url", response_model=s.DownloadUrlDto)
def document_download_url(document_id: str, session: Session = Depends(get_session),
                          storage: Storage = Depends(get_storage)):
    url, expires_at = documents.download_url(storage, documents.get(session, document_id))
    return s.DownloadUrlDto(url=url, expires_at=expires_at)


# ---- dev storage (local disk; the router is not registered in production) ----------------


def _local(storage: Storage) -> LocalStorage:
    if not isinstance(storage, LocalStorage):
        raise HTTPException(404, "local storage is not enabled")
    return storage


@dev_storage.put("/{token}", status_code=200)
async def dev_upload(token: str, request: Request, storage: Storage = Depends(get_storage)):
    local = _local(storage)
    key = LocalStorage.parse_token(token, "u")
    if key is None:
        raise HTTPException(403, "invalid or expired token")
    mime = request.headers.get("content-type", "application/octet-stream")
    local.upload(key, await request.body(), mime.split(";")[0].strip().lower())
    return {"ok": True}


@dev_storage.get("/{token}")
def dev_download(token: str, storage: Storage = Depends(get_storage)):
    local = _local(storage)
    key = LocalStorage.parse_token(token, "d")
    info = local.head(key) if key else None
    if key is None or info is None:
        raise HTTPException(404, "not found")
    return Response(content=local.read(key), media_type=info.mime_type)


# ---- settings ----------------------------------------------------------------------------


@router.get("/settings", response_model=s.SettingsDto)
def get_settings(session: Session = Depends(get_session)):
    out = m.settings_dto(get_settings_row(session))
    session.commit()
    return out


@router.put("/settings", response_model=s.SettingsDto)
def put_settings(body: s.SettingsIn, session: Session = Depends(get_session)):
    out = m.settings_dto(settings_svc.update(session, body))
    session.commit()
    return out


__all__ = ["dev_storage", "public", "router"]
