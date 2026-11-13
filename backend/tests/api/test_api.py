from decimal import Decimal as D


def by_name(client, name):
    return next(o for o in client.get("/api/obligations").json() if o["name"] == name)


def detail(client, name):
    return client.get(f"/api/obligations/{by_name(client, name)['id']}").json()


def test_health_needs_no_auth(client):
    assert client.get("/api/health").json() == {"ok": True}


def test_dashboard_from_example_seed(seeded):
    d = seeded.get("/api/dashboard").json()
    # example: ITBI 1000.00 due this month too; 3 brokerage installments (100 x3) + 10.00 + 20.00 paid
    assert d["totals"]["paid"] == "330.00"
    first = d["upcoming"][0]
    assert first["obligationName"] == "Corretagem"
    assert (first["seq"], first["count"], first["dueDate"]) == (4, 6, "2026-11-15")
    assert first["expectedAmount"] == "100.00" and first["status"] == "DUE_SOON"
    assert d["capacity"] == {"monthlyCapacity": "0.00", "currentMonthCommitment": "1100.00",
                             "exceeded": False}
    assert len(d["nextTasks"]) == 5
    assert d["monthly"][0]["month"] == "2026-08"
    assert d["monthly"][-1]["month"] == "2028-02"  # KEY_DELIVERY month


def test_pay_and_undo_reflects_on_dashboard(seeded):
    inst = seeded.get("/api/installments", params={"status": "DUE_SOON"}).json()[0]
    paid = seeded.post(f"/api/installments/{inst['id']}/payment",
                       json={"paidOn": "2026-11-11", "amount": "100.00", "method": "PIX"}).json()
    assert paid["status"] == "PAID" and paid["payment"]["method"] == "PIX"
    assert seeded.get("/api/dashboard").json()["totals"]["paid"] == "430.00"
    again = seeded.post(f"/api/installments/{inst['id']}/payment",
                        json={"paidOn": "2026-11-11", "amount": "100.00", "method": "PIX"})
    assert again.status_code == 409
    undone = seeded.delete(f"/api/installments/{inst['id']}/payment").json()
    assert undone["status"] == "DUE_SOON" and undone["payment"] is None
    assert seeded.get("/api/dashboard").json()["totals"]["paid"] == "330.00"


def test_installment_filters(seeded):
    ob = by_name(seeded, "Corretagem")
    rows = seeded.get("/api/installments", params={"obligationId": ob["id"]}).json()
    assert len(rows) == 6
    rows = seeded.get("/api/installments", params={"obligationId": ob["id"], "from": "2026-11-01",
                                                   "to": "2026-12-31"}).json()
    assert [r["seq"] for r in rows] == [4, 5]
    assert seeded.get("/api/installments", params={"status": "PAID"}).json()


def test_projection_applies_incc_lag_to_annual(seeded):
    d = detail(seeded, "Parcelas anuais")
    # example 500.00 due 2026-12-31: 3 compounded months of 0.50%
    assert d["installments"][0]["projectedAmount"] == str((D("500") * D("1.005") ** 3).quantize(D("0.01")))
    assert d["installments"][0]["expectedAmount"] == "500.00"


def test_key_delivery_reanchors_unpaid_only(seeded):
    key = by_name(seeded, "Parcela das chaves")["id"]
    fin = by_name(seeded, "Financiamento Caixa")["id"]
    r = seeded.put("/api/milestones/KEY_DELIVERY",
                   json={"expectedDate": "2028-04-30", "actualDate": None}).json()
    assert r["milestone"]["expectedDate"] == "2028-04-30"
    assert any("Parcela das chaves" in e for e in r["effects"])
    assert seeded.get(f"/api/obligations/{key}").json()["installments"][0]["dueDate"] == "2028-04-30"
    assert seeded.get(f"/api/obligations/{fin}").json()["installments"][0]["dueDate"] == "2028-05-02"

    # pay the keys installment; moving the milestone again must not touch it
    inst_id = seeded.get(f"/api/obligations/{key}").json()["installments"][0]["id"]
    seeded.post(f"/api/installments/{inst_id}/payment",
                json={"paidOn": "2028-04-30", "amount": "1000.00", "method": "PIX"})
    seeded.put("/api/milestones/KEY_DELIVERY", json={"expectedDate": "2028-06-30", "actualDate": None})
    assert seeded.get(f"/api/obligations/{key}").json()["installments"][0]["dueDate"] == "2028-04-30"
    assert seeded.get(f"/api/obligations/{fin}").json()["installments"][0]["dueDate"] == "2028-07-02"


