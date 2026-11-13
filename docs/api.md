# API reference

## Changes (documents module)
For the frontend integrator — exactly what changed versus the previous contract:
1. **`receiptPath` removed** from `PaymentIn` and `PaymentDto` (and the `payments.receipt_path` column). Receipts are now documents of category `PAYMENT_RECEIPT`; send `receiptPath` and it is ignored.
2. **`InstallmentDto.documentCount: number`** (new) = number of ACTIVE documents linked to the installment (always present, `0` when none). Applies everywhere an `InstallmentDto` appears (installments list, obligation detail, dashboard `upcoming`/`overdue`, payment responses).
3. **`DashboardDto.expiringDocuments: DocumentDto[]`** (new): ACTIVE documents with `expiry` EXPIRED or DUE_SOON, ordered by `validUntil` ascending (empty array when none).
4. **New types**
   ```
   DocumentCategory = PAYMENT_RECEIPT|CONTRACT|PERSONAL_ID|INCOME_FGTS_TAX|FINANCING|TAXES_FEES|PROJECT_SPEC|OTHER
                      (pt-BR labels: Comprovante de pagamento, Contrato, Documento pessoal, Renda/FGTS/IR,
                       Financiamento/Caixa, Impostos e taxas, Projeto/Memorial, Outros — labels live in the frontend)
   DocumentLink     = { type: INSTALLMENT|OBLIGATION|TASK|MILESTONE, id: string, label: string }
                      (id = installment/obligation/task id, or the MilestoneKey; label = e.g. "Corretagem 4/6",
                       the obligation name, the task title, the milestone label)
   DocumentDto      = { id, title, category, documentDate: string|null, validUntil: string|null, notes: string|null,
                        originalName, mimeType, sizeBytes: number, createdAt: ISO-8601 UTC, link: DocumentLink|null,
                        expiry: VALID|DUE_SOON|EXPIRED|null }
   DocumentIn       = { title, category, documentDate?, validUntil?, notes?, installmentId?, obligationId?, taskId?, milestoneKey? }
                      (at most ONE of the four link fields; two or more → 422)
   UploadInfo       = { url, method: "PUT", headers: { [name]: string } }
   ```
   `expiry` is null without `validUntil`; EXPIRED if `validUntil` < today (America/Sao_Paulo); DUE_SOON if within `dueSoonDays` (settings) of today, inclusive; else VALID.
5. **New endpoints**
   | Method & path | Body | Returns |
   |---|---|---|
   | `GET /api/documents?category=&q=&installmentId=&obligationId=&taskId=&milestoneKey=` | – | `DocumentDto[]` (ACTIVE only, newest first; `q` matches title, original name, notes) |
   | `POST /api/documents` | `DocumentIn & { originalName, mimeType, sizeBytes }` | 201 `{ document: DocumentDto, upload: UploadInfo }` |
   | `POST /api/documents/{id}/confirm` | – | `DocumentDto` (422 on failure, see below) |
   | `PUT /api/documents/{id}` | `DocumentIn` (replaces all fields, including the link) | `DocumentDto` |
   | `DELETE /api/documents/{id}` | – | 204 (also deletes the stored file) |
   | `GET /api/documents/{id}/download-url` | – | `{ url, expiresAt }` (signed, ~5 min) |
