import { Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { firstValueFrom } from 'rxjs';
import { DOCUMENT_CATEGORY_LABEL, enumOptions } from '../core/labels';
import { DocumentCategory, DocumentInput } from '../core/models';
import { pickerToIso } from '../core/dates';
import { fileProblem, formatSize, linkFields, linkKey, titleFromName } from './document-files';
import { DocumentsService, LinkOptionGroup } from './documents.service';
import { FeedbackService } from './feedback.service';

interface Row {
  file: File;
  title: string;
  category: DocumentCategory;
  problem: string | null;
  state: 'queued' | 'sending' | 'done' | 'error';
  progress: number;
  error: string | null;
}

/**
 * App-wide upload dialog (mounted in the shell). One row per file with its own title and category,
 * shared details below; each file shows its own progress or error and failed ones can be retried.
 */
@Component({
  selector: 'app-document-upload-dialog',
  imports: [
    FormsModule, ReactiveFormsModule, DialogModule, ButtonModule, DatePickerModule, InputTextModule,
    ProgressBarModule, SelectModule, TextareaModule,
  ],
  template: `
    <p-dialog [header]="rows().length > 1 ? 'Enviar ' + rows().length + ' documentos' : 'Enviar documento'" [modal]="true"
      [draggable]="false" [dismissableMask]="!sending()" [closable]="!sending()" [closeOnEscape]="!sending()"
      [visible]="!!request()" (visibleChange)="$event || close()" [style]="{ width: '40rem' }" [breakpoints]="{ '640px': '96vw' }">
      <form class="stack" (ngSubmit)="send()" novalidate>
        <ul class="files" role="list">
          @for (r of rows(); track r.file) {
            <li class="file" [class.file--bad]="r.state === 'error' || r.problem">
              <div class="file__head">
                <i class="pi pi-file" aria-hidden="true"></i>
                <span class="file__name">{{ r.file.name }}</span>
                <span class="muted file__size">{{ size(r.file.size) }}</span>
                @if (r.state === 'done') { <span class="ok"><i class="pi pi-check-circle" aria-hidden="true"></i> Enviado</span> }
                @else if (!sending()) {
                  <p-button icon="pi pi-times" size="small" severity="secondary" [text]="true"
                    [ariaLabel]="'Tirar ' + r.file.name + ' da lista'" (onClick)="remove(r)" />
                }
              </div>
              @if (r.problem) {
                <small class="err" role="alert">{{ r.problem }} Este arquivo não será enviado.</small>
              } @else if (r.state !== 'done') {
                <div class="file__fields">
                  <div class="field">
                    <label [for]="'up-title-' + $index">Título *</label>
                    <input pInputText [id]="'up-title-' + $index" [(ngModel)]="r.title" name="title-{{ $index }}"
                      [disabled]="r.state === 'sending'" autocomplete="off" />
                  </div>
                  <div class="field">
                    <label [for]="'up-cat-' + $index">Categoria</label>
                    <p-select [inputId]="'up-cat-' + $index" [(ngModel)]="r.category" name="cat-{{ $index }}" [options]="categories"
                      optionLabel="label" optionValue="value" appendTo="body" [disabled]="r.state === 'sending'" fluid />
                  </div>
                </div>
                @if (r.state === 'sending') {
                  <p-progressbar [value]="r.progress" [showValue]="false" styleClass="file__bar"
                    [attr.aria-label]="'Enviando ' + r.file.name + ': ' + r.progress + '%'" />
                }
                @if (r.state === 'error') {
                  <small class="err" role="alert"><i class="pi pi-exclamation-triangle" aria-hidden="true"></i> Não enviado: {{ r.error }}</small>
                }
              }
            </li>
          }
        </ul>

        <fieldset class="details" [formGroup]="form" [disabled]="sending()">
          <legend>Detalhes <span class="muted">valem para todos os arquivos desta remessa</span></legend>
          <div class="form-grid">
            <div class="field">
              <label for="up-date">Data do documento</label>
              <p-datepicker inputId="up-date" formControlName="documentDate" dateFormat="dd/mm/yy" appendTo="body" [showIcon]="true" [showButtonBar]="true" fluid />
            </div>
            <div class="field">
              <label for="up-valid">Válido até</label>
              <p-datepicker inputId="up-valid" formControlName="validUntil" dateFormat="dd/mm/yy" appendTo="body" [showIcon]="true" [showButtonBar]="true" fluid />
            </div>
            <div class="field span-2">
              @if (request()?.link; as l) {
                <span class="label">Ligado a</span>
                <span class="linked"><i class="pi pi-link" aria-hidden="true"></i> {{ l.label }}</span>
              } @else {
                <label for="up-link">Ligar a um item <span class="muted">(opcional)</span></label>
                <p-select inputId="up-link" formControlName="link" [options]="linkGroups()" optionLabel="label" optionValue="value"
                  [group]="true" [filter]="true" filterPlaceholder="Buscar item" [showClear]="true" placeholder="Sem ligação"
                  appendTo="body" fluid />
              }
            </div>
            <div class="field span-2">
              <label for="up-notes">Observação</label>
              <textarea pTextarea id="up-notes" formControlName="notes" rows="2"></textarea>
            </div>
          </div>
        </fieldset>

        <div class="form-actions">
          <p-button type="button" [label]="hasDone() ? 'Fechar' : 'Cancelar'" severity="secondary" [text]="true" [disabled]="sending()" (onClick)="close()" />
          <p-button type="submit" [label]="submitLabel()" icon="pi pi-upload" [disabled]="!canSend()" [loading]="sending()" />
        </div>
      </form>
    </p-dialog>
  `,
  styles: `
    .files { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; max-height: 46vh; overflow: auto; }
    .file { border: 1px solid var(--line); border-radius: 10px; padding: 0.65rem 0.8rem; background: var(--surface-2); display: grid; gap: 0.5rem; }
    .file--bad { border-color: var(--danger); }
    .file__head { display: flex; align-items: center; gap: 0.5rem; min-width: 0; }
    .file__name { font-weight: 600; flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .file__size { font-size: 0.8125rem; white-space: nowrap; }
    .file__fields { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); gap: 0.75rem; }
    :host ::ng-deep .file__bar { height: 0.4rem; }
    .ok { color: var(--ok); font-size: 0.875rem; font-weight: 500; white-space: nowrap; }
    .details { border: 0; padding: 0; margin: 0; }
    .details legend { font-weight: 600; padding: 0; margin-bottom: 0.6rem; }
    .details legend .muted { font-weight: 400; font-size: 0.8125rem; }
    .label { font-weight: 500; }
    .linked { color: var(--accent); font-weight: 500; }
    .err { color: var(--danger); }
    @media (max-width: 640px) { .file__fields { grid-template-columns: minmax(0, 1fr); } }
  `,
})
export class DocumentUploadDialogComponent {
  protected readonly docs = inject(DocumentsService);
  private readonly feedback = inject(FeedbackService);
  private readonly fb = inject(FormBuilder);

  protected readonly request = this.docs.uploadRequest;
  protected readonly rows = signal<Row[]>([]);
  protected readonly sending = signal(false);
  protected readonly linkGroups = signal<LinkOptionGroup[]>([]);
  protected readonly categories = enumOptions<DocumentCategory>(DOCUMENT_CATEGORY_LABEL);
  protected readonly size = formatSize;

  protected readonly form = this.fb.group({
    documentDate: [null as Date | null],
    validUntil: [null as Date | null],
    notes: [''],
    link: [null as string | null],
  });

  constructor() {
    effect(() => {
      const req = this.request();
      if (!req) return;
      this.sending.set(false);
      this.form.reset({ documentDate: null, validUntil: null, notes: '', link: linkKey(req.link) });
      this.rows.set(
        req.files.map((file) => ({
          file, title: titleFromName(file.name), category: req.category ?? 'OTHER',
          problem: fileProblem(file), state: 'queued', progress: 0, error: null,
        })),
      );
      if (!req.link) this.docs.linkOptions().subscribe({ next: (g) => this.linkGroups.set(g), error: () => this.linkGroups.set([]) });
    });
  }

  protected hasDone(): boolean {
    return this.rows().some((r) => r.state === 'done');
  }

  private sendable(): Row[] {
    return this.rows().filter((r) => !r.problem && r.state !== 'done');
  }

  protected canSend(): boolean {
    const s = this.sendable();
    return !this.sending() && s.length > 0 && s.every((r) => r.title.trim().length > 0);
  }

  protected submitLabel(): string {
    const n = this.sendable().length;
    const retry = this.rows().some((r) => r.state === 'error');
    return retry ? 'Tentar de novo' : n > 1 ? `Enviar ${n} arquivos` : 'Enviar';
  }

  protected remove(row: Row): void {
    this.rows.update((rs) => rs.filter((r) => r !== row));
    if (this.rows().length === 0) this.close();
  }

  protected close(): void {
    if (this.sending()) return;
    this.docs.uploadRequest.set(null);
  }

  protected async send(): Promise<void> {
    if (!this.canSend()) return;
    const v = this.form.getRawValue();
    const base: DocumentInput = {
      title: '', category: 'OTHER',
      documentDate: pickerToIso(v.documentDate), validUntil: pickerToIso(v.validUntil),
      notes: v.notes?.trim() || null,
      ...linkFields(v.link),
    };
    this.sending.set(true);
    const patch = (row: Row, p: Partial<Row>) => {
      Object.assign(row, p);
      this.rows.update((rs) => [...rs]);
    };
    for (const row of this.sendable()) {
      patch(row, { state: 'sending', progress: 0, error: null });
      try {
        await firstValueFrom(
          this.docs.upload(row.file, { ...base, title: row.title.trim(), category: row.category }, (f) =>
            patch(row, { progress: Math.round(f * 100) }),
          ),
        );
        patch(row, { state: 'done', progress: 100 });
      } catch (e) {
        patch(row, { state: 'error', error: reason(e) });
      }
    }
    this.sending.set(false);
    const done = this.rows().filter((r) => r.state === 'done').length;
    if (this.rows().every((r) => r.state === 'done' || r.problem)) {
      this.feedback.success(done > 1 ? `${done} documentos enviados` : 'Documento enviado', this.rows().find((r) => r.state === 'done')?.title);
      this.docs.uploadRequest.set(null);
    } else if (done) {
      this.feedback.info(`${done} enviado(s)`, 'Os demais não foram enviados. Veja o motivo na lista.');
    }
  }
}

function reason(e: unknown): string {
  const err = e as { error?: { detail?: unknown }; message?: string };
  return (typeof err?.error?.detail === 'string' && err.error.detail) || err?.message || 'Tente novamente.';
}
