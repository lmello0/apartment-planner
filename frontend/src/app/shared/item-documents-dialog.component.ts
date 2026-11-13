import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DialogModule } from 'primeng/dialog';
import { ApiService } from '../core/api.service';
import { DocumentDto, MilestoneKey } from '../core/models';
import { ActionsService } from './actions.service';
import { AttachButtonComponent } from './attach-button.component';
import { DocumentListComponent } from './document-list.component';
import { DocumentsService } from './documents.service';
import { DOCUMENT_LINK_LABEL } from '../core/labels';

/** Documents of one installment, task or milestone, with the "attach already linked" shortcut. */
@Component({
  selector: 'app-item-documents-dialog',
  imports: [DialogModule, DocumentListComponent, AttachButtonComponent],
  template: `
    <p-dialog [header]="'Documentos · ' + (item()?.label ?? '')" [modal]="true" [draggable]="false" [dismissableMask]="true"
      [visible]="!!item()" (visibleChange)="$event || docs.itemView.set(null)" [style]="{ width: '42rem' }" [breakpoints]="{ '720px': '96vw' }">
      @if (item(); as it) {
        <p class="muted kind">{{ kind[it.type] }}</p>
        @if (items() === null) {
          <p class="muted" role="status">Carregando…</p>
        } @else {
          <app-document-list [items]="items()!" [showLink]="false" emptyText="Nenhum documento ligado a este item ainda." />
        }
        <div class="foot"><app-attach-button [link]="it" [category]="it.type === 'INSTALLMENT' ? 'PAYMENT_RECEIPT' : undefined" /></div>
      }
    </p-dialog>
  `,
  styles: `.kind { margin: 0 0 0.5rem; font-size: 0.875rem; } .foot { margin-top: 1rem; display: flex; justify-content: flex-end; }`,
})
export class ItemDocumentsDialogComponent {
  protected readonly docs = inject(DocumentsService);
  private readonly api = inject(ApiService);
  private readonly actions = inject(ActionsService);

  protected readonly item = this.docs.itemView;
  protected readonly items = signal<DocumentDto[] | null>(null);
  protected readonly kind = DOCUMENT_LINK_LABEL;

  constructor() {
    effect(() => {
      this.item();
      this.items.set(null);
      this.load();
    });
    this.actions.changed$.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => this.load());
  }

  private load(): void {
    const it = this.item();
    if (!it) return;
    const filter =
      it.type === 'INSTALLMENT' ? { installmentId: it.id }
      : it.type === 'OBLIGATION' ? { obligationId: it.id }
      : it.type === 'TASK' ? { taskId: it.id }
      : { milestoneKey: it.id as MilestoneKey };
    this.api.documents(filter).subscribe({ next: (d) => this.items.set(d), error: () => this.items.set([]) });
  }
}
