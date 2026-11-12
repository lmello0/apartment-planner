import { Component, computed, input } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { INSTALLMENT_STATUS, OBLIGATION_STATUS, Severity } from '../core/labels';
import { InstallmentStatus, ObligationStatus } from '../core/models';

/** Status as colour + icon + text, never colour alone (rule 3, accessibility). */
@Component({
  selector: 'app-status-tag',
  imports: [TagModule],
  template: `<p-tag [value]="view().label" [severity]="view().severity" [icon]="view().icon" />`,
})
export class StatusTagComponent {
  readonly installment = input<InstallmentStatus>();
  readonly obligation = input<ObligationStatus>();

  protected readonly view = computed<{ label: string; severity: Severity; icon: string }>(() => {
    const i = this.installment();
    if (i) return INSTALLMENT_STATUS[i];
    const o = this.obligation();
    return o ? OBLIGATION_STATUS[o] : { label: '', severity: 'secondary', icon: '' };
  });
}