def test_financing_contracted_below_reference_creates_difference(seeded):
    fin = by_name(seeded, "Financiamento Caixa")
    body = {k: fin[k] for k in ("name", "payee", "category", "fundingSource", "correctionIndex",
                                "periodicity", "count", "dayOfMonth", "firstDueDate",
                                "anchorMilestone", "offsetDays", "notes")}
    seeded.put("/api/milestones/FINANCING_SIGNED", json={"expectedDate": "2027-03-10", "actualDate": None})
    r = seeded.put(f"/api/obligations/{fin['id']}",
                   json={**body, "status": "CONTRACTED", "amount": "280000.00"})
    assert r.status_code == 200
    diff = detail(seeded, "Diferença do financiamento")
    assert diff["amount"] == "22000.40" and diff["category"] == "FINANCING_DIFFERENCE"
    assert diff["installments"][0]["dueDate"] == "2027-03-10"

    # equal value -> difference disappears (unpaid)
    seeded.put(f"/api/obligations/{fin['id']}",
               json={**body, "status": "CONTRACTED", "amount": "302000.40"})
    assert all(o["name"] != "Diferença do financiamento" for o in seeded.get("/api/obligations").json())

    # re-run on change
    seeded.put(f"/api/obligations/{fin['id']}",
               json={**body, "status": "CONTRACTED", "amount": "300000.00"})
    assert detail(seeded, "Diferença do financiamento")["amount"] == "2000.40"


def test_inspection_call_creates_task_and_monthly_condo(seeded):
    r = seeded.put("/api/milestones/INSPECTION_CALL",
                   json={"expectedDate": "2028-01-10", "actualDate": None}).json()
    assert r["effects"]
    tasks = seeded.get("/api/tasks", params={"open": "true"}).json()
    rule = [t for t in tasks if t["source"] == "RULE"]
    assert "2028-01-17" in [t["dueDate"] for t in rule]
    condo = detail(seeded, "Condomínio + IPTU")
    assert [i["dueDate"] for i in condo["installments"]][:2] == ["2028-01-10", "2028-02-10"]
    # idempotent: setting again does not duplicate the rule tasks
    seeded.put("/api/milestones/INSPECTION_CALL", json={"expectedDate": "2028-01-12", "actualDate": None})
    rule2 = [t for t in seeded.get("/api/tasks").json() if t["source"] == "RULE"]
    assert len(rule2) == len(rule)


def test_obligation_crud(client):
    body = {"name": "Extra", "payee": "X", "category": "OTHER", "periodicity": "MONTHLY",
            "count": 3, "amount": "10.00", "dayOfMonth": 5, "firstDueDate": "2027-01-05"}
    created = client.post("/api/obligations", json=body)
    assert created.status_code == 201
    oid = created.json()["id"]
    assert len(created.json()["installments"]) == 3
    assert created.json()["totalExpected"] == "30.00"
    upd = client.put(f"/api/obligations/{oid}", json={**body, "count": 2}).json()
    assert len(upd["installments"]) == 2
    assert client.delete(f"/api/obligations/{oid}").status_code == 204
    assert client.get(f"/api/obligations/{oid}").status_code == 404


def test_tasks_crud_and_toggle(client):
    t = client.post("/api/tasks", json={"title": "Ligar", "phase": "SIGNING"}).json()
    assert t["source"] == "MANUAL" and t["doneAt"] is None
    done = client.post(f"/api/tasks/{t['id']}/toggle").json()
    assert done["doneAt"] == "2026-11-11"
    assert client.post(f"/api/tasks/{t['id']}/toggle").json()["doneAt"] is None
    up = client.put(f"/api/tasks/{t['id']}", json={"title": "Ligar 2", "phase": "SIGNING"}).json()
    assert up["title"] == "Ligar 2"
    assert client.get("/api/tasks", params={"phase": "SIGNING", "open": "true"}).json()
    assert client.delete(f"/api/tasks/{t['id']}").status_code == 204


