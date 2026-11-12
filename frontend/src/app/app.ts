import { Component, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastModule, ConfirmDialogModule, ButtonModule],
  template: `
    <router-outlet />
    <p-toast key="app" position="bottom-left">
      <ng-template #message let-message>
        <div class="toast-body">
          <div class="toast-title">{{ message.summary }}</div>
          @if (message.detail) { <div class="toast-detail">{{ message.detail }}</div> }
          @if (message.data?.effects; as effects) {
            <ul class="toast-effects">
              @for (e of effects; track e) { <li>{{ e }}</li> }
            </ul>
          }
          @if (message.data?.undo) {
            <p-button label="Desfazer" icon="pi pi-undo" size="small" severity="secondary" [outlined]="true"
              (onClick)="undo(message)" />
          }
        </div>
      </ng-template>
    </p-toast>
    <p-confirmdialog key="app" [style]="{ width: '26rem' }" [breakpoints]="{ '575px': '94vw' }" />
  `,
  styles: `
    .toast-body { display: grid; gap: 0.3rem; flex: 1; }
    .toast-title { font-weight: 600; }
    .toast-detail { font-size: 0.9rem; }
    .toast-effects { margin: 0.25rem 0 0; padding-left: 1.1rem; font-size: 0.875rem; }
    p-button { justify-self: start; margin-top: 0.3rem; }
  `,
})
export class App {
  private readonly messages = inject(MessageService);

  protected undo(message: { data: { undo: () => void } }): void {
    message.data.undo();
    this.messages.clear('app');
  }
}
