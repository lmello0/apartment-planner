import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { ApiService } from '../../core/api.service';
import { isoToPicker, pickerToIso } from '../../core/dates';
import { MILESTONE_HELP } from '../../core/labels';
import { MilestoneDto } from '../../core/models';
import { ActionsService } from '../../shared/actions.service';
import { DocumentsService } from '../../shared/documents.service';
import { FeedbackService } from '../../shared/feedback.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

interface Row {
  m: MilestoneDto;
  expected: Date | null;
  actual: Date | null;
  saving: boolean;
}

@Component({
  selector: 'app-milestones-page',
  imports: [FormsModule, ButtonModule, DatePickerModule, PageHeaderComponent],
  template: `
    <app-page-header title="Marcos do processo" subtitle="Ao mudar uma data, as regras recalculam vencimentos e criam tarefas"
      [crumbs]="[{ label: 'Marcos' }]" />

    @if (lastEffects().length) {
      <section class="card effects" aria-live="polite" aria-labelledby="h-eff">
        <h2 id="h-eff">O que mudou em {{ lastLabel() }}</h2>
        <ul>
          @for (e of lastEffects(); track e) { <li>{{ e }}</li> }
        </ul>
      </section>
    }

    <div class="list">
      @for (r of rows(); track r.m.key) {
        <form class="card ms" (ngSubmit)="save(r)">
          <div class="ms__head">
            <h2>{{ r.m.label }}</h2>
            <span class="ms__state" [class.ms__state--done]="!!r.m.actualDate">
              <i class="pi" [class]="r.m.actualDate ? 'pi-check-circle' : 'pi-clock'"></i>
              {{ r.m.actualDate ? 'Ocorreu' : r.m.expectedDate ? 'Previsto' : 'Sem data' }}
            </span>
          </div>
          <p class="muted ms__help">{{ help[r.m.key] }}</p>
          <div class="ms__dates">
            <div class="field">
              <label [for]="'e-' + r.m.key">Data prevista</label>
              <p-datepicker [inputId]="'e-' + r.m.key" name="expected" [(ngModel)]="r.expected" dateFormat="dd/mm/yy" appendTo="body" [showIcon]="true" [showButtonBar]="true" fluid />
            </div>
            <div class="field">
              <label [for]="'a-' + r.m.key">Data real</label>
              <p-datepicker [inputId]="'a-' + r.m.key" name="actual" [(ngModel)]="r.actual" dateFormat="dd/mm/yy" appendTo="body" [showIcon]="true" [showButtonBar]="true" fluid />
            </div>
            <p-button type="submit" label="Salvar" icon="pi pi-check" [disabled]="!dirty(r)" [loading]="r.saving" />
          </div>
          <div class="ms__docs">
            <p-button type="button" icon="pi pi-paperclip" severity="secondary" [text]="true" size="small"
              [label]="docLabel(r.m.key)" [ariaLabel]="docLabel(r.m.key) + ' de ' + r.m.label + '. Abrir ou anexar'"
              (onClick)="docs.openItem({ type: 'MILESTONE', id: r.m.key, label: r.m.label })" />
          </div>
        </form>
      } @empty {
        <p class="muted" role="status">Carregando…</p>
      }
    </div>
  `,
  styles: `
    .list { display: grid; gap: 0.75rem; }
    .ms h2 { margin: 0; font-size: 1.2rem; font-weight: 600; }
    .ms__head { display: flex; justify-content: space-between; gap: 0.5rem; align-items: baseline; flex-wrap: wrap; }
    .ms__state { font-size: 0.875rem; color: var(--muted); }
    .ms__state--done { color: var(--ok); }
    .ms__help { margin: 0.2rem 0 0.9rem; font-size: 0.9rem; }
    .ms__dates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)) auto; gap: 1rem; align-items: end; }
    .ms__docs { margin-top: 0.6rem; }
    .effects { border-color: var(--accent); margin-bottom: 1rem; background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
    .effects ul { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.25rem; }
    @media (max-width: 640px) { .ms__dates { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class MilestonesPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly feedback = inject(FeedbackService);
  protected readonly docs = inject(DocumentsService);
  private readonly actions = inject(ActionsService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly docCount = signal<Record<string, number>>({});

  protected readonly help = MILESTONE_HELP;
  protected readonly rows = signal<Row[]>([]);
  protected readonly lastEffects = signal<string[]>([]);
  protected readonly lastLabel = signal('');

  ngOnInit(): void {
    this.api.milestones().subscribe((list) => this.rows.set(list.map((m) => this.toRow(m))));
    this.loadDocs();
    this.actions.changed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.loadDocs());
  }

  protected docLabel(key: string): string {
    const n = this.docCount()[key] ?? 0;
    return n ? `${n} documento(s)` : 'Anexar documento';
  }

  private loadDocs(): void {
    this.api.documents().subscribe({
      next: (list) => {
        const counts: Record<string, number> = {};
        for (const d of list) if (d.link?.type === 'MILESTONE') counts[d.link.id] = (counts[d.link.id] ?? 0) + 1;
        this.docCount.set(counts);
      },
      error: () => this.docCount.set({}),
    });
  }

  protected dirty(r: Row): boolean {
    return pickerToIso(r.expected) !== r.m.expectedDate || pickerToIso(r.actual) !== r.m.actualDate;
  }

  protected save(r: Row): void {
    if (!this.dirty(r) || r.saving) return;
    r.saving = true;
    this.api
      .updateMilestone(r.m.key, { expectedDate: pickerToIso(r.expected), actualDate: pickerToIso(r.actual) })
      .subscribe({
        next: ({ milestone, effects }) => {
          this.rows.update((rows) => rows.map((x) => (x.m.key === milestone.key ? this.toRow(milestone) : x)));
          this.lastLabel.set(milestone.label);
          this.lastEffects.set(effects);
          if (effects.length) this.feedback.effects(`${milestone.label} atualizado`, effects);
          else this.feedback.success(`${milestone.label} atualizado`, 'Nenhuma outra data foi afetada.');
        },
        error: () => (r.saving = false),
      });
  }

  private toRow(m: MilestoneDto): Row {
    return { m, expected: isoToPicker(m.expectedDate), actual: isoToPicker(m.actualDate), saving: false };
  }
}
