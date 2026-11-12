# API reference

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
- `PaymentIn` also accepts an optional `receiptPath`.
- `POST`/`PUT /obligations` return `ObligationDto & { installments }`; `DELETE` calls return 204.
- `projectedAmount` is computed on read from the current settings and milestones; for a paid
  installment it equals the amount actually paid.
- `status`: `PAID` if paid; `OVERDUE` if due before today (America/Sao_Paulo); `DUE_SOON` if due
  within `dueSoonDays`; else `PENDING`.

## Types
```
PaymentDto     { paidOn, amount, method: PIX|BOLETO|DEBIT|FGTS|SUBSIDY, receiptPath: string|null }
InstallmentDto { id, obligationId, obligationName, seq, count, dueDate, expectedAmount,
                 projectedAmount, status: PENDING|DUE_SOON|OVERDUE|PAID, payment: PaymentDto|null }
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
                 nextTasks: TaskDto[] }
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
| `POST /api/installments/{id}/payment` | `{ paidOn, amount, method, receiptPath? }` | `InstallmentDto` (409 if already paid) |
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
