from datetime import timedelta

import httpx
import pytest
from sqlalchemy.exc import IntegrityError

from app.clock import utcnow
from app.config import Config, get_config
from app.db.models import Document
from app.main import create_app
from app.storage import LocalStorage, SupabaseStorage

PDF = b"%PDF-1.4 fake"


def new_doc(client, **over):
    body = {"title": "Contrato", "category": "CONTRACT", "originalName": "c.pdf",
            "mimeType": "application/pdf", "sizeBytes": len(PDF), **over}
    r = client.post("/api/documents", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def upload(client, created, data=PDF, mime="application/pdf"):
    up = created["upload"]
    assert up["method"] == "PUT"
    url = up["url"].replace("http://testserver", "")
    r = client.put(url, content=data, headers={"Content-Type": mime})
    assert r.status_code == 200, r.text


def make(client, **over):
    created = new_doc(client, **over)
    upload(client, created)
    r = client.post(f"/api/documents/{created['document']['id']}/confirm")
    assert r.status_code == 200, r.text
    return r.json()


def test_create_upload_confirm_list_download(client, storage):
    created = new_doc(client)
    doc_id = created["document"]["id"]
    assert created["document"]["link"] is None and created["document"]["expiry"] is None
    assert client.get("/api/documents").json() == []  # pending is hidden
    assert client.get(f"/api/documents/{doc_id}/download-url").status_code == 404

    upload(client, created)
    done = client.post(f"/api/documents/{doc_id}/confirm").json()
    assert done["id"] == doc_id and done["sizeBytes"] == len(PDF)
    assert [d["id"] for d in client.get("/api/documents").json()] == [doc_id]

    dl = client.get(f"/api/documents/{doc_id}/download-url").json()
    assert dl["expiresAt"]
    r = client.get(dl["url"].replace("http://testserver", ""))
    assert r.content == PDF and r.headers["content-type"] == "application/pdf"

    # the object is named by UUID, never by the original name
    assert all("c.pdf" not in p.name for p in storage.dir.iterdir())

    assert client.delete(f"/api/documents/{doc_id}").status_code == 204
    assert client.get("/api/documents").json() == []
    assert list(storage.dir.iterdir()) == []


def test_confirm_missing_object_is_422_and_removes_row(client, session_factory):
    created = new_doc(client)
    r = client.post(f"/api/documents/{created['document']['id']}/confirm")
    assert r.status_code == 422
    with session_factory() as s:
        assert s.query(Document).count() == 0


def test_confirm_too_large_is_422_and_removes_object(client, storage, session_factory, monkeypatch):
    monkeypatch.setattr("app.services.documents.MAX_DOCUMENT_BYTES", 5)
    created = new_doc(client)
    upload(client, created)
    r = client.post(f"/api/documents/{created['document']['id']}/confirm")
    assert r.status_code == 422 and "20 MB" in r.json()["detail"]
    assert list(storage.dir.iterdir()) == []
    with session_factory() as s:
        assert s.query(Document).count() == 0


def test_confirm_invalid_mime_is_422(client, storage):
    created = new_doc(client)
    upload(client, created, data=b"MZ", mime="application/x-msdownload")
    r = client.post(f"/api/documents/{created['document']['id']}/confirm")
    assert r.status_code == 422 and "not allowed" in r.json()["detail"]
    assert list(storage.dir.iterdir()) == []


def test_create_rejects_bad_mime_size_and_double_link(client, seeded):
    assert client.post("/api/documents", json={
        "title": "x", "category": "OTHER", "originalName": "x.exe",
        "mimeType": "application/x-msdownload", "sizeBytes": 10}).status_code == 422
    assert client.post("/api/documents", json={
        "title": "x", "category": "OTHER", "originalName": "x.pdf",
        "mimeType": "application/pdf", "sizeBytes": 21 * 1024 * 1024}).status_code == 422
    ob = seeded.get("/api/obligations").json()[0]
    task = seeded.get("/api/tasks").json()[0]
    r = client.post("/api/documents", json={
        "title": "x", "category": "OTHER", "originalName": "x.pdf", "mimeType": "application/pdf",
        "sizeBytes": 10, "obligationId": ob["id"], "taskId": task["id"]})
    assert r.status_code == 422


def test_check_constraint_rejects_two_links_at_db_level(seeded, session_factory):
    ob = seeded.get("/api/obligations").json()[0]
    task = seeded.get("/api/tasks").json()[0]
    with session_factory() as s:
        s.add(Document(title="t", category="OTHER", original_name="a.pdf",
                       mime_type="application/pdf", size_bytes=1, obligation_id=ob["id"],
                       task_id=task["id"]))
        with pytest.raises(IntegrityError):
            s.commit()


def test_link_unknown_target_is_404(client):
    r = client.post("/api/documents", json={
        "title": "x", "category": "OTHER", "originalName": "x.pdf", "mimeType": "application/pdf",
        "sizeBytes": 10, "taskId": "nope"})
    assert r.status_code == 404


def test_links_labels_and_filters(seeded):
    ob = next(o for o in seeded.get("/api/obligations").json() if o["name"] == "Corretagem")
    task = seeded.get("/api/tasks").json()[0]
    inst = seeded.get("/api/installments", params={"obligationId": ob["id"]}).json()[0]
    a = make(seeded, title="Recibo ITBI", category="PAYMENT_RECEIPT", installmentId=inst["id"])
    b = make(seeded, title="Matrícula", obligationId=ob["id"])
    c = make(seeded, title="Anotação", taskId=task["id"])
    d = make(seeded, title="Habite-se", category="PROJECT_SPEC", milestoneKey="HABITE_SE")
    assert a["link"] == {"type": "INSTALLMENT", "id": inst["id"],
                         "label": f"{inst['obligationName']} {inst['seq']}/{inst['count']}"}
    assert b["link"]["type"] == "OBLIGATION" and b["link"]["label"] == ob["name"]
    assert c["link"]["type"] == "TASK" and c["link"]["label"] == task["title"]
    assert d["link"] == {"type": "MILESTONE", "id": "HABITE_SE", "label": "Habite-se"}

    ids = lambda **p: {x["id"] for x in seeded.get("/api/documents", params=p).json()}  # noqa: E731
    assert ids(installmentId=inst["id"]) == {a["id"]}
    assert ids(obligationId=ob["id"]) == {b["id"]}
    assert ids(taskId=task["id"]) == {c["id"]}
    assert ids(milestoneKey="HABITE_SE") == {d["id"]}
    assert ids(category="PROJECT_SPEC") == {d["id"]}
    assert ids(q="matr") == {b["id"]}
    assert len(ids()) == 4

    upd = seeded.put(f"/api/documents/{a['id']}", json={
        "title": "Recibo", "category": "PAYMENT_RECEIPT", "obligationId": ob["id"]}).json()
    assert upd["title"] == "Recibo" and upd["link"]["type"] == "OBLIGATION"


def test_document_count_on_installments(seeded):
    inst = seeded.get("/api/installments").json()[0]
    assert inst["documentCount"] == 0
    make(seeded, installmentId=inst["id"])
    new_doc(seeded, installmentId=inst["id"])  # pending does not count
    got = seeded.get("/api/installments", params={"obligationId": inst["obligationId"]}).json()
    assert next(i for i in got if i["id"] == inst["id"])["documentCount"] == 1
    detail = seeded.get(f"/api/obligations/{inst['obligationId']}").json()
    assert next(i for i in detail["installments"] if i["id"] == inst["id"])["documentCount"] == 1


def test_expiry_and_dashboard_expiring_documents(seeded):
    # TODAY = 2026-11-11, dueSoonDays = 7 in the example seed
    expired = make(seeded, title="CND vencida", validUntil="2026-11-10")
    soon = make(seeded, title="Certidão", validUntil="2026-11-18")
    valid = make(seeded, title="Procuração", validUntil="2026-11-19")
    none = make(seeded, title="Sem validade")
    assert [d["expiry"] for d in (expired, soon, valid, none)] == [
        "EXPIRED", "DUE_SOON", "VALID", None]
    dash = seeded.get("/api/dashboard").json()
    assert [d["id"] for d in dash["expiringDocuments"]] == [expired["id"], soon["id"]]
    assert dash["expiringDocuments"][0]["expiry"] == "EXPIRED"


def test_links_become_null_not_deleted(seeded):
    ob = next(o for o in seeded.get("/api/obligations").json() if o["name"] == "Corretagem")
    inst = seeded.get("/api/installments", params={"obligationId": ob["id"]}).json()
    unpaid = next(i for i in inst if i["status"] != "PAID")
    task = seeded.post("/api/tasks", json={"title": "Levar docs", "phase": "SIGNING"}).json()
    by_inst = make(seeded, installmentId=unpaid["id"])
    by_task = make(seeded, taskId=task["id"])
    by_ob = make(seeded, obligationId=ob["id"])

    # undoing a payment keeps the document and its installment link
    paid = seeded.post(f"/api/installments/{unpaid['id']}/payment", json={
        "paidOn": "2026-11-11", "amount": "100.00", "method": "PIX"}).json()
    assert paid["documentCount"] == 1 and "receiptPath" not in paid["payment"]
    seeded.delete(f"/api/installments/{unpaid['id']}/payment")
    docs = {d["id"]: d for d in seeded.get("/api/documents").json()}
    assert docs[by_inst["id"]]["link"]["id"] == unpaid["id"]

    seeded.delete(f"/api/tasks/{task['id']}")
    docs = {d["id"]: d for d in seeded.get("/api/documents").json()}
    assert docs[by_task["id"]]["link"] is None

    seeded.delete(f"/api/obligations/{ob['id']}")  # cascades to its installments
    docs = {d["id"]: d for d in seeded.get("/api/documents").json()}
    assert set(docs) == {by_inst["id"], by_task["id"], by_ob["id"]}
    assert all(d["link"] is None for d in docs.values())


def test_pending_older_than_24h_is_cleaned_on_create(client, storage, session_factory):
    old = new_doc(client)
    upload(client, old)
    fresh = new_doc(client)
    with session_factory() as s:
        row = s.get(Document, old["document"]["id"])
        row.created_at = utcnow() - timedelta(hours=25)
        s.commit()
    new_doc(client)  # triggers the lazy cleanup
    with session_factory() as s:
        ids = {d.id for d in s.query(Document)}
    assert old["document"]["id"] not in ids and fresh["document"]["id"] in ids
    assert list(storage.dir.iterdir()) == []  # the old upload's object was deleted too


def test_cleanup_pending_service(session_factory, storage):
    from app.services import documents

    with session_factory() as s:
        s.add(Document(title="t", category="OTHER", original_name="a.pdf",
                       mime_type="application/pdf", size_bytes=1,
                       created_at=utcnow() - timedelta(hours=30)))
        s.add(Document(title="t2", category="OTHER", original_name="b.pdf",
                       mime_type="application/pdf", size_bytes=1))
        s.commit()
        assert documents.cleanup_pending(s, storage) == 1
        s.commit()
        assert s.query(Document).count() == 1


def test_receipt_path_is_gone(seeded):
    inst = seeded.get("/api/installments", params={"status": "DUE_SOON"}).json()[0]
    r = seeded.post(f"/api/installments/{inst['id']}/payment", json={
        "paidOn": "2026-11-11", "amount": "100.00", "method": "PIX", "receiptPath": "x"})
    assert r.status_code == 200 and "receiptPath" not in r.json()["payment"]


def test_dev_storage_rejects_bad_tokens(client):
    assert client.put("/api/dev-storage/u.not-a-uuid.9999999999", content=b"x").status_code == 403
    assert client.get("/api/dev-storage/d.not-a-uuid.9999999999").status_code == 404


# ---- configuration and adapters -----------------------------------------------------------


def test_dev_storage_routes_absent_in_production(monkeypatch):
    for k, v in {"ENV": "production", "AUTH_DISABLED": "false", "STORAGE_BACKEND": "supabase",
                 "SUPABASE_URL": "https://x.supabase.co",
                 "SUPABASE_SERVICE_ROLE_KEY": "k"}.items():
        monkeypatch.setenv(k, v)
    get_config.cache_clear()
    try:
        paths = set(create_app().openapi()["paths"])
    finally:
        get_config.cache_clear()
    assert not any("dev-storage" in p for p in paths)
    assert "/api/documents" in paths


def test_dev_storage_routes_present_outside_production():
    assert any("dev-storage" in p for p in create_app().openapi()["paths"])


def test_production_requires_supabase_storage():
    base = {"env": "production", "auth_disabled": False, "supabase_url": "https://x.supabase.co",
            "supabase_service_role_key": "k"}
    with pytest.raises(ValueError):
        Config(**base, storage_backend="local")
    with pytest.raises(ValueError):
        Config(env="production", auth_disabled=False, storage_backend="supabase",
               supabase_url="https://x")
    assert Config(**base, storage_backend="supabase").storage_backend == "supabase"
    with pytest.raises(ValueError):
        Config(storage_backend="s3")


def test_local_storage_token_expiry_and_traversal(tmp_path):
    st = LocalStorage(tmp_path)
    key = "5f0e6a3c-0a53-4b44-9a05-1f3d1b8a2c11"
    assert LocalStorage.parse_token(f"u.{key}.1", "u") is None  # expired
    assert LocalStorage.parse_token(f"d.{key}.99999999999", "u") is None  # wrong op
    with pytest.raises(ValueError):
        st.head("../etc/passwd")


def test_supabase_storage_requests():
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        p = req.url.path
        if p.startswith("/storage/v1/object/upload/sign/documents/"):
            return httpx.Response(200, json={"url": "/object/upload/sign/documents/k?token=T"})
        if p.startswith("/storage/v1/object/sign/documents/"):
            return httpx.Response(200, json={"signedURL": "/object/sign/documents/k?token=D"})
        if p.startswith("/storage/v1/object/info/documents/gone"):
            return httpx.Response(404, json={})
        if p.startswith("/storage/v1/object/info/documents/"):
            return httpx.Response(200, json={"size": 12, "content_type": "application/pdf"})
        if req.method == "DELETE":
            return httpx.Response(200, json=[])
        return httpx.Response(500)

    st = SupabaseStorage("https://x.supabase.co/", "sb_secret_abc", "documents",
                         client=httpx.Client(transport=httpx.MockTransport(handler)))
    up = st.create_upload("k", "application/pdf")
    assert up.url == "https://x.supabase.co/storage/v1/object/upload/sign/documents/k?token=T"
    assert up.method == "PUT" and up.headers["Content-Type"] == "application/pdf"
    assert st.create_download_url("k") == (
        "https://x.supabase.co/storage/v1/object/sign/documents/k?token=D")
    assert st.head("k").size == 12 and st.head("gone") is None
    st.delete("k")
    assert seen[0].headers["apikey"] == "sb_secret_abc" and "authorization" not in seen[0].headers
    assert seen[-1].method == "DELETE" and b'"prefixes"' in seen[-1].content


def test_import_docs_cli_dry_run_and_apply(seeded, session_factory, storage, tmp_path, capsys):
    import json

    from app.cli import docs as docs_cli

    src = tmp_path / "docs"
    (src / "sub").mkdir(parents=True)
    (src / "a.pdf").write_bytes(PDF)
    (src / "sub" / "b.jpg").write_bytes(b"\xff\xd8jpeg")
    (src / "c.exe").write_bytes(b"MZ")
    (src / "unmapped.pdf").write_bytes(PDF)
    mapping = {"files": {
        "a.pdf": {"title": "A", "category": "CONTRACT", "obligationName": "Corretagem"},
        "sub/b.jpg": {"title": "B", "category": "PERSONAL_ID"},
        "c.exe": {"title": "C", "category": "OTHER"}}}
    map_file = tmp_path / "map.json"
    map_file.write_text(json.dumps(mapping))

    plans = docs_cli.build_plan(src, docs_cli.load_map(map_file))
    assert [p.rel for p in plans] == ["a.pdf", "c.exe", "sub/b.jpg", "unmapped.pdf"]
    assert [bool(p.problem) for p in plans] == [False, True, False, True]
    assert "CONTRACT (Contrato)" in docs_cli.describe(plans[0])
    assert "NOT IN MAP" in docs_cli.describe(plans[3])

    with session_factory() as s:
        assert docs_cli.apply_plan(s, storage, plans) == {"imported": 2, "skipped": 2}
        assert docs_cli.apply_plan(s, storage, plans) == {"imported": 0, "skipped": 4}  # idempotent
    docs = seeded.get("/api/documents").json()
    assert {d["title"] for d in docs} == {"A", "B"}
    assert next(d for d in docs if d["title"] == "A")["link"]["label"] == "Corretagem"
