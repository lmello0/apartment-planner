import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ChartModule } from 'primeng/chart';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { ThemeService } from '../../core/theme.service';
import { ApiService } from '../../core/api.service';
import { monthLabel } from '../../core/dates';
import { DashboardDto, TaskDto } from '../../core/models';
import { compareMoney, moneyRatio, moneyToNumber, toCents } from '../../core/money';
import { ActionsService } from '../../shared/actions.service';
import { DocumentListComponent } from '../../shared/document-list.component';
import { InstallmentListComponent } from '../../shared/installment-list.component';
import { PageHeaderComponent } from '../../shared/page-header.component';
import { BrlPipe, DateBrPipe } from '../../shared/pipes';
import { PHASE_LABEL } from '../../core/labels';

@Component({
  selector: 'app-dashboard-page',
  imports: [
    FormsModule, RouterLink, ButtonModule, CheckboxModule, ChartModule, MessageModule, ProgressBarModule,
    InstallmentListComponent, DocumentListComponent, PageHeaderComponent, BrlPipe, DateBrPipe,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly actions = inject(ActionsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);

  protected readonly data = signal<DashboardDto | null>(null);
  protected readonly phase = PHASE_LABEL;

  protected readonly paidShare = computed(() => {
    const d = this.data();
    return d ? Math.round(moneyRatio(d.totals.paid, d.totals.projected) * 100) : 0;
  });

  protected readonly capacityShare = computed(() => {
    const c = this.data()?.capacity;
    return c ? Math.min(100, Math.round(moneyRatio(c.currentMonthCommitment, c.monthlyCapacity) * 100)) : 0;
  });

  protected readonly hasOverdue = computed(() => (this.data()?.overdue.length ?? 0) > 0);

  protected readonly chartData = computed(() => {
    const monthly = this.data()?.monthly ?? [];
    return {
      labels: monthly.map((m) => monthLabel(m.month)),
      datasets: [
        { label: 'Previsto', data: monthly.map((m) => moneyToNumber(m.expected)), backgroundColor: this.theme.dark() ? '#6b5d4a' : '#d8c6a6', borderRadius: 4 },
        { label: 'Pago', data: monthly.map((m) => moneyToNumber(m.paid)), backgroundColor: this.theme.dark() ? '#b9c675' : '#4c5a1f', borderRadius: 4 },
      ],
    };
  });

  protected readonly chartOptions = computed(() => {
    const text = this.theme.dark() ? '#b8ab97' : '#655848';
    const grid = this.theme.dark() ? '#3d3329' : '#e2d5c1';
    return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' as const, labels: { usePointStyle: true, boxWidth: 8, color: text } },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${ctx.dataset.label}: ${(ctx.parsed.y ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12, color: text } },
      y: {
        beginAtZero: true,
        grid: { color: grid },
        ticks: { color: text, callback: (v: string | number) => `R$ ${Number(v) >= 1000 ? `${Number(v) / 1000} mil` : v}` },
      },
    },
  };
  });

  ngOnInit(): void {
    this.load();
    this.actions.changed$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => this.load());
  }

  protected hasAmount(v: string): boolean {
    return toCents(v) > 0n;
  }

  protected share(paid: string, expected: string): number {
    return Math.round(moneyRatio(paid, expected) * 100);
  }

  protected toggle(task: TaskDto): void {
    this.actions.toggleTask(task);
  }

  protected over(a: string, b: string): boolean {
    return compareMoney(a, b) > 0;
  }

  private load(): void {
    this.api.dashboard().subscribe((d) => this.data.set(d));
  }
}
