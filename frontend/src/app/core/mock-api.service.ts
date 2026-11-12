import { Injectable } from '@angular/core';
import { Observable, delay, of, throwError } from 'rxjs';
import { ApiService } from './api.service';
import { addDays, addMonths, diffDays, localTodayIso, monthKey, nextMonthKey } from './dates';
import {
  DashboardDto, InstallmentDto, InstallmentFilter, InstallmentStatus, IsoDate, MilestoneDto,
  MilestoneKey, MilestoneUpdateResult, Money, ObligationDetailDto, ObligationDto, ObligationInput,
  PaymentDto, PaymentInput, SettingsDto, TaskDto, TaskFilter, TaskInput,
} from './models';
import { addMoney, compareMoney, scaleMoney, subMoney, toCents } from './money';
import { MILESTONE_LABELS } from './milestone-labels';

interface InstallmentRecord {
  id: string;
  obligationId: string;
  seq: number;
  count: number;
  dueDate: IsoDate;
  expectedAmount: Money;
  payment: PaymentDto | null;
}

const BASE_MONTH = '2026-08';

/** In-memory implementation of the API contract with realistic data for the Aura Humaitá 166 purchase. */
@Injectable()
export class MockApiService extends ApiService {
  latencyMs = 120;
  /** Overridable in tests. */
  clock: () => IsoDate = () => localTodayIso();

  private seq = 100;
  private obligationsById = new Map<string, ObligationInput & { id: string }>();
  private installmentsByObligation = new Map<string, InstallmentRecord[]>();
  private milestoneList: MilestoneDto[] = [];
  private taskList: TaskDto[] = [];
  private settingsValue: SettingsDto = {
    monthlyCapacity: '6000.00',
    inccMonthlyEstimate: '0.50',
    igpmMonthlyEstimate: '0.45',
    dueSoonDays: 7,
  };

  constructor() {
    super();
    this.seed();
  }

  // ---------------------------------------------------------------- dashboard
  dashboard(): Observable<DashboardDto> {
    return this.respond(() => {
      const all = this.allInstallments();
      const today = this.clock();
      const horizon = addDays(today, 30);
      const unpaid = all.filter((i) => i.status !== 'PAID');
      const overdue = unpaid.filter((i) => i.status === 'OVERDUE').sort(byDue);
      const upcoming = unpaid
        .filter((i) => i.status !== 'OVERDUE' && i.dueDate <= horizon)
        .sort(byDue);
      const expected = addMoney(...all.map((i) => i.expectedAmount));
      const paid = addMoney(...all.map((i) => i.payment?.amount));
      const overdueSum = addMoney(...overdue.map((i) => i.projectedAmount));
      // projectedAmount already equals the amount paid for paid installments.
      const projected = addMoney(...all.map((i) => i.projectedAmount));
      const pending = subMoney(projected, paid);

      const byObligation = [...this.obligationsById.values()]
        .map((o) => {
          const list = all.filter((i) => i.obligationId === o.id);
          return {
            obligationId: o.id,
            name: o.name,
            expected: addMoney(...list.map((i) => i.expectedAmount)),
            projected: addMoney(...list.map((i) => i.projectedAmount)),
            paid: addMoney(...list.map((i) => i.payment?.amount)),
            pending: addMoney(...list.filter((i) => i.status !== 'PAID').map((i) => i.projectedAmount)),
          };
        })
        .filter((o) => toCents(o.expected) > 0n);

      const key = this.milestoneList.find((m) => m.key === 'KEY_DELIVERY');
      const lastMonth = monthKey(key?.actualDate ?? key?.expectedDate ?? addMonths(today, 12));
      const dated = all.filter((i) => monthKey(i.dueDate) <= lastMonth);
      const monthly: DashboardDto['monthly'] = [];
      if (dated.length) {
        let m = dated.map((i) => monthKey(i.dueDate)).sort()[0];
        for (; m <= lastMonth; m = nextMonthKey(m)) {
          const inMonth = dated.filter((i) => monthKey(i.dueDate) === m);
          monthly.push({
            month: m,
            expected: addMoney(...inMonth.map((i) => i.expectedAmount)),
            paid: addMoney(...inMonth.map((i) => i.payment?.amount)),
          });
        }
      }

      const currentMonth = monthKey(today);
      const commitment = addMoney(
        ...all
          .filter((i) => monthKey(i.dueDate) === currentMonth)
          .map((i) => i.payment?.amount ?? i.projectedAmount),
      );

      return {
        totals: { expected, projected, projectedCorrection: subMoney(projected, expected), paid, pending, overdue: overdueSum },
        upcoming,
        overdue,
        byObligation,
        monthly,
        capacity: {
          monthlyCapacity: this.settingsValue.monthlyCapacity,
          currentMonthCommitment: commitment,
          exceeded: compareMoney(commitment, this.settingsValue.monthlyCapacity) > 0,
        },
        nextTasks: this.sortedOpenTasks().slice(0, 5),
      };
    });
  }

