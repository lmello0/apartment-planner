import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ProgressBarModule } from 'primeng/progressbar';
import { ApiService } from '../../core/api.service';
import { CATEGORY_LABEL, CORRECTION_LABEL, FUNDING_LABEL, PERIODICITY_LABEL } from '../../core/labels';
import { ObligationDto } from '../../core/models';
import { moneyRatio } from '../../core/money';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { BrlPipe } from '../../shared/pipes';
import { StatusTagComponent } from '../../shared/status-tag.component';

@Component({
  selector: 'app-obligations-page',
  imports: [RouterLink, ButtonModule, ProgressBarModule, PageHeaderComponent, BrlPipe, StatusTagComponent],
  template: `
    <app-page-header title="Obrigações" subtitle="Tudo o que o contrato e o processo cobram de você" [crumbs]="[{ label: 'Obrigações' }]">
      <p-button label="Nova obrigação" icon="pi pi-plus" routerLink="/obrigacoes/nova" />
    </app-page-header>

    @if (items(); as list) {
      <ul class="list">
        @for (o of list; track o.id) {
          <li class="card item">
            <div class="item__head">
              <a class="item__name" [routerLink]="['/obrigacoes', o.id]">{{ o.name }}</a>
              <app-status-tag [obligation]="o.status" />
            </div>
            <p class="item__meta muted">
              {{ o.payee }} · {{ category[o.category] }} · {{ periodicity[o.periodicity] }}
              @if (o.correctionIndex !== 'NONE') { · {{ correction[o.correctionIndex] }} }
              · {{ funding[o.fundingSource] }}
            </p>
            <p-progressbar [value]="share(o)" [showValue]="false" [attr.aria-label]="o.name + ': ' + share(o) + '% pago'" styleClass="item__bar" />
            <div class="item__nums num">
              <span><strong>{{ o.totalPaid | brl }}</strong> pago de {{ o.totalExpected | brl }}</span>
              <span class="item__actions">
                <p-button label="Ver cronograma" icon="pi pi-calendar" size="small" severity="secondary" [text]="true" [routerLink]="['/obrigacoes', o.id]" />
                <p-button label="Editar" icon="pi pi-pencil" size="small" severity="secondary" [text]="true" [routerLink]="['/obrigacoes', o.id, 'editar']" />
              </span>
            </div>
          </li>
        } @empty {
          <li class="muted">Nenhuma obrigação cadastrada. Use "Nova obrigação" para começar.</li>
        }
      </ul>
    } @else {
      <p class="muted" role="status">Carregando…</p>
    }
  `,
  styles: `
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
    .item { display: grid; gap: 0.4rem; }
    .item__head { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
    .item__name { font-family: var(--font-display); font-size: 1.2rem; font-weight: 600; color: var(--ink); text-decoration: none; }
    .item__name:hover { color: var(--accent); text-decoration: underline; }
    .item__meta { margin: 0; font-size: 0.875rem; }
    :host ::ng-deep .item__bar { height: 0.4rem; margin-top: 0.2rem; }
    .item__nums { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.9375rem; }
  `,
})
export class ObligationsPage implements OnInit {
  private readonly api = inject(ApiService);
  protected readonly items = signal<ObligationDto[] | null>(null);
  protected readonly category = CATEGORY_LABEL;
  protected readonly periodicity = PERIODICITY_LABEL;
  protected readonly correction = CORRECTION_LABEL;
  protected readonly funding = FUNDING_LABEL;

  ngOnInit(): void {
    this.api.obligations().subscribe((o) => this.items.set(o));
  }

  protected share(o: ObligationDto): number {
    return Math.round(moneyRatio(o.totalPaid, o.totalExpected) * 100);
  }
}
