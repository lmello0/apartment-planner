import { Injectable, inject, signal } from '@angular/core';
import { ConfirmationService } from 'primeng/api';
import { Observable, forkJoin, map, switchMap, tap } from 'rxjs';
import { ApiService } from '../core/api.service';
import { DocumentCategory, DocumentDto, DocumentInput, DocumentLink } from '../core/models';
import { ActionsService } from './actions.service';
import { FeedbackService } from './feedback.service';
import { fileProblem, mimeOf } from './document-files';
import { formatDateBr } from './pipes';

export interface UploadRequest {
  files: File[];
  /** Pre-links every file to this item (item screens). */
  link?: DocumentLink;
  category?: DocumentCategory;
}

export interface LinkOptionGroup {
  label: string;
  items: { label: string; value: string }[];
}

/**
 * Everything about documents that more than one screen needs: the 3-step upload, open / delete,
 * and the signals that drive the app-wide dialogs mounted in the shell (same pattern as payments).
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly api = inject(ApiService);
  private readonly actions = inject(ActionsService);
  private readonly feedback = inject(FeedbackService);
  private readonly confirm = inject(ConfirmationService);

  readonly uploadRequest = signal<UploadRequest | null>(null);
  readonly editing = signal<DocumentDto | null>(null);
  readonly itemView = signal<DocumentLink | null>(null);
  readonly opening = signal<string | null>(null);

  openUpload(files: File[], preset: Omit<UploadRequest, 'files'> = {}): void {
    if (files.length) this.uploadRequest.set({ files, ...preset });
  }

  /** POST /documents → PUT bytes → POST confirm. Emits the ACTIVE document. */
  upload(file: File, meta: DocumentInput, onProgress?: (fraction: number) => void): Observable<DocumentDto> {
    const problem = fileProblem(file);
    if (problem) return new Observable((s) => s.error(new Error(problem)));
    return this.api
      .createDocument({ ...meta, originalName: file.name, mimeType: mimeOf(file), sizeBytes: file.size })
      .pipe(
        switchMap(({ document, upload }) =>
          this.api.uploadDocumentFile(upload, file, onProgress).pipe(switchMap(() => this.api.confirmDocument(document.id))),
        ),
        tap(() => this.actions.changed$.next()),
      );
  }

  /** Opens the file in a new tab through a short-lived signed URL. */
  open(doc: DocumentDto): void {
    // The tab is opened synchronously (inside the click) so popup blockers allow it; the URL arrives later.
    const tab = window.open('about:blank', '_blank');
    if (tab) tab.opener = null;
    this.opening.set(doc.id);
    this.api.documentDownloadUrl(doc.id).subscribe({
      next: ({ url }) => {
        this.opening.set(null);
        if (tab && url) tab.location.href = url;
        else if (url) window.open(url, '_blank', 'noopener');
        else tab?.close();
      },
      error: () => {
        this.opening.set(null);
        tab?.close();
      },
    });
  }

  edit(doc: DocumentDto): void {
    this.editing.set(doc);
  }

  confirmDelete(doc: DocumentDto): void {
    this.confirm.confirm({
      key: 'app',
      header: 'Excluir documento?',
      message: `"${doc.title}" e o arquivo guardado serão apagados. Isso não pode ser desfeito.`,
      icon: 'pi pi-trash',
      acceptLabel: 'Excluir',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () =>
        this.api.deleteDocument(doc.id).subscribe(() => {
          this.feedback.success('Documento excluído', doc.title);
          this.actions.changed$.next();
        }),
    });
  }

  openItem(link: DocumentLink): void {
    this.itemView.set(link);
  }

  /** Items a document can be linked to, grouped for a select. */
  linkOptions(): Observable<LinkOptionGroup[]> {
    return forkJoin({
      installments: this.api.installments(),
      obligations: this.api.obligations(),
      tasks: this.api.tasks(),
      milestones: this.api.milestones(),
    }).pipe(
      map(({ installments, obligations, tasks, milestones }) => [
        {
          label: 'Parcelas',
          items: installments.map((i) => ({
            label: `${i.obligationName} ${i.seq}/${i.count} · ${formatDateBr(i.dueDate)}`,
            value: `INSTALLMENT:${i.id}`,
          })),
        },
        { label: 'Obrigações', items: obligations.map((o) => ({ label: o.name, value: `OBLIGATION:${o.id}` })) },
        { label: 'Tarefas', items: tasks.map((t) => ({ label: t.title, value: `TASK:${t.id}` })) },
        { label: 'Marcos', items: milestones.map((m) => ({ label: m.label, value: `MILESTONE:${m.key}` })) },
      ].filter((g) => g.items.length)),
    );
  }
}