  // ------------------------------------------------------------- installments
  installments(filter: InstallmentFilter = {}): Observable<InstallmentDto[]> {
    return this.respond(() =>
      this.allInstallments()
        .filter((i) => {
          if (filter.status === 'OPEN') return i.status !== 'PAID';
          return !filter.status || i.status === filter.status;
        })
        .filter((i) => !filter.obligationId || i.obligationId === filter.obligationId)
        .filter((i) => !filter.from || i.dueDate >= filter.from)
        .filter((i) => !filter.to || i.dueDate <= filter.to)
        .sort(byDue),
    );
  }

  payInstallment(id: string, input: PaymentInput): Observable<InstallmentDto> {
    return this.respond(() => {
      const rec = this.findRecord(id);
      if (rec.payment) throw new Error('Parcela já paga');
      rec.payment = { ...input, receiptPath: null };
      return this.toDto(rec);
    });
  }

  undoPayment(id: string): Observable<InstallmentDto> {
    return this.respond(() => {
      const rec = this.findRecord(id);
      rec.payment = null;
      return this.toDto(rec);
    });
  }

  // -------------------------------------------------------------- obligations
  obligations(): Observable<ObligationDto[]> {
    return this.respond(() => [...this.obligationsById.values()].map((o) => this.obligationDto(o)));
  }

  obligation(id: string): Observable<ObligationDetailDto> {
    return this.respond(() => {
      const o = this.obligationsById.get(id);
      if (!o) throw new Error('Obrigação não encontrada');
      return {
        ...this.obligationDto(o),
        installments: (this.installmentsByObligation.get(id) ?? []).map((r) => this.toDto(r)),
      };
    });
  }

  createObligation(input: ObligationInput): Observable<ObligationDto> {
    return this.respond(() => {
      const id = `ob-${++this.seq}`;
      const o = { ...input, id };
      this.obligationsById.set(id, o);
      this.regenerate(o);
      return this.obligationDto(o);
    });
  }

  updateObligation(id: string, input: ObligationInput): Observable<ObligationDto> {
    return this.respond(() => {
      if (!this.obligationsById.has(id)) throw new Error('Obrigação não encontrada');
      const o = { ...input, id };
      this.obligationsById.set(id, o);
      this.regenerate(o);
      return this.obligationDto(o);
    });
  }

  deleteObligation(id: string): Observable<void> {
    return this.respond(() => {
      this.obligationsById.delete(id);
      this.installmentsByObligation.delete(id);
    });
  }

  // --------------------------------------------------------------- milestones
  milestones(): Observable<MilestoneDto[]> {
    return this.respond(() => [...this.milestoneList]);
  }

  updateMilestone(
    key: MilestoneKey,
    body: { expectedDate: IsoDate | null; actualDate: IsoDate | null },
  ): Observable<MilestoneUpdateResult> {
    return this.respond(() => {
      const idx = this.milestoneList.findIndex((m) => m.key === key);
      if (idx < 0) throw new Error('Marco não encontrado');
      const milestone: MilestoneDto = { ...this.milestoneList[idx], ...body };
      this.milestoneList[idx] = milestone;
      return { milestone, effects: this.applyMilestoneRules(milestone) };
    });
  }

  // -------------------------------------------------------------------- tasks
  tasks(filter: TaskFilter = {}): Observable<TaskDto[]> {
    return this.respond(() =>
      this.taskList
        .filter((t) => !filter.phase || t.phase === filter.phase)
        .filter((t) => filter.open === undefined || (filter.open ? !t.doneAt : !!t.doneAt))
        .map((t) => ({ ...t })),
    );
  }

