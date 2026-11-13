import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { METHOD_LABEL, enumOptions } from '../core/labels';
import { InstallmentDto, PaymentMethod } from '../core/models';
import { localTodayIso, isoToPicker, pickerToIso } from '../core/dates';
import { moneyToNumber, numberToMoney, subMoney, toCents } from '../core/money';
import { ActionsService } from './actions.service';
import { fileProblem, formatSize } from './document-files';
import { DocumentsService } from './documents.service';
import { FeedbackService } from './feedback.service';
import { FileDropComponent } from './file-drop.component';
import { BrlPipe, DateBrPipe } from './pipes';

/**
 * The one payment dialog, opened from any list or the dashboard. The contract
 * and projected amounts stay visible while typing (rule 8); Enter confirms (rule 2).
 */
@Component({
  selector: 'app-payment-dialog',
  imports: [ReactiveFormsModule, DialogModule, ButtonModule, DatePickerModule, InputNumberModule, SelectModule, ProgressBarModule, FileDropComponent, BrlPipe, DateBrPipe],
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

        @if (phase() !== 'form') {
          <section class="receipt-status" aria-live="polite">
            <p class="receipt-status__ok"><i class="pi pi-check-circle" aria-hidden="true"></i> Pagamento registrado.</p>
            @if (phase() === 'uploading') {
              <p>Enviando o comprovante <strong>{{ receipt()?.name }}</strong>…</p>
              <p-progressbar [value]="progress()" [showValue]="false" [attr.aria-label]="'Enviando comprovante: ' + progress() + '%'" />
            } @else {
              <p class="receipt-status__err" role="alert">
                <i class="pi pi-exclamation-triangle" aria-hidden="true"></i>
                O comprovante não foi enviado: {{ uploadError() }}
              </p>
              <p class="muted">Você pode tentar de novo agora ou anexá-lo depois, pelo clipe da parcela.</p>
              <div class="actions">
                <p-button type="button" label="Fechar" severity="secondary" [text]="true" (onClick)="actions.closePayment()" />
                <p-button type="button" label="Tentar enviar de novo" icon="pi pi-refresh" (onClick)="uploadReceipt(i)" />
              </div>
            }
          </section>
        } @else {
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

          <span class="label">Anexar comprovante <span class="muted">(opcional)</span></span>
          @if (receipt(); as f) {
            <div class="picked">
              <i class="pi pi-file" aria-hidden="true"></i>
              <span class="picked__name">{{ f.name }} <span class="muted">{{ size(f.size) }}</span></span>
              <p-button icon="pi pi-times" size="small" severity="secondary" [text]="true" ariaLabel="Remover comprovante" (onClick)="receipt.set(null)" />
            </div>
          } @else {
            <app-file-drop [compact]="true" [multiple]="false" title="Solte o comprovante aqui" hint="PDF ou foto, até 20 MB."
              buttonLabel="Escolher arquivo" (files)="pickReceipt($event)" />
          }
          @if (receiptProblem(); as p) { <small class="err" role="alert">{{ p }}</small> }
          @if (i.documentCount > 0) { <small class="muted">Esta parcela já tem {{ i.documentCount }} documento(s) anexado(s).</small> }

          <div class="actions">
            <p-button type="button" label="Cancelar" severity="secondary" [text]="true" (onClick)="actions.closePayment()" />
            <p-button type="submit" label="Confirmar pagamento" icon="pi pi-check" [disabled]="form.invalid" [loading]="saving()" />
          </div>
        </form>
        }
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
    .label { font-weight: 500; margin-top: 0.5rem; }
    .picked { display: flex; align-items: center; gap: 0.5rem; border: 1px solid var(--line); border-radius: 10px; padding: 0.4rem 0.6rem; background: var(--surface-2); }
    .picked__name { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .err { color: var(--danger); }
    .receipt-status { display: grid; gap: 0.6rem; }
    .receipt-status p { margin: 0; }
    .receipt-status__ok { color: var(--ok); font-weight: 600; }
    .receipt-status__err { color: var(--danger); }
    .actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem; }
  `,
})
export class PaymentDialogComponent {
  protected readonly actions = inject(ActionsService);
  private readonly fb = inject(FormBuilder);

  private readonly docs = inject(DocumentsService);
  private readonly feedback = inject(FeedbackService);

  protected readonly inst = this.actions.paying;
  protected readonly receipt = signal<File | null>(null);
  protected readonly receiptProblem = signal<string | null>(null);
  protected readonly phase = signal<'form' | 'uploading' | 'failed'>('form');
  protected readonly progress = signal(0);
  protected readonly uploadError = signal('');
  protected readonly size = formatSize;
  private paidOn = '';
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
      this.receipt.set(null);
      this.receiptProblem.set(null);
      this.phase.set('form');
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

  protected pickReceipt(files: File[]): void {
    const f = files[0];
    const problem = f ? fileProblem(f) : null;
    this.receiptProblem.set(problem);
    this.receipt.set(problem ? null : (f ?? null));
  }

  protected submit(): void {
    const i = this.inst();
    if (!i || this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const input = { amount: numberToMoney(v.amount), paidOn: pickerToIso(v.paidOn)!, method: v.method };
    this.paidOn = input.paidOn;
    this.saving.set(true);
    const hasReceipt = !!this.receipt();
    // With a receipt the dialog stays open after the payment so the upload can show progress or an error.
    this.actions.pay(i, input, () => this.saving.set(false), {
      keepOpen: hasReceipt,
      onPaid: () => hasReceipt && this.uploadReceipt(i),
    });
  }

  /** Creates the PAYMENT_RECEIPT document linked to the installment (payment is already saved). */
  protected uploadReceipt(i: InstallmentDto): void {
    const file = this.receipt();
    if (!file) return;
    this.phase.set('uploading');
    this.progress.set(0);
    this.docs
      .upload(
        file,
        {
          title: `Comprovante · ${i.obligationName} ${i.seq}/${i.count}`,
          category: 'PAYMENT_RECEIPT',
          documentDate: this.paidOn,
          installmentId: i.id,
        },
        (f) => this.progress.set(Math.round(f * 100)),
      )
      .subscribe({
        next: (doc) => {
          this.feedback.success('Comprovante anexado', doc.title);
          this.actions.closePayment();
        },
        error: (e) => {
          this.uploadError.set(e?.error?.detail && typeof e.error.detail === 'string' ? e.error.detail : (e?.message ?? 'tente novamente.'));
          this.phase.set('failed');
        },
      });
  }
}
