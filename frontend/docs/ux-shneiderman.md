# Shneiderman's 8 golden rules, by screen

Acceptance criteria for every screen. Each line says how the rule is met **today**; "n/a" or a stated limit is called out rather than hidden.
Verified by clicking through every screen in headless Chrome with `useMock=true` at 375px and 1280px (flow: pay from dashboard, Enter-to-confirm, Undo, row undo with confirm, obligation create/edit/delete, milestone edit with effects, task toggle/create/delete, settings, login).

Shared building blocks (apply to all screens): `app-page-header` (title + breadcrumb), `app-installment-list`, `app-status-tag`, `FeedbackService` toasts, one global payment dialog (`ActionsService`), `brl`/`dateBr` pipes.

## Painel (`/painel`)
1. Consistency: same installment list, status tags, header and "Pagar" action as Parcelas and Obrigação detalhe.
2. Shortcuts: "Pagar" on every upcoming/overdue row and tick tasks directly from the card; Enter confirms the dialog.
3. Feedback: status tags (cor + ícone + texto), toast on pay/undo/task, red capacity alert with the exceeded amounts.
4. Closure: dialog closes on success, the KPIs/lists refresh and a toast confirms what was recorded.
5. Error prevention: payment amount must be > 0, date required; confirm button disabled until valid.
6. Reversal: "Desfazer" in the toast after paying or completing a task (calls DELETE payment / toggle again).
7. Control: nothing navigates on its own; every block links to the screen where it can be edited.
8. Memory: totals, "contrato × previsto hoje" and capacity (R$ x de R$ y) are always on screen.

## Parcelas (`/parcelas`)
1. Consistency: same list component, labels ("A pagar / Pagas / Atrasadas / Todas") and actions as the dashboard.
2. Shortcuts: filter chips plus an obligation select; "Pagar" per row; Enter in any dialog field confirms.
3. Feedback: result count + total of the filter, toast on pay/undo, specific empty-state text per filter.
4. Closure: after paying, the row leaves "A pagar" and the toast states obligation, parcela, valor, data.
5. Error prevention: payment form validated; undoing a payment asks for confirmation first.
6. Reversal: toast "Desfazer" plus a persistent "Desfazer" button on every paid row.
7. Control: filters never reset by themselves; paying never navigates away.
8. Memory: the dialog shows vencimento, valor no contrato and previsto hoje above the fields and a live "R$ x acima do contrato" hint.

## Obrigações (`/obrigacoes`)
1. Consistency: same tags/terms (Estimada, Contratada) and progress bars as the dashboard's per-obligation block.
2. Shortcuts: "Ver cronograma" and "Editar" directly on each card.
3. Feedback: progress bar + "pago de previsto" and status tag per card.
4. Closure: creating or editing ends on the detail screen with a toast.
5. Error prevention: n/a on the list itself (no destructive action here; delete lives in the detail with confirmation).
6. Reversal: n/a on the list; everything shown is editable.
7. Control: nothing is automatic; "Nova obrigação" is explicit.
8. Memory: payee, category, periodicity, correction and funding source are shown on each card.

## Detalhe da obrigação (`/obrigacoes/:id`)
1. Consistency: schedule uses the shared installment list; header/breadcrumb as everywhere.
2. Shortcuts: pay or undo directly from the schedule rows.
3. Feedback: status tags per parcela, toasts for pay/undo/delete.
4. Closure: deleting returns to the list with "Obrigação excluída".
5. Error prevention: delete asks for confirmation naming the obligation and warning about payments.
6. Reversal: payments are undoable; **deleting an obligation is not reversible** (hence the explicit confirmation).
7. Control: edit is always one click away; no automatic navigation except after delete.
8. Memory: summary card shows totals, start rule (data ou marco + offset), correction and funding; breadcrumb "Obrigações / nome".

