import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TextareaModule } from 'primeng/textarea';
import { ApiService } from '../../core/api.service';
import { isoToPicker, pickerToIso } from '../../core/dates';
import {
  CATEGORY_LABEL, CORRECTION_LABEL, FUNDING_LABEL, OBLIGATION_STATUS, PERIODICITY_LABEL, enumOptions,
} from '../../core/labels';
import { MILESTONE_LABELS } from '../../core/milestone-labels';
import {
  CorrectionIndex, FundingSource, MilestoneKey, ObligationCategory, ObligationInput, ObligationStatus, Periodicity,
} from '../../core/models';
import { fromCents, isValidMoney, moneyToNumber, numberToMoney, toCents } from '../../core/money';
import { FeedbackService } from '../../shared/feedback.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

/** Parses "2548,00" / "2.548,00" / "2548.00" into a decimal string, or null when invalid. */
export function parseBrMoney(raw: string): string | null {
  const t = raw.trim().replace(/^R\$\s*/, '');
  if (!t) return null;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  return isValidMoney(normalized) ? fromCents(toCents(normalized)) : null;
}

function amountsValidator(group: AbstractControl): ValidationErrors | null {
  const text = (group.get('amountsText')?.value ?? '') as string;
  if (!text.trim()) return null;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.some((l) => parseBrMoney(l) === null)) return { amountsFormat: true };
  const count = group.get('count')?.value as number | null;
  const periodicity = group.get('periodicity')?.value as Periodicity;
  const expected = periodicity === 'ONCE' ? 1 : count;
  if (expected && lines.length !== expected) return { amountsCount: { expected, got: lines.length } };
  return null;
}

function startValidator(group: AbstractControl): ValidationErrors | null {
  const mode = group.get('startMode')?.value;
  if (mode === 'DATE' && !group.get('firstDueDate')?.value) return { startDate: true };
  if (mode === 'MILESTONE' && !group.get('anchorMilestone')?.value) return { startMilestone: true };
  return null;
}

@Component({
  selector: 'app-obligation-form-page',
  imports: [
    ReactiveFormsModule, ButtonModule, DatePickerModule, InputNumberModule, InputTextModule,
    MessageModule, SelectModule, SelectButtonModule, TextareaModule, PageHeaderComponent,
  ],
  templateUrl: './obligation-form.page.html',
})
export class ObligationFormPage implements OnInit {
  /** Route param; absent when creating. */
  readonly id = input<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly feedback = inject(FeedbackService);
  private readonly fb = inject(FormBuilder);

  protected readonly saving = signal(false);
  protected readonly editing = computed(() => !!this.id());
  protected readonly name = signal('');

  protected readonly categories = enumOptions<ObligationCategory>(CATEGORY_LABEL);
  protected readonly statuses = enumOptions<ObligationStatus>(OBLIGATION_STATUS);
  protected readonly fundings = enumOptions<FundingSource>(FUNDING_LABEL);
  protected readonly corrections = enumOptions<CorrectionIndex>(CORRECTION_LABEL);
  protected readonly periodicities = enumOptions<Periodicity>(PERIODICITY_LABEL);
  protected readonly milestones = enumOptions<MilestoneKey>(MILESTONE_LABELS);
  protected readonly startModes = [
    { label: 'Data fixa', value: 'DATE' },
    { label: 'A partir de um marco', value: 'MILESTONE' },
  ];

