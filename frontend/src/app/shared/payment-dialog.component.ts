import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { METHOD_LABEL, enumOptions } from '../core/labels';
import { PaymentMethod } from '../core/models';
import { localTodayIso, isoToPicker, pickerToIso } from '../core/dates';
import { moneyToNumber, numberToMoney, subMoney, toCents } from '../core/money';
import { ActionsService } from './actions.service';
import { BrlPipe, DateBrPipe } from './pipes';

/**
 * The one payment dialog, opened from any list or the dashboard. The contract
 * and projected amounts stay visible while typing (rule 8); Enter confirms (rule 2).
 */
@Component({
  selector: 'app-payment-dialog',
  imports: [ReactiveFormsModule, DialogModule, ButtonModule, DatePickerModule, InputNumberModule, SelectModule, BrlPipe, DateBrPipe],
  template: `
    <p-dialog header="Registrar pagamento" [modal]="true" [draggable]="false" [dismissableMask]="true"
      [visible]="!!inst()" (visibleChange)="$event || actions.closePayment()"
      [style]="{ width: '30rem' }" [breakpoints]="{ '575px': '94vw' }">
      @if (inst(); as i) {
        <section class="contract" aria-label="Dados da parcela">
          <div class="contract__title">{{ i.obligationName }} · parcela {{ i.seq }}/{{ i.count }}</div>
          <dl>
            <div><dt>Vencimento</dt><dd>{{ i.dueDate | dateBr }}</dd></div>
            <div><dt>Valor no contrato</dt><dd class="num">{{ i.expectedAmount | brl }}</dd></div>
            <div><dt>Previsto hoje</dt><dd class="num">{{ i.projectedAmount | brl }}</dd></div>
          </dl>
        </section>

        <form [formGroup]="form" (ngSubmit)="submit()" (keydown.enter)="onEnter($any($event))" class="form">
          <label for="pay-amount">Valor pago</label>
          <p-inputnumber inputId="pay-amount" formControlName="amount" mode="decimal" locale="pt-BR" prefix="R$ "
            [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0.01" [autofocus]="true" fluid />
          @if (diff(); as d) {
            <small class="diff">{{ d }}</small>
          }

          <label for="pay-date">Data do pagamento</label>
          <p-datepicker inputId="pay-date" formControlName="paidOn" dateFormat="dd/mm/yy" appendTo="body" [showIcon]="true" fluid />

          <label for="pay-method">Forma de pagamento</label>
          <p-select inputId="pay-method" formControlName="method" [options]="methods" optionLabel="label" optionValue="value" appendTo="body" fluid />

          <div class="actions">
            <p-button type="button" label="Cancelar" severity="secondary" [text]="true" (onClick)="actions.closePayment()" />
            <p-button type="submit" label="Confirmar pagamento" icon="pi pi-check" [disabled]="form.invalid" [loading]="saving()" />
          </div>
        </form>
      }
    </p-dialog>
  `,
  styles: `
    .contract { background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 0.75rem 0.9rem; margin-bottom: 1rem; }
    .contract__title { font-weight: 600; margin-bottom: 0.4rem; }
    dl { margin: 0; display: grid; gap: 0.25rem; }
    dl > div { display: flex; justify-content: space-between; gap: 1rem; }
    dt { color: var(--muted); }
    dd { margin: 0; font-weight: 500; }
    .num { font-variant-numeric: tabular-nums; }
    .form { display: grid; gap: 0.4rem; }
    label { font-weight: 500; margin-top: 0.5rem; }
    .diff { color: var(--muted); }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
  `,
})
export class PaymentDialogComponent {
  protected readonly actions = inject(ActionsService);
  private readonly fb = inject(FormBuilder);

  protected readonly inst = this.actions.paying;
  protected readonly saving = signal(false);
  protected readonly methods = enumOptions<PaymentMethod>(METHOD_LABEL);

  protected readonly form = this.fb.nonNullable.group({
    amount: [0, [Validators.required, Validators.min(0.01)]],
    paidOn: [new Date() as Date | null, Validators.required],
    method: ['PIX' as PaymentMethod, Validators.required],
  });

  constructor() {
    // Prefill with the projected amount and today's date every time the dialog opens.
    effect(() => {
      const i = this.inst();
      if (!i) return;
      this.saving.set(false);
      this.form.reset({
        amount: moneyToNumber(i.projectedAmount),
        paidOn: isoToPicker(localTodayIso()),
        method: 'PIX',
      });
    });
  }

  protected diff(): string | null {
    const i = this.inst();
    const amount = this.form.controls.amount.value;
    if (!i || !(amount > 0)) return null;
    const delta = subMoney(numberToMoney(amount), i.expectedAmount);
    const c = toCents(delta);
    if (c === 0n) return 'Igual ao valor do contrato.';
    const abs = delta.replace('-', '');
    const [int, frac] = abs.split('.');
    const txt = `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${frac}`;
    return c > 0n ? `${txt} acima do contrato (correção ou encargos).` : `${txt} abaixo do contrato.`;
  }

  /** p-inputnumber consumes Enter, so confirm from the form level (rule 2: keyboard-friendly). */
  protected onEnter(e: KeyboardEvent): void {
    const el = e.target as HTMLElement;
    if (el.tagName !== 'INPUT') return;
    e.preventDefault();
    this.submit();
  }

  protected submit(): void {
    const i = this.inst();
    if (!i || this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.actions.pay(
      i,
      { amount: numberToMoney(v.amount), paidOn: pickerToIso(v.paidOn)!, method: v.method },
      () => this.saving.set(false),
    );
  }
}
