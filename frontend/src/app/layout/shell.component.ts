import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { DocumentEditDialogComponent } from '../shared/document-edit-dialog.component';
import { DocumentUploadDialogComponent } from '../shared/document-upload-dialog.component';
import { ItemDocumentsDialogComponent } from '../shared/item-documents-dialog.component';
import { PaymentDialogComponent } from '../shared/payment-dialog.component';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PaymentDialogComponent, DocumentUploadDialogComponent, DocumentEditDialogComponent, ItemDocumentsDialogComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  protected readonly auth = inject(AuthService);

  protected readonly nav: NavItem[] = [
    { path: '/painel', label: 'Painel', icon: 'pi-home' },
    { path: '/parcelas', label: 'Parcelas', icon: 'pi-list-check' },
    { path: '/obrigacoes', label: 'Obrigações', icon: 'pi-file-edit' },
    { path: '/marcos', label: 'Marcos', icon: 'pi-flag' },
    { path: '/tarefas', label: 'Tarefas', icon: 'pi-check-square' },
    { path: '/documentos', label: 'Documentos', icon: 'pi-folder-open' },
  ];

  protected readonly settings: NavItem = { path: '/ajustes', label: 'Ajustes', icon: 'pi-cog' };
}
