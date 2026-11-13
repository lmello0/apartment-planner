import { Component, DestroyRef, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ApiService } from '../../core/api.service';
import { CATEGORY_LABEL, CORRECTION_LABEL, FUNDING_LABEL, PERIODICITY_LABEL } from '../../core/labels';
import { DocumentDto, ObligationDetailDto } from '../../core/models';
import { ActionsService } from '../../shared/actions.service';
import { FeedbackService } from '../../shared/feedback.service';
import { InstallmentListComponent } from '../../shared/installment-list.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { BrlPipe, DateBrPipe } from '../../shared/pipes';
import { StatusTagComponent } from '../../shared/status-tag.component';
import { MILESTONE_LABELS } from '../../core/milestone-labels';
import { AttachButtonComponent } from '../../shared/attach-button.component';
import { DocumentListComponent } from '../../shared/document-list.component';

@Component({
  selector: 'app-obligation-detail-page',
  imports: [RouterLink, ButtonModule, InstallmentListComponent, DocumentListComponent, AttachButtonComponent, PageHeaderComponent, BrlPipe, DateBrPipe, StatusTagComponent],
  template: `
    @if (ob(); as o) {
      <app-page-header [title]="o.name" [subtitle]="o.payee"
        [crumbs]="[{ label: 'Obrigações', link: '/obrigacoes' }, { label: o.name }]">
        <p-button label="Editar" icon="pi pi-pencil" severity="secondary" [outlined]="true" [routerLink]="['/obrigacoes', o.id, 'editar']" />
        <p-button label="Excluir" icon="pi pi-trash" severity="danger" [text]="true" (onClick)="confirmDelete(o.name)" />
      </app-page-header>

      <section class="card summary" aria-label="Resumo">
        <dl>
          <div><dt>Situação</dt><dd><app-status-tag [obligation]="o.status" /></dd></div>
          <div><dt>Categoria</dt><dd>{{ category[o.category] }}</dd></div>
          <div><dt>Periodicidade</dt><dd>{{ periodicity[o.periodicity] }}</dd></div>
          <div><dt>Correção</dt><dd>{{ correction[o.correctionIndex] }}</dd></div>
          <div><dt>Origem do recurso</dt><dd>{{ funding[o.fundingSource] }}</dd></div>
          <div>
            <dt>Início</dt>
            <dd>
              @if (o.firstDueDate) { {{ o.firstDueDate | dateBr }} }
              @else if (o.anchorMilestone) { {{ milestone[o.anchorMilestone] }}{{ o.offsetDays ? ' + ' + o.offsetDays + ' dia(s)' : '' }} }
              @else { — }
            </dd>
          </div>
          <div><dt>Total previsto</dt><dd class="num">{{ o.totalExpected | brl }}</dd></div>
          <div><dt>Total pago</dt><dd class="num">{{ o.totalPaid | brl }}</dd></div>
        </dl>
        @if (o.notes) { <p class="muted notes">{{ o.notes }}</p> }
      </section>

      <section class="card" aria-labelledby="h-sched">
        <h2 id="h-sched">Cronograma <span class="muted">{{ o.installments.length }} parcela(s)</span></h2>
        <app-installment-list [items]="o.installments" [showObligation]="false"
          emptyText="Ainda sem parcelas: o cronograma é gerado quando o marco de início tiver data." />
      </section>

      <section class="card docs" aria-labelledby="h-docs">
        <h2 id="h-docs">Documentos <span class="muted">{{ docs().length }} ligado(s) a esta obrigação</span></h2>
        <app-document-list [items]="docs()" [showLink]="false"
          emptyText="Nenhum documento ligado a esta obrigação. Comprovantes de cada parcela ficam no clipe da parcela." />
        <div class="docs__foot">
          <app-attach-button [link]="{ type: 'OBLIGATION', id: o.id, label: o.name }" [category]="'CONTRACT'" />
        </div>
      </section>
    } @else if (missing()) {
      <p>Obrigação não encontrada. <a routerLink="/obrigacoes">Voltar para a lista</a></p>
    } @else {
      <p class="muted" role="status">Carregando…</p>
    }
  `,
  styles: `
    .summary { margin-bottom: 1rem; }
    dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); gap: 0.9rem 1.25rem; }
    dt { color: var(--muted); font-size: 0.8125rem; font-weight: 500; }
    dd { margin: 0.1rem 0 0; font-weight: 500; }
    .notes { margin: 1rem 0 0; }
    h2 .muted { font-weight: 400; font-size: 0.875rem; }
    .docs { margin-top: 1rem; }
    .docs__foot { margin-top: 0.9rem; display: flex; justify-content: flex-end; }
  `,
})
export class ObligationDetailPage implements OnInit {
  readonly id = input.required<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);
  private readonly feedback = inject(FeedbackService);
  private readonly actions = inject(ActionsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly ob = signal<ObligationDetailDto | null>(null);
  protected readonly missing = signal(false);
  protected readonly docs = signal<DocumentDto[]>([]);
  protected readonly category = CATEGORY_LABEL;
  protected readonly periodicity = PERIODICITY_LABEL;
  protected readonly correction = CORRECTION_LABEL;
  protected readonly funding = FUNDING_LABEL;
  protected readonly milestone = MILESTONE_LABELS;
  protected readonly hasData = computed(() => this.ob() !== null);

  ngOnInit(): void {
    this.load();
    this.actions.changed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  protected confirmDelete(name: string): void {
    this.confirm.confirm({
      key: 'app',
      header: `Excluir "${name}"?`,
      message: 'O cronograma e os pagamentos registrados desta obrigação serão apagados. Isso não pode ser desfeito.',
      icon: 'pi pi-trash',
      acceptLabel: 'Excluir',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () =>
        this.api.deleteObligation(this.id()).subscribe(() => {
          this.feedback.success('Obrigação excluída', name);
          void this.router.navigate(['/obrigacoes']);
        }),
    });
  }

  private load(): void {
    this.api.obligation(this.id()).subscribe({
      next: (o) => this.ob.set(o),
      error: () => this.missing.set(true),
    });
    this.api.documents({ obligationId: this.id() }).subscribe({ next: (d) => this.docs.set(d), error: () => this.docs.set([]) });
  }
}