  protected readonly form = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.maxLength(120)]],
      payee: ['', [Validators.required, Validators.maxLength(120)]],
      category: ['OTHER' as ObligationCategory, Validators.required],
      status: ['CONTRACTED' as ObligationStatus, Validators.required],
      fundingSource: ['OWN' as FundingSource, Validators.required],
      correctionIndex: ['NONE' as CorrectionIndex, Validators.required],
      periodicity: ['MONTHLY' as Periodicity, Validators.required],
      count: [1 as number | null],
      amount: [0, [Validators.required, Validators.min(0)]],
      amountsText: [''],
      dayOfMonth: [null as number | null, [Validators.min(1), Validators.max(31)]],
      startMode: ['DATE' as 'DATE' | 'MILESTONE'],
      firstDueDate: [null as Date | null],
      anchorMilestone: [null as MilestoneKey | null],
      offsetDays: [0, Validators.required],
      notes: [''],
    },
    { validators: [amountsValidator, startValidator] },
  );

  protected readonly periodicity = signal<Periodicity>('MONTHLY');
  protected readonly startMode = signal<'DATE' | 'MILESTONE'>('DATE');

  protected readonly needsCount = computed(() => this.periodicity() === 'MONTHLY' || this.periodicity() === 'ANNUAL');
  protected readonly listPath = computed(() => (this.id() ? ['/obrigacoes', this.id()!] : ['/obrigacoes']));

  ngOnInit(): void {
    this.form.controls.periodicity.valueChanges.subscribe((p) => {
      this.periodicity.set(p);
      const count = this.form.controls.count;
      count.setValidators(p === 'MONTHLY' || p === 'ANNUAL' ? [Validators.required, Validators.min(1), Validators.max(480)] : []);
      count.updateValueAndValidity();
    });
    this.form.controls.startMode.valueChanges.subscribe((m) => this.startMode.set(m));
    this.form.controls.name.valueChanges.subscribe((n) => this.name.set(n));
    this.form.controls.periodicity.updateValueAndValidity();

    const id = this.id();
    if (id) {
      this.api.obligation(id).subscribe((o) => {
        this.name.set(o.name);
        this.form.reset({
          name: o.name, payee: o.payee, category: o.category, status: o.status, fundingSource: o.fundingSource,
          correctionIndex: o.correctionIndex, periodicity: o.periodicity, count: o.count,
          amount: moneyToNumber(o.amount),
          amountsText: (o.amounts ?? []).map((a) => a.replace('.', ',')).join('\n'),
          dayOfMonth: o.dayOfMonth,
          startMode: o.firstDueDate || !o.anchorMilestone ? 'DATE' : 'MILESTONE',
          firstDueDate: isoToPicker(o.firstDueDate), anchorMilestone: o.anchorMilestone,
          offsetDays: o.offsetDays, notes: o.notes ?? '',
        });
      });
    }
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const amounts = v.amountsText.trim()
      ? v.amountsText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => parseBrMoney(l)!)
      : null;
    const input: ObligationInput = {
      name: v.name.trim(), payee: v.payee.trim(), category: v.category, status: v.status,
      fundingSource: v.fundingSource, correctionIndex: v.correctionIndex, periodicity: v.periodicity,
      count: this.needsCount() ? v.count : v.periodicity === 'ONCE' ? 1 : null,
      amount: numberToMoney(v.amount), amounts,
      dayOfMonth: v.periodicity === 'ANNUAL' || v.periodicity === 'ONCE' ? null : v.dayOfMonth,
      firstDueDate: v.startMode === 'DATE' ? pickerToIso(v.firstDueDate) : null,
      anchorMilestone: v.startMode === 'MILESTONE' ? v.anchorMilestone : null,
      offsetDays: v.startMode === 'MILESTONE' ? v.offsetDays : 0,
      notes: v.notes.trim() || null,
    };
    this.saving.set(true);
    const req = this.id() ? this.api.updateObligation(this.id()!, input) : this.api.createObligation(input);
    req.subscribe({
      next: (o) => {
        this.feedback.success(
          this.id() ? 'Obrigação atualizada' : 'Obrigação criada',
          this.id() ? 'As parcelas não pagas foram regeneradas; as pagas ficaram como estavam.' : o.name,
        );
        void this.router.navigate(['/obrigacoes', o.id]);
      },
      error: () => this.saving.set(false),
    });
  }

  protected cancel(): void {
    void this.router.navigate(this.listPath());
  }
}
