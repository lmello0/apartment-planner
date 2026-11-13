import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DOCUMENT_CATEGORY_LABEL, DOCUMENT_LINK_LABEL } from '../core/labels';
import { DocumentDto } from '../core/models';
import { diffDays, localTodayIso } from '../core/dates';
import { fileIcon, formatSize, linkRoute } from './document-files';
import { DocumentsService } from './documents.service';
import { DateBrPipe } from './pipes';

/** One list of documents used by the Documentos page, item screens, item dialog and the dashboard card. */
@Component({
  selector: 'app-document-list',
  imports: [RouterLink, ButtonModule, TagModule, DateBrPipe],
  template: `
    @if (items().length === 0) {
      <p class="empty">{{ emptyText() }}</p>
    } @else {
      <ul class="rows" role="list">
        @for (d of items(); track d.id) {
          <li class="row">
            <i [class]="icon(d)" class="row__icon" aria-hidden="true"></i>
            <div class="row__main">
              <strong class="row__title">{{ d.title }}</strong>
              <span class="row__meta">
                {{ category[d.category] }}
                @if (d.documentDate) { · de {{ d.documentDate | dateBr }} }
                @if (d.validUntil) { · válido até {{ d.validUntil | dateBr }} }
              </span>
              <span class="row__meta row__file">{{ d.originalName }} · {{ size(d.sizeBytes) }}</span>
              @if (showLink() && d.link; as l) {
                <span class="row__meta">{{ linkType[l.type] }}: <a [routerLink]="route(d)">{{ l.label }}</a></span>
              }
            </div>
            <div class="row__expiry">
              @if (d.expiry === 'EXPIRED') {
                <p-tag value="Vencido" severity="danger" icon="pi pi-exclamation-triangle" />
              } @else if (d.expiry === 'DUE_SOON') {
                <p-tag [value]="soon(d)" severity="warn" icon="pi pi-bell" />
              }
            </div>
            <div class="row__actions">
              <p-button label="Abrir" icon="pi pi-external-link" size="small" severity="secondary" [outlined]="true"
                [loading]="docs.opening() === d.id" [ariaLabel]="'Abrir ' + d.title" (onClick)="docs.open(d)" />
              <p-button icon="pi pi-pencil" size="small" severity="secondary" [text]="true"
                [ariaLabel]="'Editar ' + d.title" (onClick)="docs.edit(d)" />
              <p-button icon="pi pi-trash" size="small" severity="danger" [text]="true"
                [ariaLabel]="'Excluir ' + d.title" (onClick)="docs.confirmDelete(d)" />
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .rows { list-style: none; margin: 0; padding: 0; }
    .row { display: grid; grid-template-columns: 2rem minmax(0, 1fr) auto auto; gap: 0.75rem; align-items: center; padding: 0.75rem 0.25rem; border-top: 1px solid var(--line); }
    .row:first-child { border-top: 0; }
    .row__icon { font-size: 1.4rem; color: var(--clay); text-align: center; }
    .row__main { display: flex; flex-direction: column; min-width: 0; }
    .row__title { font-weight: 600; overflow-wrap: anywhere; }
    .row__meta { color: var(--muted); font-size: 0.8125rem; overflow-wrap: anywhere; }
    .row__actions { display: flex; align-items: center; gap: 0.15rem; }
    .empty { color: var(--muted); margin: 0.5rem 0; }
    @media (max-width: 720px) {
      .row { grid-template-columns: 1.75rem minmax(0, 1fr); grid-template-areas: 'icon main' '. expiry' '. actions'; row-gap: 0.4rem; }
      .row__icon { grid-area: icon; }
      .row__main { grid-area: main; }
      .row__expiry { grid-area: expiry; }
      .row__expiry:empty { display: none; }
      .row__actions { grid-area: actions; }
    }
  `,
})
export class DocumentListComponent {
  protected readonly docs = inject(DocumentsService);
  readonly items = input.required<DocumentDto[]>();
  readonly emptyText = input('Nenhum documento por aqui.');
  /** Show "Parcela: …" under each row; turn off where the list is already scoped to one item. */
  readonly showLink = input(true);

  protected readonly category = DOCUMENT_CATEGORY_LABEL;
  protected readonly linkType = DOCUMENT_LINK_LABEL;

  protected icon = (d: DocumentDto) => fileIcon(d.mimeType);
  protected size = formatSize;
  protected route = (d: DocumentDto) => linkRoute(d.link!);

  protected soon(d: DocumentDto): string {
    const n = d.validUntil ? diffDays(localTodayIso(), d.validUntil) : 0;
    return n <= 0 ? 'Vence hoje' : n === 1 ? 'Vence amanhã' : `Vence em ${n} dias`;
  }
}