6. **Upload flow (3 steps)**: (a) `POST /api/documents` creates a `PENDING` document (hidden from lists) and returns `upload`; (b) the browser does `fetch(upload.url, { method: upload.method, headers: upload.headers, body: file })` — no auth header, no FormData; (c) `POST /api/documents/{id}/confirm` checks the object exists, is ≤ 20 MB and has an allowed mime type, then marks it `ACTIVE`. On failure it answers **422** `{detail}` and deletes both the object and the row (create a new document to retry). Confirming an already ACTIVE document is a no-op returning the document.
7. **Validation / limits**: `mimeType` ∈ application/pdf, image/jpeg, image/png, image/heic, image/heif, image/webp and `1 ≤ sizeBytes ≤ 20971520` are checked on `POST /documents` (422) and re-checked against the real object on confirm. Unknown `installmentId`/`obligationId`/`taskId` → 404.
8. **Cleanup**: every `POST /documents` deletes PENDING documents older than 24 h (row + object). CLI: `python -m app.cli cleanup-docs`.
9. **Links**: FKs are `ON DELETE SET NULL` — deleting a task/obligation (or regenerating/deleting installments) keeps the document with `link: null`. Undoing a payment keeps the document and its link. Files are only deleted by `DELETE /documents/{id}`.
10. **Download**: open `url` in a new tab. In production it is a Supabase Storage signed URL; in development (`STORAGE_BACKEND=local`) it points to `GET /api/dev-storage/{token}` on the API, and uploads go to `PUT /api/dev-storage/{token}`. Those two routes exist **only when `ENV != production`** and need no bearer token (the token in the path is the credential). With `ENV=production` the API requires `STORAGE_BACKEND=supabase`, `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
11. **Config (backend)**: `SUPABASE_SERVICE_ROLE_KEY`, `STORAGE_BACKEND` (`supabase`|`local`), `STORAGE_BUCKET` (default `documents`), `STORAGE_LOCAL_DIR` (default `.devdata/files`), `API_PUBLIC_URL` (browser-visible API base for local URLs, default `http://localhost:8000`). Migration `0002` creates `documents` and drops `payments.receipt_path`.
12. **CLI**: `import-docs <dir> --map <json> [--apply]` (dry run lists file → category/title; `--apply` uploads through the storage adapter and is idempotent by original file name) and `cleanup-docs`. Map: `{ "files": { "<relative path>": { title, category, documentDate?, validUntil?, notes?, obligationName?, milestoneKey? } } }` — see `seed/docs-map.example.json`.

No deviations from the shared contract; additions: `API_PUBLIC_URL`, the dev-storage routes, and `upload.headers` carrying `Content-Type` (and `x-upsert: false` on Supabase).

## Changes (backend follow-up: contract vs projected, CONTRACT_REGISTERED)
For the frontend integrator — exactly what changed versus the previous contract:
1. **`DashboardDto.totals`** is now `{ expected, projected, projectedCorrection, paid, pending, overdue }`:
   - `expected` = sum of the contractual `expectedAmount` of all installments (no INCC/IGP-M). **Meaning changed** (it used to be the projected sum).
   - `projected` (new) = unpaid installments at `projectedAmount` + paid installments at the amount actually paid.
   - `projectedCorrection` (new) = `projected − expected` (estimated correction).
   - `paid` unchanged. `pending` is now `projected − paid` (**includes overdue**; it used to exclude overdue). `overdue` unchanged (unpaid, due before today, a subset of `pending`).
   - Old identity `expected = paid + pending + overdue` is replaced by `projected = paid + pending`.
2. **`DashboardDto.byObligation[]`** is now `{ obligationId, name, expected, projected, paid, pending }`: `expected` is contractual (changed), `projected` is new, `pending = projected − paid`.
3. **`monthly[]`, `capacity`, `upcoming`, `overdue`, `nextTasks`** keep their shape; `monthly[].expected` and `capacity.currentMonthCommitment` remain *projected* amounts. `upcoming` no longer overlaps `overdue` (unchanged semantics: unpaid, due today..+30 days).
4. **New milestone `CONTRACT_REGISTERED`** (label "Registro do contrato no cartório") in `MilestoneKey`, listed by `GET /api/milestones` between `FINANCING_SIGNED` and `DOCS_CALL`. No DB migration needed (keys are plain strings); the row is created on first read.
5. Setting its date creates the RULE task "Apresentar matrícula atualizada à Prefeitura de Santo André" (phase `SIGNING`, due date + 30 days, with `notes`); re-setting updates that task in place. Clearing the date removes it while open.
6. Seed: the "ITBI + registro" placeholder is split into "ITBI" (fixed due date) and "Registro do contrato (cartório)" (anchored to `FINANCING_SIGNED`); the seed file accepts an optional `tasks` list.

