import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { moneyToNumber, numberToMoney } from '../../core/money';
import { FeedbackService } from '../../shared/feedback.service';
import { PageHeaderComponent } from '../../shared/page-header.component';

@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule, ButtonModule, InputNumberModule, PageHeaderComponent],
  template: `
    <app-page-header title="Ajustes" subtitle="Capacidade mensal e estimativas de correção" [crumbs]="[{ label: 'Ajustes' }]" />

    <form class="card" [formGroup]="form" (ngSubmit)="save()">
      <div class="form-grid">
        <div class="field span-2">
          <label for="s-cap">Capacidade mensal de pagamento</label>
          <p-inputnumber inputId="s-cap" formControlName="monthlyCapacity" mode="decimal" locale="pt-BR" prefix="R$ "
            [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0" fluid />
          <small>O painel avisa quando as parcelas do mês passam deste valor.</small>
        </div>
        <div class="field">
          <label for="s-incc">INCC-DI estimado (% ao mês)</label>
          <p-inputnumber inputId="s-incc" formControlName="inccMonthlyEstimate" mode="decimal" locale="pt-BR" suffix=" %"
            [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0" [max]="10" fluid />
        </div>
        <div class="field">
          <label for="s-igpm">IGP-M estimado (% ao mês)</label>
          <p-inputnumber inputId="s-igpm" formControlName="igpmMonthlyEstimate" mode="decimal" locale="pt-BR" suffix=" %"
            [minFractionDigits]="2" [maxFractionDigits]="2" [min]="0" [max]="10" fluid />
        </div>
        <div class="field span-2">
          <label for="s-due">Avisar vencimentos com antecedência de</label>
          <p-inputnumber inputId="s-due" formControlName="dueSoonDays" suffix=" dias" [min]="1" [max]="60" [useGrouping]="false" fluid />
          <small>Parcelas que vencem neste prazo aparecem como "Vence em breve".</small>
        </div>
      </div>
      <div class="form-actions">
        <p-button type="submit" label="Salvar ajustes" icon="pi pi-check" [disabled]="form.invalid || form.pristine" [loading]="saving()" />
      </div>
    </form>

    @if (!mock) {
      <section class="card account">
        <h2>Conta</h2>
        <p class="muted">Conectado como {{ auth.email() }}</p>
        <p-button label="Sair" icon="pi pi-sign-out" severity="secondary" [outlined]="true" (onClick)="logout()" />
      </section>
    } @else {
      <p class="muted demo">Modo demonstração: os dados ficam só na memória do navegador e somem ao recarregar.</p>
    }
  `,
  styles: `
    .account { margin-top: 1rem; }
    .demo { margin-top: 1rem; font-size: 0.875rem; }
  `,
})
export class SettingsPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly feedback = inject(FeedbackService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  protected readonly auth = inject(AuthService);
  protected readonly mock = this.auth.bypass;
  protected readonly saving = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    monthlyCapacity: [0, [Validators.required, Validators.min(0)]],
    inccMonthlyEstimate: [0, [Validators.required, Validators.min(0)]],
    igpmMonthlyEstimate: [0, [Validators.required, Validators.min(0)]],
    dueSoonDays: [7, [Validators.required, Validators.min(1), Validators.max(60)]],
  });

  ngOnInit(): void {
    this.api.settings().subscribe((s) =>
      this.form.reset({
        monthlyCapacity: moneyToNumber(s.monthlyCapacity),
        inccMonthlyEstimate: Number(s.inccMonthlyEstimate),
        igpmMonthlyEstimate: Number(s.igpmMonthlyEstimate),
        dueSoonDays: s.dueSoonDays,
      }),
    );
  }

  protected save(): void {
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.api
      .updateSettings({
        monthlyCapacity: numberToMoney(v.monthlyCapacity),
        inccMonthlyEstimate: v.inccMonthlyEstimate.toFixed(2),
        igpmMonthlyEstimate: v.igpmMonthlyEstimate.toFixed(2),
        dueSoonDays: v.dueSoonDays,
      })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.form.markAsPristine();
          this.feedback.success('Ajustes salvos', 'O painel já usa os novos valores.');
        },
        error: () => this.saving.set(false),
      });
  }

  protected async logout(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigate(['/entrar']);
  }
}
