import { Component, inject, input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ConfirmationService } from 'primeng/api';
import { InstallmentDto } from '../core/models';
import { compareMoney } from '../core/money';
import { diffDays, localTodayIso } from '../core/dates';
import { ActionsService } from './actions.service';
import { DocumentsService } from './documents.service';
import { BrlPipe, DateBrPipe } from './pipes';
import { StatusTagComponent } from './status-tag.component';

/** One list used by the dashboard, the installments screen and the obligation detail (rule 1). */
@Component({
  selector: 'app-installment-list',
  imports: [ButtonModule, BrlPipe, DateBrPipe, StatusTagComponent],
  template: `
    @if (items().length === 0) {
      <p class="empty">{{ emptyText() }}</p>
    } @else {
      <ul class="rows" role="list">
        @for (i of items(); track i.id) {
          <li class="row" [class.row--overdue]="i.status === 'OVERDUE'" [class.row--paid]="i.status === 'PAID'">
            <div class="row__main">
              @if (showObligation()) {
                <strong class="row__name">{{ i.obligationName }}</strong>
                <span class="row__meta">parcela {{ i.seq }}/{{ i.count }}</span>
              } @else {
                <strong class="row__name">Parcela {{ i.seq }}/{{ i.count }}</strong>
              }
            </div>
            <div class="row__due">
              <span>{{ i.dueDate | dateBr }}</span>
              <span class="row__meta">{{ relative(i) }}</span>
            </div>
            <div class="row__amount">
              @if (i.payment) {
                <strong class="num">{{ i.payment.amount | brl }}</strong>
                <span class="row__meta">
                  pago em {{ i.payment.paidOn | dateBr }}
                  @if (differs(i)) { · contrato {{ i.expectedAmount | brl }} }
                </span>
              } @else {
                <strong class="num">{{ i.projectedAmount | brl }}</strong>
                @if (differs(i)) {
                  <span class="row__meta">contrato {{ i.expectedAmount | brl }}</span>
                }
              }
            </div>
            <div class="row__status">
              <app-status-tag [installment]="i.status" />
              @if (i.documentCount > 0) {
                <button type="button" class="clip" (click)="openDocs(i)"
                  [attr.aria-label]="i.documentCount + ' documento(s) anexado(s) a ' + i.obligationName + ' ' + i.seq + '/' + i.count + '. Abrir'">
                  <i class="pi pi-paperclip" aria-hidden="true"></i> {{ i.documentCount }}
                </button>
              } @else if (i.status === 'PAID') {
                <button type="button" class="clip clip--missing" (click)="openDocs(i)"
                  [attr.aria-label]="'Sem comprovante em ' + i.obligationName + ' ' + i.seq + '/' + i.count + '. Anexar'">
                  sem comprovante
                </button>
              } @else {
                <button type="button" class="clip clip--add" (click)="openDocs(i)"
                  [attr.aria-label]="'Anexar documento a ' + i.obligationName + ' ' + i.seq + '/' + i.count">
                  <i class="pi pi-paperclip" aria-hidden="true"></i>
                </button>
              }
            </div>
            <div class="row__action">
              @if (i.status === 'PAID') {
                <p-button label="Desfazer" icon="pi pi-undo" size="small" [text]="true" severity="secondary"
                  [ariaLabel]="'Desfazer pagamento de ' + i.obligationName" (onClick)="confirmUndo(i)" />
              } @else {
                <p-button label="Pagar" icon="pi pi-check" size="small"
                  [ariaLabel]="'Registrar pagamento de ' + i.obligationName" (onClick)="actions.openPayment(i)" />
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .rows { list-style: none; margin: 0; padding: 0; }
    .row { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 1.2fr) 9.5rem 6.5rem; gap: 0.75rem; align-items: center; padding: 0.7rem 0.25rem; border-top: 1px solid var(--line); }
    .row:first-child { border-top: 0; }
    .row--overdue { background: color-mix(in srgb, var(--danger) 6%, transparent); }
    .row__main, .row__due, .row__amount { display: flex; flex-direction: column; min-width: 0; }
    .row__name { font-weight: 600; overflow-wrap: anywhere; }
    .row__meta { color: var(--muted); font-size: 0.8125rem; }
    .row__amount { align-items: flex-end; text-align: right; }
    .row__action { display: flex; justify-content: flex-end; }
    .row__status { display: flex; flex-direction: column; align-items: flex-start; gap: 0.2rem; }
    .clip { border: 0; background: none; padding: 0.1rem 0.25rem; margin-left: -0.25rem; border-radius: 6px; font: inherit; font-size: 0.8125rem; color: var(--accent); cursor: pointer; display: inline-flex; gap: 0.3rem; align-items: center; }
    .clip:hover { background: var(--surface-2); text-decoration: underline; }
    .clip--missing, .clip--add { color: var(--muted); }
    .clip--add { opacity: 0.75; }
    .num { font-variant-numeric: tabular-nums; }
    .empty { color: var(--muted); margin: 0.5rem 0; }
    @media (max-width: 720px) {
      .row { grid-template-columns: minmax(6.5rem, 1fr) minmax(0, auto); grid-template-areas: 'main amount' 'due status' 'action action'; row-gap: 0.4rem; padding: 0.85rem 0.25rem; }
      .row__main { grid-area: main; min-width: 6.5rem; }
      .row__amount { max-width: 62vw; }
      .row__amount { grid-area: amount; }
      .row__due { grid-area: due; flex-direction: row; gap: 0.5rem; align-items: baseline; }
      .row__status { grid-area: status; justify-self: end; align-items: flex-end; }
      .row__action { grid-area: action; justify-content: stretch; }
      .row__action ::ng-deep .p-button { width: 100%; }
    }
  `,
})
export class InstallmentListComponent {
  protected readonly actions = inject(ActionsService);
  private readonly confirm = inject(ConfirmationService);
  private readonly docs = inject(DocumentsService);

  readonly items = input.required<InstallmentDto[]>();
  readonly showObligation = input(true);
  readonly emptyText = input('Nada por aqui.');

  protected differs(i: InstallmentDto): boolean {
    return compareMoney(i.payment?.amount ?? i.projectedAmount, i.expectedAmount) !== 0;
  }

  protected relative(i: InstallmentDto): string {
    if (i.status === 'PAID') return 'quitada';
    const d = diffDays(localTodayIso(), i.dueDate);
    if (d === 0) return 'vence hoje';
    if (d === 1) return 'vence amanhã';
    if (d > 1) return `em ${d} dias`;
    return d === -1 ? 'venceu ontem' : `venceu há ${-d} dias`;
  }

  protected openDocs(i: InstallmentDto): void {
    this.docs.openItem({ type: 'INSTALLMENT', id: i.id, label: `${i.obligationName} ${i.seq}/${i.count}` });
  }

  protected confirmUndo(i: InstallmentDto): void {
    this.confirm.confirm({
      key: 'app',
      header: 'Desfazer pagamento?',
      message: `A parcela ${i.seq}/${i.count} de ${i.obligationName} voltará para "a pagar".`,
      icon: 'pi pi-undo',
      acceptLabel: 'Desfazer pagamento',
      rejectLabel: 'Manter',
      accept: () => this.actions.undoPayment(i),
    });
  }
}
