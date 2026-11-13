import { Injectable, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';
const KEY = 'theme-preference';

/** Per-device theme: follows the system unless the user picks Claro/Escuro. Never sent to the API. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(this.read());
  /** Resolved theme actually applied (for things CSS variables cannot reach, like chart.js). */
  readonly dark = signal(false);
  private readonly media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;

  constructor() {
    this.apply();
    this.media?.addEventListener('change', () => this.apply());
  }

  set(pref: ThemePreference): void {
    this.preference.set(pref);
    try {
      if (pref === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, pref);
    } catch {
      /* storage unavailable: the choice still applies for this session */
    }
    this.apply();
  }

  private read(): ThemePreference {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'system';
    } catch {
      return 'system';
    }
  }

  private apply(): void {
    const pref = this.preference();
    const dark = pref === 'dark' || (pref === 'system' && !!this.media?.matches);
    const root = document.documentElement;
    this.dark.set(dark);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14100d' : '#3a2c21');
  }
}