Base path `/api`. JSON is camelCase. **Money** is a decimal string with 2 places (`"2548.00"`);
percentages (`inccMonthlyEstimate`, `igpmMonthlyEstimate`) are 2-place strings too. **Dates** are
`YYYY-MM-DD`. Auth: `Authorization: Bearer <Supabase access token>`; 401 for a missing/invalid
token, 403 when the token's e-mail is not the owner. `GET /api/health` needs no auth. Errors:
`{"detail": ...}` — 404 not found, 409 already paid, 422 validation.

Implementation notes (no deviations from the shared contract; additions only):
- `POST`/`PUT /obligations` return `ObligationDto & { installments }`; `DELETE` calls return 204.
- `projectedAmount` is computed on read from the current settings and milestones; for a paid
  installment it equals the amount actually paid.
- `status`: `PAID` if paid; `OVERDUE` if due before today (America/Sao_Paulo); `DUE_SOON` if due
  within `dueSoonDays`; else `PENDING`.

## Types
```
PaymentDto     { paidOn, amount, method: PIX|BOLETO|DEBIT|FGTS|SUBSIDY }
InstallmentDto { id, obligationId, obligationName, seq, count, dueDate, expectedAmount,
                 projectedAmount, status: PENDING|DUE_SOON|OVERDUE|PAID, payment: PaymentDto|null,
                 documentCount: number }
ObligationDto  { id, name, payee, category, status: ESTIMATED|CONTRACTED,
                 fundingSource: OWN|FGTS|SUBSIDY|FINANCING, correctionIndex: NONE|INCC_DI|IGPM,
                 periodicity: ONCE|MONTHLY|ANNUAL|OPEN_ENDED, count: number|null, amount,
                 amounts: string[]|null, dayOfMonth: number|null, firstDueDate: string|null,
                 anchorMilestone: MilestoneKey|null, offsetDays, notes: string|null,
                 totalExpected, totalPaid }
  category = BUILDER_INSTALLMENT|BROKERAGE|FINANCING|FINANCING_DIFFERENCE|CONSTRUCTION_INTEREST|
             FEE_TAX|CONDO_IPTU|OTHER
MilestoneKey   = FINANCING_SIGNED|CONTRACT_REGISTERED|DOCS_CALL|HABITE_SE|INSPECTION_CALL|KEY_DELIVERY
MilestoneDto   { key, label (pt-BR), expectedDate: string|null, actualDate: string|null }
TaskDto        { id, title, phase: PRE_CONTRACT|CREDIT_APPROVAL|SIGNING|CONSTRUCTION|KEY_DELIVERY|
                 POST_DELIVERY, dueDate, doneAt, notes, obligationId, installmentId,
                 source: TEMPLATE|RULE|MANUAL }
SettingsDto    { monthlyCapacity, inccMonthlyEstimate, igpmMonthlyEstimate, dueSoonDays }
DashboardDto   { totals { expected, projected, projectedCorrection, paid, pending, overdue },
                 upcoming: InstallmentDto[], overdue: InstallmentDto[],
                 byObligation: [{ obligationId, name, expected, projected, paid, pending }], monthly: [{ month: "YYYY-MM", expected, paid }],
                 capacity { monthlyCapacity, currentMonthCommitment, exceeded },
                 nextTasks: TaskDto[], expiringDocuments: DocumentDto[] }
Document*      see "Changes (documents module)"
```
Dashboard semantics: `expected` = sum of the contractual `expectedAmount`; `projected` = sum of
`projectedAmount` (actual amount for paid ones); `projectedCorrection` = `projected − expected`;
`pending` = `projected − paid` (unpaid, overdue included); `overdue` = unpaid and due before today;
`upcoming` = unpaid due in the next 30 days; `monthly` runs from the first installment month to the
KEY_DELIVERY month (zero-filled); `currentMonthCommitment` = projected total due this month;
`exceeded` is true only when `monthlyCapacity > 0` and the commitment is above it; `nextTasks` = up
to 5 open tasks ordered by due date (undated last).