  createTask(input: TaskInput): Observable<TaskDto> {
    return this.respond(() => {
      const task: TaskDto = { ...input, id: `t-${++this.seq}`, doneAt: null, source: 'MANUAL' };
      this.taskList.push(task);
      return { ...task };
    });
  }

  updateTask(id: string, input: TaskInput): Observable<TaskDto> {
    return this.respond(() => {
      const t = this.findTask(id);
      Object.assign(t, { doneAt: null, ...input });
      return { ...t };
    });
  }

  deleteTask(id: string): Observable<void> {
    return this.respond(() => {
      this.taskList = this.taskList.filter((t) => t.id !== id);
    });
  }

  toggleTask(id: string): Observable<TaskDto> {
    return this.respond(() => {
      const t = this.findTask(id);
      t.doneAt = t.doneAt ? null : this.clock();
      return { ...t };
    });
  }

  // ----------------------------------------------------------------- settings
  settings(): Observable<SettingsDto> {
    return this.respond(() => ({ ...this.settingsValue }));
  }

  updateSettings(input: SettingsDto): Observable<SettingsDto> {
    return this.respond(() => {
      this.settingsValue = { ...input };
      return { ...this.settingsValue };
    });
  }

  // ------------------------------------------------------------------ helpers
  private respond<T>(fn: () => T): Observable<T> {
    let value: T;
    try {
      value = fn();
    } catch (e) {
      return throwError(() => e);
    }
    const out = of(structuredClone(value));
    return this.latencyMs > 0 ? out.pipe(delay(this.latencyMs)) : out;
  }

  private findRecord(id: string): InstallmentRecord {
    for (const list of this.installmentsByObligation.values()) {
      const r = list.find((x) => x.id === id);
      if (r) return r;
    }
    throw new Error('Parcela não encontrada');
  }

  private findTask(id: string): TaskDto {
    const t = this.taskList.find((x) => x.id === id);
    if (!t) throw new Error('Tarefa não encontrada');
    return t;
  }

  private allInstallments(): InstallmentDto[] {
    return [...this.installmentsByObligation.values()].flat().map((r) => this.toDto(r));
  }

  private toDto(r: InstallmentRecord): InstallmentDto {
    const o = this.obligationsById.get(r.obligationId)!;
    const today = this.clock();
    let status: InstallmentStatus = 'PENDING';
    if (r.payment) status = 'PAID';
    else if (r.dueDate < today) status = 'OVERDUE';
    else if (diffDays(today, r.dueDate) <= this.settingsValue.dueSoonDays) status = 'DUE_SOON';
    return {
      id: r.id,
      obligationId: r.obligationId,
      obligationName: o.name,
      seq: r.seq,
      count: r.count,
      dueDate: r.dueDate,
      expectedAmount: r.expectedAmount,
      projectedAmount: r.payment ? r.payment.amount : this.project(o, r),
      status,
      payment: r.payment ? { ...r.payment } : null,
    };
  }

  /** INCC-DI / IGP-M projection with one month of lag, compounding the configured monthly estimate. */
  private project(o: ObligationInput, r: InstallmentRecord): Money {
    if (o.correctionIndex === 'NONE') return r.expectedAmount;
    const rate =
      Number(o.correctionIndex === 'INCC_DI' ? this.settingsValue.inccMonthlyEstimate : this.settingsValue.igpmMonthlyEstimate) / 100;
    const [by, bm] = BASE_MONTH.split('-').map(Number);
    const [dy, dm] = monthKey(r.dueDate).split('-').map(Number);
    const months = Math.max(0, (dy - by) * 12 + (dm - bm) - 1);
    return scaleMoney(r.expectedAmount, Math.pow(1 + rate, months));
  }

  private obligationDto(o: ObligationInput & { id: string }): ObligationDto {
    const list = this.installmentsByObligation.get(o.id) ?? [];
    const totalExpected = list.length
      ? addMoney(...list.map((r) => r.expectedAmount))
      : o.periodicity === 'ONCE' ? o.amount : '0.00';
    return {
      ...o,
      totalExpected,
      totalPaid: addMoney(...list.map((r) => r.payment?.amount)),
    };
  }

