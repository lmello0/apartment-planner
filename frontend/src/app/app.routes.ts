import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'entrar', title: 'Entrar · Planejador do Apê', loadComponent: () => import('./features/login/login.page').then((m) => m.LoginPage) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'painel' },
      { path: 'painel', title: 'Painel · Planejador do Apê', loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'parcelas', title: 'Parcelas · Planejador do Apê', loadComponent: () => import('./features/installments/installments.page').then((m) => m.InstallmentsPage) },
      { path: 'obrigacoes', title: 'Obrigações · Planejador do Apê', loadComponent: () => import('./features/obligations/obligations.page').then((m) => m.ObligationsPage) },
      { path: 'obrigacoes/nova', title: 'Nova obrigação · Planejador do Apê', loadComponent: () => import('./features/obligations/obligation-form.page').then((m) => m.ObligationFormPage) },
      { path: 'obrigacoes/:id', title: 'Obrigação · Planejador do Apê', loadComponent: () => import('./features/obligations/obligation-detail.page').then((m) => m.ObligationDetailPage) },
      { path: 'obrigacoes/:id/editar', title: 'Editar obrigação · Planejador do Apê', loadComponent: () => import('./features/obligations/obligation-form.page').then((m) => m.ObligationFormPage) },
      { path: 'marcos', title: 'Marcos · Planejador do Apê', loadComponent: () => import('./features/milestones/milestones.page').then((m) => m.MilestonesPage) },
      { path: 'tarefas', title: 'Tarefas · Planejador do Apê', loadComponent: () => import('./features/tasks/tasks.page').then((m) => m.TasksPage) },
      { path: 'documentos', title: 'Documentos · Planejador do Apê', loadComponent: () => import('./features/documents/documents.page').then((m) => m.DocumentsPage) },
      { path: 'ajustes', title: 'Ajustes · Planejador do Apê', loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
