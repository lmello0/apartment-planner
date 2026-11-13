import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Subject, catchError, combineLatest, debounceTime, distinctUntilChanged, map, of, startWith, switchMap, tap } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { DOCUMENT_CATEGORY_LABEL, enumOptions } from '../../core/labels';
import { DocumentCategory, DocumentDto } from '../../core/models';
import { ActionsService } from '../../shared/actions.service';
import { DocumentListComponent } from '../../shared/document-list.component';
import { DocumentsService } from '../../shared/documents.service';
import { FileDropComponent } from '../../shared/file-drop.component';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-documents-page',
  imports: [FormsModule, ButtonModule, InputTextModule, SelectModule, DocumentListComponent, FileDropComponent, PageHeaderComponent],
  template: `
    <app-page-header title="Documentos" subtitle="Contratos, comprovantes e papéis do apartamento, em um só lugar"
      [crumbs]="[{ label: 'Documentos' }]" />

    <app-file-drop class="drop" (files)="docs.openUpload($event)" />

    <div class="filters" role="search">
      <div class="search">
        <label for="doc-q" class="sr-only">Buscar por título</label>
        <i class="pi pi-search" aria-hidden="true"></i>
        <input pInputText id="doc-q" type="search" placeholder="Buscar por título" autocomplete="off"
          [ngModel]="q()" (ngModelChange)="q.set($event)" />
      </div>
      <p-select [options]="categories" [ngModel]="category()" (ngModelChange)="category.set($event)" optionLabel="label" optionValue="value"
        placeholder="Todas as categorias" [showClear]="true" ariaLabel="Filtrar por categoria" />
    </div>

    <section class="card" aria-live="polite" aria-labelledby="h-docs">
      <h2 id="h-docs">
        @if (items(); as list) { {{ list.length }} documento(s) } @else { Documentos }
        @if (filtered()) { <span class="muted">com o filtro atual</span> }
      </h2>
      @if (error()) {
        <div class="state" role="alert">
          <p>Não foi possível carregar os documentos.</p>
          <p-button label="Tentar de novo" icon="pi pi-refresh" severity="secondary" [outlined]="true" size="small" (onClick)="reload.next()" />
        </div>
      } @else if (items() === null) {
        <p class="muted" role="status">Carregando…</p>
      } @else if (items()!.length === 0 && !filtered()) {
        <div class="state">
          <i class="pi pi-folder-open" aria-hidden="true"></i>
          <p><strong>Nenhum documento ainda.</strong> Solte um PDF ou foto na área acima, ou use “Escolher arquivos”.</p>
        </div>
      } @else {
        <app-document-list [items]="items()!" emptyText="Nenhum documento com este filtro. Limpe a busca ou a categoria para ver todos." />
      }
    </section>
  `,
  styles: `
    .drop { display: block; margin-bottom: 1.25rem; }
    .filters { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1rem; }
    .search { position: relative; flex: 1 1 16rem; max-width: 26rem; }
    .search i { position: absolute; left: 0.8rem; top: 50%; transform: translateY(-50%); color: var(--muted); }
    .search input { width: 100%; padding-left: 2.3rem; }
    h2 .muted { font-weight: 400; font-size: 0.875rem; }
    .state { display: grid; justify-items: start; gap: 0.5rem; color: var(--muted); }
    .state i { font-size: 1.6rem; color: var(--accent); }
    .state p { margin: 0; }
  `,
})
export class DocumentsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly actions = inject(ActionsService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly docs = inject(DocumentsService);

  protected readonly categories = enumOptions<DocumentCategory>(DOCUMENT_CATEGORY_LABEL);
  protected readonly q = signal('');
  protected readonly category = signal<DocumentCategory | null>(null);
  protected readonly items = signal<DocumentDto[] | null>(null);
  protected readonly error = signal(false);
  protected readonly filtered = computed(() => !!this.q().trim() || !!this.category());
  protected readonly reload = new Subject<void>();
  private readonly q$ = toObservable(this.q);
  private readonly category$ = toObservable(this.category);

  ngOnInit(): void {
    const reload$ = this.reload.pipe(startWith(undefined));
    combineLatest([
      this.q$.pipe(debounceTime(250), map((q) => q.trim()), distinctUntilChanged()),
      this.category$,
      reload$,
      this.actions.changed$.pipe(startWith(undefined)),
    ])
      .pipe(
        tap(() => this.error.set(false)),
        switchMap(([q, category]) =>
          this.api.documents({ q: q || undefined, category: category ?? undefined }).pipe(
            catchError(() => {
              this.error.set(true);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((list) => {
        if (list) this.items.set(list);
      });
  }
}