  private anchorDate(key: MilestoneKey | null): IsoDate | null {
    const m = this.milestoneList.find((x) => x.key === key);
    return m ? (m.actualDate ?? m.expectedDate) : null;
  }

  /** Rebuilds unpaid installments from the schedule rule; paid ones are never touched. */
  private regenerate(o: ObligationInput & { id: string }): void {
    const old = this.installmentsByObligation.get(o.id) ?? [];
    const first = o.firstDueDate ?? (() => {
      const a = this.anchorDate(o.anchorMilestone);
      return a ? addDays(a, o.offsetDays) : null;
    })();
    const generated: InstallmentRecord[] = [];
    if (first) {
      const count = o.periodicity === 'ONCE' ? 1 : (o.count ?? (o.periodicity === 'OPEN_ENDED' ? 12 : 1));
      for (let i = 0; i < count; i++) {
        const dueDate =
          o.periodicity === 'ANNUAL' ? addMonths(first, 12 * i)
          : o.periodicity === 'ONCE' ? first
          : addMonths(first, i, o.dayOfMonth ?? undefined);
        generated.push({
          id: `${o.id}-${i + 1}`,
          obligationId: o.id,
          seq: i + 1,
          count,
          dueDate,
          expectedAmount: o.amounts?.[i] ?? o.amount,
          payment: null,
        });
      }
    }
    const merged = generated.map((g) => old.find((p) => p.seq === g.seq && p.payment) ?? g);
    // Paid installments that no longer fit the rule are kept so history is never lost.
    for (const p of old) if (p.payment && !merged.some((m) => m.id === p.id)) merged.push(p);
    this.installmentsByObligation.set(o.id, merged.sort((a, b) => a.seq - b.seq));
  }

  private applyMilestoneRules(m: MilestoneDto): string[] {
    const effects: string[] = [];
    const date = m.actualDate ?? m.expectedDate;
    const fmt = (iso: string) => iso.split('-').reverse().join('/');
    for (const o of this.obligationsById.values()) {
      if (o.anchorMilestone !== m.key) continue;
      this.regenerate(o);
      const next = (this.installmentsByObligation.get(o.id) ?? []).find((r) => !r.payment);
      effects.push(
        next
          ? `${o.name}: vencimento ajustado para ${fmt(next.dueDate)}.`
          : `${o.name}: aguardando a data deste marco para gerar parcelas.`,
      );
    }
    const registryTitle = 'Apresentar matrícula atualizada à Prefeitura de Santo André';
    if (m.key === 'CONTRACT_REGISTERED' && !date) {
      // Clearing the date removes the rule task while it is still open.
      const open = this.taskList.find((t) => t.source === 'RULE' && t.title === registryTitle && !t.doneAt);
      if (open) {
        this.taskList = this.taskList.filter((t) => t !== open);
        effects.push(`Tarefa "${registryTitle}" removida.`);
      }
    }
    if (!date) return effects;
    const ruleTask = (title: string, offset: number, phase: TaskDto['phase'], notes: string | null = null) => {
      const due = addDays(date, offset);
      const existing = this.taskList.find((t) => t.source === 'RULE' && t.title === title);
      if (existing) existing.dueDate = due;
      else this.taskList.push({ id: `t-${++this.seq}`, title, phase, dueDate: due, doneAt: null, notes, obligationId: null, installmentId: null, source: 'RULE' });
      effects.push(`Tarefa "${title}" com prazo em ${fmt(due)}.`);
    };
    if (m.key === 'CONTRACT_REGISTERED') {
      ruleTask(registryTitle, 30, 'SIGNING', 'Atraso na apresentação da matrícula gera multa do ITBI.');
    }
    if (m.key === 'DOCS_CALL') ruleTask('Entregar a documentação solicitada pela construtora', 10, 'SIGNING');
    if (m.key === 'INSPECTION_CALL') {
      ruleTask('Realizar a vistoria do apartamento', 7, 'KEY_DELIVERY');
      effects.push(`Assistência técnica de 3 meses agendada até ${fmt(addMonths(date, 3))}.`);
    }
    if (m.key === 'HABITE_SE') effects.push('Parcelas em aberto passam a ser corrigidas por IGP-M + juros de 1% ao mês.');
    if (m.key === 'FINANCING_SIGNED') effects.push('Juros de obra iniciam a contar desta data.');
    return effects;
  }