## Endpoints
| Method & path | Body | Returns |
|---|---|---|
| `GET /api/health` | – | `{ "ok": true }` |
| `GET /api/dashboard` | – | `DashboardDto` |
| `GET /api/installments?status=&obligationId=&from=&to=` | – | `InstallmentDto[]` (by due date) |
| `POST /api/installments/{id}/payment` | `{ paidOn, amount, method }` | `InstallmentDto` (409 if already paid) |
| `DELETE /api/installments/{id}/payment` | – | `InstallmentDto` (undo) |
| `GET /api/obligations` | – | `ObligationDto[]` |
| `GET /api/obligations/{id}` | – | `ObligationDto & { installments }` |
| `POST /api/obligations` | obligation fields (below) | 201 `ObligationDto & { installments }` |
| `PUT /api/obligations/{id}` | obligation fields | same; regenerates **unpaid** installments only |
| `DELETE /api/obligations/{id}` | – | 204 |
| `GET /api/milestones` | – | `MilestoneDto[]` |
| `PUT /api/milestones/{key}` | `{ expectedDate, actualDate }` | `{ milestone: MilestoneDto, effects: string[] }` |
| `GET /api/tasks?phase=&open=` | – | `TaskDto[]` |
| `POST /api/tasks` | `{ title, phase, dueDate?, doneAt?, notes?, obligationId?, installmentId? }` | 201 `TaskDto` |
| `PUT /api/tasks/{id}` | same | `TaskDto` |
| `DELETE /api/tasks/{id}` | – | 204 |
| `POST /api/tasks/{id}/toggle` | – | `TaskDto` (done today ⇄ open) |
| `GET/POST/PUT/DELETE /api/documents…` | – | see "Changes (documents module)" |
| `GET /api/settings` / `PUT /api/settings` | `{ monthlyCapacity, inccMonthlyEstimate, igpmMonthlyEstimate, dueSoonDays }` | `SettingsDto` |

Obligation body: `name, payee, category, status, fundingSource, correctionIndex, periodicity, count,
amount, amounts, dayOfMonth, firstDueDate, anchorMilestone, offsetDays, notes` (all but `name`
optional). `amounts`, when present, gives per-installment amounts (falls back to `amount`).

## Rules
- **Schedule**: with `anchorMilestone` the first due date is the milestone's actual (else expected)
  date + `offsetDays`; without a date no installments exist until the milestone is set.
  `OPEN_ENDED` generates 12 monthly installments. Paid installments are never changed or deleted.
- **Projection**: `INCC_DI` monthly estimate with a 1-month lag from Aug/2026 (Sep ⇒ ×1, Oct ⇒
  ×(1+i)…). After HABITE_SE the open balance moves to IGP-M + Price 1% a.m.
- **Financing**: a `FINANCING` obligation that is `CONTRACTED` with `amount < 302000.40` creates an
  automatic `FINANCING_DIFFERENCE` obligation ("Diferença do financiamento") for the difference,
  due at `FINANCING_SIGNED`; equal/greater (or `ESTIMATED`) removes it (kept if already paid).
  Re-evaluated on every obligation create/update/delete.
- **Milestones** (`PUT /milestones/{key}`): re-anchors dependent obligations and returns pt-BR
  `effects`. CONTRACT_REGISTERED ⇒ task "Apresentar matrícula…" +30 days (SIGNING, with ITBI fine notes); DOCS_CALL ⇒ task +10 days; INSPECTION_CALL ⇒ task +7 days, assistance task +3 months,
  condo/IPTU start; FINANCING_SIGNED ⇒ construction interest, difference and registry fee start (ITBI has a fixed date);
  HABITE_SE ⇒ regime change; KEY_DELIVERY ⇒ obligations anchored to the keys move. Rule tasks
  (`source: RULE`) are replaced, not duplicated; completed ones are kept.

## Seed file (`import-seed`)
`{ settings, milestones: [{key, expectedDate, actualDate}], obligations: [ <obligation body> +
payments: [{seq, paidOn, amount, method}] ], tasks?: [{title, phase, dueDate?, notes?,
obligationName?, installmentSeq?}] }` — see `seed/apto-166.example.json`.