## Formulário de obrigação (`/obrigacoes/nova`, `/obrigacoes/:id/editar`)
1. Consistency: same field order/labels for create and edit; same toast and result screen.
2. Shortcuts: Tab-friendly native fields, Enter submits; sensible defaults (Mensal, Contratada, Sem correção).
3. Feedback: inline pt-BR errors (nome, quem recebe, nº de parcelas, dia 1–31, valores por parcela, data/marco) and a toast on save.
4. Closure: save lands on the obligation detail; Cancelar returns to where you came from.
5. Error prevention: submit disabled until valid; per-parcela values must match the parcela count; edit warns that only unpaid parcelas are regenerated.
6. Reversal: Cancelar discards; saved changes can be edited again (paid parcelas are never altered).
7. Control: data fixa **or** marco, every field editable; no hidden changes.
8. Memory: hints under fields ("Estimada quando o valor ainda vai mudar", "Use R$ 0,00 quando desconhecido") and breadcrumb with the obligation name.

## Marcos (`/marcos`)
1. Consistency: one card per marco with the same two date fields and Salvar.
2. Shortcuts: date pickers accept typing (dd/mm/aaaa) and have Hoje/Limpar.
3. Feedback: toast **and** a persistent "O que mudou em …" list with the effects returned by the API.
4. Closure: card state flips to "Ocorreu/Previsto" after saving; effects stay visible.
5. Error prevention: Salvar disabled until a date actually changes.
6. Reversal: set the old date back (rules recompute); there is no one-click undo for marcos.
7. Control: both previsto and real dates are editable on every marco; each marco explains what it triggers before you change it.
8. Memory: the help line under each title states which rules fire.

## Tarefas (`/tarefas`)
1. Consistency: same checkbox/toast/Undo behavior as the dashboard "próximas tarefas".
2. Shortcuts: tick to complete from the list (or the dashboard); filter Abertas/Concluídas/Todas.
3. Feedback: tags "em N dias"/"atrasada N dias", completed items struck through with date, toasts on every change.
4. Closure: dialogs close after save and the list shows the result with a toast.
5. Error prevention: title required (button disabled until valid); delete asks for confirmation.
6. Reversal: "Desfazer" in the completion toast; reopen by unticking.
7. Control: create/edit/delete any task, including template- and rule-created ones.
8. Memory: grouped by phase with "N aberta(s)", deadline and origin ("criada por regra") on each item.

## Ajustes (`/ajustes`)
1. Consistency: same form layout, buttons and toast as the other forms.
2. Shortcuts: Enter saves; numeric fields with units (R$, %, dias).
3. Feedback: toast "Ajustes salvos — o painel já usa os novos valores".
4. Closure: Salvar returns to disabled/pristine state after success.
5. Error prevention: Salvar disabled while pristine or invalid; min/max on every number.
6. Reversal: edit the value again; no one-click undo.
7. Control: all parameters editable; "Sair" is explicit.
8. Memory: each field explains its effect (alerta no painel, "Vence em breve").

## Entrar (`/entrar`)
1. Consistency: same inputs, buttons and error text style as the rest.
2. Shortcuts: Enter sends; e-mail field has `autocomplete`/`inputmode`.
3. Feedback: clear success state ("Enviamos um link para …") and error message.
4. Closure: sent-state ends the dialog; "Usar outro e-mail" to restart.
5. Error prevention: button disabled until a valid e-mail.
6. Reversal: "Usar outro e-mail" goes back.
7. Control: no automatic redirect in demo mode; in production an authenticated user is sent to the painel.
8. Memory: n/a (single field).

## Fixes made while verifying
- Enter inside the amount field did not submit (`p-inputnumber` swallows it): the dialog now confirms from the form.
- `aria-label` on `p-button` landed on the host, so icon buttons had no accessible name: now bound with `[ariaLabel]`.
- Toasts covered primary actions (bottom of the phone, top-right of desktop) and the empty toast container blocked clicks: toasts are bottom-left (beside the sidebar) on desktop and top on phones, and the container ignores the pointer.
- On phones a paid installment with a contract difference squeezed the name into one letter per line.
- Selects/inputs in the obligation form had inconsistent heights (missing `fluid`).
- `/entrar` redirected away in demo mode, hiding the login screen.
