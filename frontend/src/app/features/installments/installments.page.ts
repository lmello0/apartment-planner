import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ApiService } from '../../core/api.service';
import { InstallmentDto, InstallmentFilter, ObligationDto } from '../../core/models';
import { addMoney } from '../../core/money';
import { ActionsService } from '../../shared/actions.service';
import { InstallmentListComponent } from '../../shared/installment-list.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { BrlPipe } from '../../shared/pipes';

type FilterKey = 'OPEN' | 'PAID' | 'OVERDUE' | 'ALL';

@Component({
  selector: 'app-installments-page',
  imports: [FormsModule, SelectButtonModule, SelectModule, InstallmentListComponent, PageHeaderComponent, BrlPipe],
  template: `
    <app-page-header title="Parcelas" subtitle="Tudo o que vence, em ordem de data" [crumbs]="[{ label: 'Parcelas' }]" />

    <div class="filters">
      <p-selectbutton [options]="options" [ngModel]="filter()" (ngModelChange)="setFilter($event)"
        optionLabel="label" optionValue="value" [allowEmpty]="false" aria-label="Filtrar parcelas" />
      <p-select [options]="obligations()" [ngModel]="obligationId()" (ngModelChange)="setObligation($event)"
        optionLabel="name" optionValue="id" placeholder="Todas as obrigações" [showClear]="true" ariaLabel="Filtrar por obrigação" />
    </div>

    <section class="card" aria-live="polite">
      <h2>
        {{ items().length }} parcela(s)
        <span class="muted num">{{ total() | brl }}</span>
      </h2>
      @if (loaded()) {
        <app-installment-list [items]="items()" [emptyText]="empty()" />
      } @else {
        <p class="muted" role="status">Carregando…</p>
      }
    </section>
  `,
  styles: `
    .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
    :host ::ng-deep .p-selectbutton { flex-wrap: wrap; }
    h2 .muted { font-weight: 400; font-size: 0.9375rem; }
  `,
})
export class InstallmentsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly actions = inject(ActionsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly options: { label: string; value: FilterKey }[] = [
    { label: 'A pagar', value: 'OPEN' },
    { label: 'Pagas', value: 'PAID' },
    { label: 'Atrasadas', value: 'OVERDUE' },
    { label: 'Todas', value: 'ALL' },
  ];
  protected readonly filter = signal<FilterKey>('OPEN');
  protected readonly obligationId = signal<string | null>(null);
  protected readonly items = signal<InstallmentDto[]>([]);
  protected readonly obligations = signal<ObligationDto[]>([]);
  protected readonly loaded = signal(false);

  protected readonly total = computed(() =>
    addMoney(...this.items().map((i) => i.payment?.amount ?? i.projectedAmount)),
  );
  protected readonly empty = computed(
    () =>
      ({
        OPEN: 'Tudo em dia: não há parcelas a pagar.',
        PAID: 'Nenhuma parcela paga ainda.',
        OVERDUE: 'Nenhuma parcela atrasada. Ótimo!',
        ALL: 'Nenhuma parcela cadastrada.',
      })[this.filter()],
  );

  ngOnInit(): void {
    this.api.obligations().subscribe((o) => this.obligations.set(o));
    this.load();
    this.actions.changed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  protected setFilter(f: FilterKey): void {
    this.filter.set(f);
    this.load();
  }

  protected setObligation(id: string | null): void {
    this.obligationId.set(id);
    this.load();
  }

  private load(): void {
    const f: InstallmentFilter = {};
    if (this.filter() !== 'ALL') f.status = this.filter() as InstallmentFilter['status'];
    if (this.obligationId()) f.obligationId = this.obligationId()!;
    this.api.installments(f).subscribe((list) => {
      this.items.set(list);
      this.loaded.set(true);
    });
  }
}
