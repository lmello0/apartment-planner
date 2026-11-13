import { Injectable, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { ApiService } from '../core/api.service';
import { InstallmentDto, PaymentInput, TaskDto } from '../core/models';
import { FeedbackService } from './feedback.service';
import { formatBrl, formatDateBr } from './pipes';

/**
 * Cross-screen mutations (pay / undo / toggle task). Lives at root so the same behaviour,
 * toast and undo apply no matter which screen triggered it (rules 1, 2, 6).
 */
@Injectable({ providedIn: 'root' })
export class ActionsService {
  private readonly api = inject(ApiService);
  private readonly feedback = inject(FeedbackService);

  /** Installment currently being paid in the global payment dialog. */
  readonly paying = signal<InstallmentDto | null>(null);
  /** Emits after any mutation so visible screens can reload. */
  readonly changed$ = new Subject<void>();

  openPayment(installment: InstallmentDto): void {
    this.paying.set(installment);
  }

  closePayment(): void {
    this.paying.set(null);
  }

  /**
   * `keepOpen`: the dialog stays up after the payment is saved (it still has a receipt to upload);
   * the caller closes it. `onPaid` runs right after the payment succeeded.
   */
  pay(installment: InstallmentDto, input: PaymentInput, onDone?: () => void, opts: { keepOpen?: boolean; onPaid?: () => void } = {}): void {
    this.api.payInstallment(installment.id, input).subscribe({
      next: () => {
        if (!opts.keepOpen) this.closePayment();
        opts.onPaid?.();
        this.changed$.next();
        this.feedback.undoable(
          'Pagamento registrado',
          `${installment.obligationName} ${installment.seq}/${installment.count} · ${formatBrl(input.amount)} em ${formatDateBr(input.paidOn)}`,
          () => this.undoPayment(installment),
        );
        onDone?.();
      },
      error: () => onDone?.(),
    });
  }

  undoPayment(installment: InstallmentDto): void {
    this.api.undoPayment(installment.id).subscribe(() => {
      this.changed$.next();
      this.feedback.info(
        'Pagamento desfeito',
        `${installment.obligationName} ${installment.seq}/${installment.count} voltou para "a pagar".`,
      );
    });
  }

  toggleTask(task: TaskDto): void {
    const completing = !task.doneAt;
    this.api.toggleTask(task.id).subscribe(() => {
      this.changed$.next();
      if (completing) {
        this.feedback.undoable('Tarefa concluída', task.title, () => this.undoToggle(task));
      } else {
        this.feedback.info('Tarefa reaberta', task.title);
      }
    });
  }

  private undoToggle(task: TaskDto): void {
    this.api.toggleTask(task.id).subscribe(() => {
      this.changed$.next();
      this.feedback.info('Conclusão desfeita', task.title);
    });
  }
}
