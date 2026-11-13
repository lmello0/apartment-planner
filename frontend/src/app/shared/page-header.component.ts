import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Crumb {
  label: string;
  link?: string;
}

/** Same title block on every screen: breadcrumb trail, title, subtitle, actions (rules 1 and 8). */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink],
  template: `
    <header class="page-header">
      <div class="page-header__text">
        @if (crumbs().length > 1) {
        <nav aria-label="Você está em" class="crumbs">
          @for (c of crumbs(); track c.label) {
            @if (c.link) {
              <a [routerLink]="c.link">{{ c.label }}</a>
              <span aria-hidden="true">/</span>
            } @else {
              <span aria-current="page">{{ c.label }}</span>
            }
          }
        </nav>
        }
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="page-header__sub">{{ subtitle() }}</p>
        }
      </div>
      <div class="page-header__actions"><ng-content /></div>
    </header>
  `,
  styles: `
    .page-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 0.75rem 1rem; margin-bottom: 1.75rem; }
    .crumbs { display: flex; gap: 0.4rem; font-size: 0.8125rem; color: var(--muted); margin-bottom: 0.2rem; }
    .crumbs a { color: var(--muted); }
    .crumbs a:hover { color: var(--accent); }
    h1 { margin: 0; font-size: 2rem; line-height: 1.15; font-weight: 600; letter-spacing: -0.02em; }
    @media (max-width: 640px) { h1 { font-size: 1.6rem; } }
    .page-header__sub { margin: 0.25rem 0 0; color: var(--muted); font-size: 1rem; }
    .page-header__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  readonly crumbs = input<Crumb[]>([]);
}