  private sortedOpenTasks(): TaskDto[] {
    return this.taskList
      .filter((t) => !t.doneAt)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
      .map((t) => ({ ...t }));
  }

  // --------------------------------------------------------------------- seed
  private seed(): void {
    const day = (m: MilestoneKey, expectedDate: IsoDate | null): MilestoneDto => ({
      key: m, label: MILESTONE_LABELS[m], expectedDate, actualDate: null,
    });
    this.milestoneList = [
      day('FINANCING_SIGNED', null),
      day('CONTRACT_REGISTERED', null),
      day('DOCS_CALL', null),
      day('HABITE_SE', '2028-01-31'),
      day('INSPECTION_CALL', null),
      day('KEY_DELIVERY', '2028-02-28'),
    ];

    const base = {
      status: 'CONTRACTED' as const, fundingSource: 'OWN' as const, correctionIndex: 'NONE' as const,
      count: 1, amounts: null, dayOfMonth: null, firstDueDate: null, anchorMilestone: null,
      offsetDays: 0, notes: null,
    };
    const add = (o: Partial<ObligationInput> & Pick<ObligationInput, 'name' | 'payee' | 'category' | 'periodicity' | 'amount'>, id: string) => {
      const full = { ...base, ...o, id } as ObligationInput & { id: string };
      this.obligationsById.set(id, full);
      this.regenerate(full);
    };

    add({
      name: 'Corretagem', payee: 'Arara Soluções Imobiliárias', category: 'BROKERAGE', periodicity: 'MONTHLY',
      count: 6, amount: '2548.00', amounts: ['2548.00', '2548.00', '2548.00', '2548.00', '2548.00', '2545.60'],
      dayOfMonth: 15, firstDueDate: '2026-08-15',
    }, 'ob-corretagem');
    add({
      name: 'Parcelas anuais', payee: 'Construtora', category: 'BUILDER_INSTALLMENT', periodicity: 'ANNUAL',
      count: 2, amount: '10000.00', firstDueDate: '2026-12-31', correctionIndex: 'INCC_DI',
    }, 'ob-anuais');
    add({
      name: 'Mensais 1', payee: 'Construtora', category: 'BUILDER_INSTALLMENT', periodicity: 'MONTHLY',
      count: 6, amount: '1500.00', dayOfMonth: 16, firstDueDate: '2027-02-16', correctionIndex: 'INCC_DI',
    }, 'ob-mensais-1');
    add({
      name: 'Mensais 2', payee: 'Construtora', category: 'BUILDER_INSTALLMENT', periodicity: 'MONTHLY',
      count: 7, amount: '1000.00', dayOfMonth: 16, firstDueDate: '2027-08-16', correctionIndex: 'INCC_DI',
    }, 'ob-mensais-2');
    add({
      name: 'Parcela das chaves', payee: 'Construtora', category: 'BUILDER_INSTALLMENT', periodicity: 'ONCE',
      amount: '28854.08', anchorMilestone: 'KEY_DELIVERY', correctionIndex: 'INCC_DI',
      notes: 'Vence na entrega das chaves (previsão 28/02/2028).',
    }, 'ob-chaves');
    add({
      name: 'Financiamento Caixa', payee: 'Caixa Econômica Federal', category: 'FINANCING', periodicity: 'ONCE',
      status: 'ESTIMATED', fundingSource: 'FINANCING', amount: '302000.40', anchorMilestone: 'KEY_DELIVERY', offsetDays: 2,
      notes: 'Valor estimado; será recalculado quando o financiamento for contratado.',
    }, 'ob-financiamento');
    add({
      name: 'Juros de obra', payee: 'Caixa Econômica Federal', category: 'CONSTRUCTION_INTEREST', periodicity: 'OPEN_ENDED',
      status: 'ESTIMATED', amount: '0.00', dayOfMonth: 10, anchorMilestone: 'FINANCING_SIGNED', count: null,
      notes: 'Valor real informado manualmente a cada mês.',
    }, 'ob-juros');
    add({
      name: 'Condomínio e IPTU', payee: 'Condomínio / Prefeitura', category: 'CONDO_IPTU', periodicity: 'OPEN_ENDED',
      status: 'ESTIMATED', amount: '0.00', dayOfMonth: 10, anchorMilestone: 'INSPECTION_CALL', count: null,
    }, 'ob-condominio');
    add({
      name: 'ITBI', payee: 'Prefeitura de Santo André', category: 'FEE_TAX', periodicity: 'ONCE',
      amount: '4758.78', firstDueDate: '2026-11-30',
    }, 'ob-itbi');
    add({
      name: 'Registro do contrato (cartório)', payee: 'Cartório de Registro de Imóveis', category: 'FEE_TAX', periodicity: 'ONCE',
      status: 'ESTIMATED', amount: '0.00', anchorMilestone: 'FINANCING_SIGNED',
      notes: 'Valor ainda a definir.',
    }, 'ob-registro');
    add({
      name: 'Documentista', payee: 'Documentista', category: 'FEE_TAX', periodicity: 'ONCE',
      amount: '1500.00', firstDueDate: '2026-08-25',
    }, 'ob-documentista');
    add({
      name: 'Tarifa de avaliação Caixa', payee: 'Caixa Econômica Federal', category: 'FEE_TAX', periodicity: 'ONCE',
      amount: '1600.00', firstDueDate: '2026-08-12',
    }, 'ob-avaliacao');

    const pay = (id: string, paidOn: IsoDate, amount: Money, method: PaymentDto['method']) => {
      this.findRecord(id).payment = { paidOn, amount, method, receiptPath: null };
    };
    pay('ob-corretagem-1', '2026-08-15', '2548.00', 'PIX');
    pay('ob-corretagem-2', '2026-09-15', '2548.00', 'PIX');
    pay('ob-corretagem-3', '2026-10-15', '2548.00', 'PIX');
    pay('ob-documentista-1', '2026-08-25', '1500.00', 'PIX');
    pay('ob-avaliacao-1', '2026-08-12', '1600.00', 'DEBIT');

    const t = (id: string, phase: TaskDto['phase'], title: string, dueDate: IsoDate | null, doneAt: IsoDate | null = null, source: TaskDto['source'] = 'TEMPLATE', notes: string | null = null): TaskDto => ({
      id, phase, title, dueDate, doneAt, notes, obligationId: null, installmentId: null, source,
    });
    this.taskList = [
      t('t-1', 'PRE_CONTRACT', 'Conferir a minuta do contrato com a construtora', '2026-08-07', '2026-08-06'),
      t('t-2', 'PRE_CONTRACT', 'Guardar comprovantes da corretagem e do sinal', null, '2026-10-16'),
      t('t-3', 'CREDIT_APPROVAL', 'Reunir documentos para análise de crédito na Caixa', '2026-11-20'),
      t('t-4', 'CREDIT_APPROVAL', 'Acompanhar a aprovação do crédito imobiliário', '2026-12-15'),
      t('t-5', 'SIGNING', 'Assinar o contrato de financiamento na Caixa', null),
      t('t-6', 'SIGNING', 'Registrar a escritura no cartório', null),
      t('t-12', 'SIGNING', 'Pagar ITBI', '2026-11-15'),
      t('t-7', 'CONSTRUCTION', 'Conferir a correção INCC-DI no boleto de novembro', '2026-11-14', null, 'MANUAL'),
      t('t-8', 'CONSTRUCTION', 'Acompanhar o andamento da obra (relatório trimestral)', '2026-12-20'),
      t('t-9', 'KEY_DELIVERY', 'Agendar a vistoria do apartamento', null),
      t('t-10', 'KEY_DELIVERY', 'Solicitar a ligação de água e luz em nome do proprietário', null),
      t('t-11', 'POST_DELIVERY', 'Acionar a assistência técnica dentro de 3 meses', null),
    ];
  }
}

function byDue(a: InstallmentDto, b: InstallmentDto): number {
  return a.dueDate.localeCompare(b.dueDate) || a.obligationName.localeCompare(b.obligationName);
}
