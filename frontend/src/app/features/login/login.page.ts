import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, MessageModule],
  template: `
    <main class="login">
      <div class="login__card card">
        <span class="mark" aria-hidden="true">166</span>
        <h1>Planejador do Apê</h1>
        @if (sent()) {
          <p-message severity="success" icon="pi pi-envelope">
            Enviamos um link de acesso para <strong>{{ form.controls.email.value }}</strong>. Abra o e-mail neste aparelho e toque no link.
          </p-message>
          <p-button label="Usar outro e-mail" severity="secondary" [text]="true" (onClick)="sent.set(false)" />
        } @else {
          <p class="muted">Digite seu e-mail e enviaremos um link para entrar, sem senha.</p>
          <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
            <div class="field">
              <label for="l-email">E-mail</label>
              <input pInputText id="l-email" type="email" formControlName="email" autocomplete="email" inputmode="email" autofocus />
              @if (form.controls.email.touched && form.controls.email.invalid) { <small class="err">Informe um e-mail válido.</small> }
            </div>
            @if (error()) { <p-message severity="error">{{ error() }}</p-message> }
            <p-button type="submit" label="Enviar link de acesso" icon="pi pi-send" [disabled]="form.invalid" [loading]="loading()" styleClass="w-full" />
          </form>
        }
      </div>
    </main>
  `,
  styles: `
    .login { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
    .login__card { width: min(26rem, 100%); display: grid; gap: 1rem; padding: 1.75rem; }
    h1 { margin: 0; font-size: 1.4rem; }
    .mark { display: grid; place-items: center; width: 3rem; height: 3rem; border-radius: 0.6rem; background: var(--ink); color: #e8dcc0; font-weight: 600; }
    p { margin: 0; }
    :host ::ng-deep .w-full { width: 100%; }
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  protected readonly form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  protected readonly sent = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal('');

  constructor() {
    void this.auth.ready.then(() => {
      if (!this.auth.bypass && this.auth.isAuthenticated()) void this.router.navigate(['/painel']);
    });
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.auth.sendMagicLink(this.form.controls.email.value.trim());
      this.sent.set(true);
    } catch {
      this.error.set('Não foi possível enviar o link. Confira o e-mail e tente de novo.');
    } finally {
      this.loading.set(false);
    }
  }
}