def test_settings_defaults_and_update(client):
    s = client.get("/api/settings").json()
    assert s == {"monthlyCapacity": "0.00", "inccMonthlyEstimate": "0.50",
                 "igpmMonthlyEstimate": "0.40", "dueSoonDays": 7}
    s = client.put("/api/settings", json={"monthlyCapacity": "5000", "inccMonthlyEstimate": "0.6",
                                          "igpmMonthlyEstimate": "0.4", "dueSoonDays": 5}).json()
    assert s["monthlyCapacity"] == "5000.00" and s["inccMonthlyEstimate"] == "0.60"


def test_capacity_exceeded_flag(seeded):
    seeded.put("/api/settings", json={"monthlyCapacity": "50", "inccMonthlyEstimate": "0.5",
                                      "igpmMonthlyEstimate": "0.4", "dueSoonDays": 7})
    assert seeded.get("/api/dashboard").json()["capacity"]["exceeded"] is True


def test_seed_import_is_idempotent(seeded, session_factory):
    import json

    from app.api.schemas import SeedFile
    from app.services.seed import import_seed
    from tests.conftest import EXAMPLE_SEED

    before = len(seeded.get("/api/installments").json())
    seed = SeedFile.model_validate(json.loads(EXAMPLE_SEED.read_text(encoding="utf-8")))
    with session_factory() as s:
        import_seed(s, seed)
        s.commit()
    assert len(seeded.get("/api/installments").json()) == before
    assert len(seeded.get("/api/tasks").json()) == 31  # 30 template + "Pagar ITBI"


def test_dashboard_totals_split_contract_vs_projected(seeded):
    t = seeded.get("/api/dashboard").json()["totals"]
    assert set(t) == {"expected", "projected", "projectedCorrection", "paid", "pending", "overdue"}
    assert D(t["projected"]) - D(t["expected"]) == D(t["projectedCorrection"])
    assert D(t["projectedCorrection"]) > 0  # INCC estimate on the builder installments
    assert D(t["pending"]) == D(t["projected"]) - D(t["paid"])
    by = seeded.get("/api/dashboard").json()["byObligation"]
    assert sum(D(o["expected"]) for o in by) == D(t["expected"])
    assert sum(D(o["projected"]) for o in by) == D(t["projected"])
    assert all(D(o["pending"]) == D(o["projected"]) - D(o["paid"]) for o in by)


def test_seed_itbi_registry_and_linked_task(seeded):
    itbi = detail(seeded, "ITBI")
    assert itbi["amount"] == "1000.00" and itbi["status"] == "CONTRACTED"
    assert itbi["anchorMilestone"] is None
    assert [i["dueDate"] for i in itbi["installments"]] == ["2026-11-30"]
    reg = by_name(seeded, "Registro do contrato (cartório)")
    assert reg["anchorMilestone"] == "FINANCING_SIGNED" and reg["status"] == "ESTIMATED"
    task = next(t for t in seeded.get("/api/tasks").json() if t["title"] == "Pagar ITBI")
    assert (task["phase"], task["dueDate"], task["source"]) == ("SIGNING", "2026-11-15", "MANUAL")
    assert task["obligationId"] == itbi["id"]
    assert task["installmentId"] == itbi["installments"][0]["id"]


def test_contract_registered_milestone_task_is_idempotent(seeded):
    keys = [m["key"] for m in seeded.get("/api/milestones").json()]
    assert keys.index("CONTRACT_REGISTERED") == keys.index("FINANCING_SIGNED") + 1
    assert keys.index("DOCS_CALL") == keys.index("CONTRACT_REGISTERED") + 1

    def matricula():
        return [t for t in seeded.get("/api/tasks").json()
                if t["title"] == "Apresentar matrícula atualizada à Prefeitura de Santo André"]

    r = seeded.put("/api/milestones/CONTRACT_REGISTERED",
                   json={"expectedDate": None, "actualDate": "2026-12-10"}).json()
    assert r["milestone"]["label"] == "Registro do contrato no cartório"
    assert any("09/01/2027" in e for e in r["effects"])
    [task] = matricula()
    assert task["dueDate"] == "2027-01-09" and task["phase"] == "SIGNING"
    assert task["source"] == "RULE" and "Decreto 18.564/2026" in task["notes"]

    seeded.put("/api/milestones/CONTRACT_REGISTERED",
               json={"expectedDate": None, "actualDate": "2026-12-20"})
    [again] = matricula()
    assert again["id"] == task["id"] and again["dueDate"] == "2027-01-19"

    seeded.put("/api/milestones/CONTRACT_REGISTERED", json={"expectedDate": None, "actualDate": None})
    assert matricula() == []
