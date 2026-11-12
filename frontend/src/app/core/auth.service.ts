import { Injectable, computed, isDevMode, signal } from '@angular/core';
import { Session, SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/**
 * Supabase is used for login only (magic link). With useMock, or with authDisabled in a dev
 * build (backend AUTH_DISABLED=true), the whole auth layer is bypassed. isDevMode() is false in
 * production builds, so authDisabled can never switch auth off there.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** True when no login is required (mock mode, or local dev against an auth-disabled backend). */
  readonly bypass = environment.useMock || (environment.authDisabled && isDevMode());

  private readonly client: SupabaseClient | null = this.bypass
    ? null
    : createClient(environment.supabaseUrl, environment.supabaseAnonKey);

  private readonly _session = signal<Session | null>(null);
  readonly session = this._session.asReadonly();
  readonly email = computed(() => (this.bypass ? (environment.useMock ? 'modo demonstração' : 'desenvolvimento local') : (this._session()?.user.email ?? '')));
  readonly isAuthenticated = computed(() => this.bypass || this._session() !== null);

  /** Resolves once the persisted session (if any) has been restored. */
  readonly ready: Promise<void>;

  constructor() {
    if (!this.client) {
      this.ready = Promise.resolve();
      return;
    }
    const client = this.client;
    client.auth.onAuthStateChange((_event, session) => this._session.set(session));
    this.ready = client.auth.getSession().then(({ data }) => this._session.set(data.session));
  }

  accessToken(): string | null {
    return this._session()?.access_token ?? null;
  }

  async sendMagicLink(email: string): Promise<void> {
    if (!this.client) return;
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    if (error) throw error;
  }

  async signOut(): Promise<void> {
    await this.client?.auth.signOut();
    this._session.set(null);
  }
}
