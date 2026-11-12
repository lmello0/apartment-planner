import { firstValueFrom } from 'rxjs';
import { MockApiService } from './mock-api.service';
import { addMoney, compareMoney } from './money';

function make(today = '2026-11-11'): MockApiService {
  const api = new MockApiService();
  api.latencyMs = 0;
  api.clock = () => today;
  return api;
}

describe('MockApiService', () => {
  it('seeds brokerage with 3 of 6 paid and next due 15/11/2026', async () => {
    const api = make();
    const list = await firstValueFrom(api.installments({ obligationId: 'ob-corretagem' }));
    expect(list.length).toBe(6);
    expect(list.filter((i) => i.status === 'PAID').length).toBe(3);
    const open = await firstValueFrom(api.installments({ status: 'OPEN', obligationId: 'ob-corretagem' }));
    expect(open[0].dueDate).toBe('2026-11-15');
    expect(open[0].expectedAmount).toBe('2548.00');
    expect(open[0].status).toBe('DUE_SOON');
    expect(list[5].expectedAmount).toBe('2545.60');
  });

  it('filters by status', async () => {
    const api = make('2026-12-20');
    const overdue = await firstValueFrom(api.installments({ status: 'OVERDUE' }));
    expect(overdue.map((i) => i.dueDate)).toEqual(['2026-11-15', '2026-11-30', '2026-12-15']);
    const paid = await firstValueFrom(api.installments({ status: 'PAID' }));
    expect(paid.length).toBe(5);
    const open = await firstValueFrom(api.installments({ status: 'OPEN' }));
    expect(open.every((i) => i.status !== 'PAID')).toBeTrue();
    const range = await firstValueFrom(api.installments({ from: '2027-02-01', to: '2027-02-28' }));
    expect(range.map((i) => i.obligationName)).toEqual(['Mensais 1']);
  });

  it('pays and undoes a payment', async () => {
    const api = make();
    const before = await firstValueFrom(api.dashboard());
    const next = before.upcoming[0];
    const paid = await firstValueFrom(api.payInstallment(next.id, { paidOn: '2026-11-11', amount: '2548.00', method: 'PIX' }));
    expect(paid.status).toBe('PAID');
    const mid = await firstValueFrom(api.dashboard());
    expect(mid.totals.paid).toBe('13292.00');
    await firstValueFrom(api.undoPayment(next.id));
    const after = await firstValueFrom(api.dashboard());
    expect(after.totals.paid).toBe('10744.00');
  });

  it('dashboard reports paid total 10.744,00 and bounded monthly series', async () => {
    const d = await firstValueFrom(make().dashboard());
    expect(d.totals.paid).toBe('10744.00');
    expect(d.monthly[0].month).toBe('2026-08');
    expect(d.monthly[d.monthly.length - 1].month).toBe('2028-02');
    // November now carries Corretagem 4/6 + ITBI (R$ 4.758,78) against the R$ 6.000 capacity.
    expect(d.capacity.exceeded).toBeTrue();
  });

  it('clears the capacity flag when capacity grows', async () => {
    const api = make();
    const s = await firstValueFrom(api.settings());
    await firstValueFrom(api.updateSettings({ ...s, monthlyCapacity: '10000.00' }));
    expect((await firstValueFrom(api.dashboard())).capacity.exceeded).toBeFalse();
  });

  it('re-anchors unpaid installments when KEY_DELIVERY moves and reports effects', async () => {
    const api = make();
    const res = await firstValueFrom(api.updateMilestone('KEY_DELIVERY', { expectedDate: '2028-04-30', actualDate: null }));
    expect(res.effects.some((e) => e.includes('30/04/2028'))).toBeTrue();
    const keys = await firstValueFrom(api.installments({ obligationId: 'ob-chaves' }));
    expect(keys[0].dueDate).toBe('2028-04-30');
  });

  it('toggles tasks and lists open ones by phase', async () => {
    const api = make();
    const open = await firstValueFrom(api.tasks({ phase: 'CREDIT_APPROVAL', open: true }));
    expect(open.length).toBe(2);
    const t = await firstValueFrom(api.toggleTask(open[0].id));
    expect(t.doneAt).toBe('2026-11-11');
    expect((await firstValueFrom(api.tasks({ phase: 'CREDIT_APPROVAL', open: true }))).length).toBe(1);
  });

  it('keeps paid installments when an obligation is edited', async () => {
    const api = make();
    const o = await firstValueFrom(api.obligation('ob-corretagem'));
    const { installments, id, totalExpected, totalPaid, ...input } = o;
    void installments; void totalExpected; void totalPaid;
    await firstValueFrom(api.updateObligation(id, { ...input, firstDueDate: '2026-08-20', amounts: null, amount: '3000.00' }));
    const list = await firstValueFrom(api.installments({ obligationId: id }));
    expect(list.filter((i) => i.status === 'PAID').length).toBe(3);
    expect(list.find((i) => i.seq === 6)!.expectedAmount).toBe('3000.00');
  });

  it('dashboard separates contract value from projected correction', async () => {
    const t = (await firstValueFrom(make().dashboard())).totals;
    expect(t.projected).toBe(addMoney(t.expected, t.projectedCorrection));
    expect(t.projected).toBe(addMoney(t.paid, t.pending));
    expect(compareMoney(t.projectedCorrection, '0.00')).toBeGreaterThan(0);
    expect(compareMoney(t.pending, t.overdue)).toBeGreaterThanOrEqual(0);
  });

  it('mirrors the seed: ITBI due 30/11/2026, registry estimate and Pagar ITBI task', async () => {
    const api = make();
    const itbi = (await firstValueFrom(api.obligations())).find((o) => o.name === 'ITBI')!;
    expect(itbi.amount).toBe('4758.78');
    expect(itbi.status).toBe('CONTRACTED');
    const up = (await firstValueFrom(api.dashboard())).upcoming.map((i) => `${i.obligationName} ${i.dueDate}`);
    expect(up).toEqual(['Corretagem 2026-11-15', 'ITBI 2026-11-30']);
    const registry = (await firstValueFrom(api.obligations())).find((o) => o.name.startsWith('Registro do contrato'))!;
    expect(registry.status).toBe('ESTIMATED');
    const task = (await firstValueFrom(api.tasks())).find((x) => x.title === 'Pagar ITBI')!;
    expect(task.dueDate).toBe('2026-11-15');
  });

  it('CONTRACT_REGISTERED sits after FINANCING_SIGNED, creates the +30d rule task and removes it when cleared', async () => {
    const api = make();
    const keys = (await firstValueFrom(api.milestones())).map((m) => m.key);
    expect(keys.slice(0, 3)).toEqual(['FINANCING_SIGNED', 'CONTRACT_REGISTERED', 'DOCS_CALL']);
    const res = await firstValueFrom(api.updateMilestone('CONTRACT_REGISTERED', { expectedDate: null, actualDate: '2026-12-01' }));
    expect(res.effects.some((e) => e.includes('31/12/2026'))).toBeTrue();
    const title = 'Apresentar matrícula atualizada à Prefeitura de Santo André';
    expect((await firstValueFrom(api.tasks())).filter((x) => x.title === title).length).toBe(1);
    await firstValueFrom(api.updateMilestone('CONTRACT_REGISTERED', { expectedDate: null, actualDate: null }));
    expect((await firstValueFrom(api.tasks())).some((x) => x.title === title)).toBeFalse();
  });
});
