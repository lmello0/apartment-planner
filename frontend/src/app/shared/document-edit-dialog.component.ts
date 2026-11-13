import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { DOCUMENT_CATEGORY_LABEL, enumOptions } from '../core/labels';
import { ApiService } from '../core/api.service';
import { DocumentCategory } from '../core/models';
import { isoToPicker, pickerToIso } from '../core/dates';
import { linkFields, linkKey } from './document-files';
import { DocumentsService, LinkOptionGroup } from './documents.service';
import { ActionsService } from './actions.service';
import { FeedbackService } from './feedback.service';

/** Edit metadata and link of a document (the file itself never changes; to replace it, upload a new one). */
@Component({
  selector: 'app-document-edit-dialog',
  imports: [ReactiveFormsModule, DialogModule, ButtonModule, DatePickerModule, InputTextModule, SelectModule, TextareaModule],
  template: `
    <p-dialog header="Editar documento" [modal]="true" [draggable]="false" [dismissableMask]="true"
      [visible]="!!doc()" (visibleChange)="$event || docs.editing.set(null)" [style]="{ width: '36rem' }" [breakpoints]="{ '640px': '96vw' }">
      @if (doc(); as d) {
        <p class="muted file">{{ d.originalName }}</p>
        <form [formGroup]="form" (ngSubmit)="save()" class="form-grid" novalidate>
          <div class="field span-2">
            <label for="ed-title">Título *</label>
            <input pInputText id="ed-title" formControlName="title" autocomplete="off" />
            @if (form.controls.title.touched && form.controls.title.invalid) { <small class="err">Informe o título.</small> }
          </div>
          <div class="field span-2">
            <label for="ed-cat">Categoria</label>
            <p-select inputId="ed-cat" formControlName="category" [options]="categories" optionLabel="label" optionValue="value" appendTo="body" fluid />
          </div>
          <div class="field">
            <label for="ed-date">Data do documento</label>
            <p-datepicker inputId="ed-date" formControlName="documentDate" dateFormat="dd/mm/yy" appendTo="body" [showIcon]="true" [showButtonBar]="true" fluid />
          </div>
          <div class="field">
            <label for="ed-valid">Válido até</label>
            <p-datepicker inputId="ed-valid" formControlName="validUntil" dateFormat="dd/mm/yy" appendTo="body" [showIcon]="true" [showButtonBar]="true" fluid />
          </div>
          <div class="field span-2">
            <label for="ed-link">Item ligado <span class="muted">(opcional)</span></label>
            <p-select inputId="ed-link" formControlName="link" [options]="linkGroups()" optionLabel="label" optionValue="value"
              [group]="true" [filter]="true" filterPlaceholder="Buscar item" [showClear]="true" placeholder="Sem ligação" appendTo="body" fluid />
          </div>
          <div class="field span-2">
            <label for="ed-notes">Observação</label>
            <textarea pTextarea id="ed-notes" formControlName="notes" rows="3"></textarea>
          </div>
          <div class="form-actions span-2">
            <p-button type="button" label="Cancelar" severity="secondary" [text]="true" (onClick)="docs.editing.set(null)" />
            <p-button type="submit" label="Salvar alterações" icon="pi pi-check" [disabled]="form.invalid" [loading]="saving()" />
          </div>
        </form>
      }
    </p-dialog>
  `,
  styles: `.file { margin: 0 0 1rem; font-size: 0.875rem; overflow-wrap: anywhere; }`,
})
export class DocumentEditDialogComponent {
  protected readonly docs = inject(DocumentsService);
  private readonly api = inject(ApiService);
  private readonly actions = inject(ActionsService);
  private readonly feedback = inject(FeedbackService);
  private readonly fb = inject(FormBuilder);

  protected readonly doc = this.docs.editing;
  protected readonly saving = signal(false);
  protected readonly linkGroups = signal<LinkOptionGroup[]>([]);
  protected readonly categories = enumOptions<DocumentCategory>(DOCUMENT_CATEGORY_LABEL);

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(300)]],
    category: ['OTHER' as DocumentCategory, Validators.required],
    documentDate: [null as Date | null],
    validUntil: [null as Date | null],
    link: [null as string | null],
    notes: [''],
  });

  constructor() {
    effect(() => {
      const d = this.doc();
      if (!d) return;
      this.saving.set(false);
      this.form.reset({
        title: d.title, category: d.category, documentDate: isoToPicker(d.documentDate),
        validUntil: isoToPicker(d.validUntil), link: linkKey(d.link), notes: d.notes ?? '',
      });
      this.docs.linkOptions().subscribe({ next: (g) => this.linkGroups.set(g), error: () => this.linkGroups.set([]) });
    });
  }

  protected save(): void {
    const d = this.doc();
    if (!d || this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .updateDocument(d.id, {
        title: (v.title ?? '').trim(), category: v.category ?? 'OTHER',
        documentDate: pickerToIso(v.documentDate), validUntil: pickerToIso(v.validUntil),
        notes: v.notes?.trim() || null, ...linkFields(v.link),
      })
      .subscribe({
        next: (saved) => {
          this.docs.editing.set(null);
          this.feedback.success('Documento atualizado', saved.title);
          this.actions.changed$.next();
        },
        error: () => this.saving.set(false),
      });
  }
}
