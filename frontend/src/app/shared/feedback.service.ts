import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';

/** Single entry point for toasts so every mutation gives the same kind of feedback (rule 3). */
@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly messages = inject(MessageService);

  success(summary: string, detail?: string): void {
    this.messages.add({ key: 'app', severity: 'success', summary, detail, life: 5000 });
  }

  info(summary: string, detail?: string): void {
    this.messages.add({ key: 'app', severity: 'info', summary, detail, life: 6000 });
  }

  error(summary: string, detail?: string): void {
    this.messages.add({ key: 'app', severity: 'error', summary, detail, life: 8000 });
  }

  /** Success toast with an "Desfazer" button that runs `undo` (rule 6). */
  undoable(summary: string, detail: string, undo: () => void): void {
    this.messages.add({ key: 'app', severity: 'success', summary, detail, life: 9000, data: { undo } });
  }

  /** Toast listing what a milestone change did elsewhere (rule 3). */
  effects(summary: string, effects: string[]): void {
    this.messages.add({ key: 'app', severity: 'info', summary, life: 12000, data: { effects } });
  }
}
