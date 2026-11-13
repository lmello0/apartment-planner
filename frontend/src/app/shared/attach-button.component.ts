import { Component, inject, input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DocumentCategory, DocumentLink } from '../core/models';
import { FILE_ACCEPT } from './document-files';
import { DocumentsService } from './documents.service';

/** "Anexar" shortcut for item screens: choose files, then the upload dialog opens already linked to the item. */
@Component({
  selector: 'app-attach-button',
  imports: [ButtonModule],
  template: `
    <p-button [label]="label()" icon="pi pi-paperclip" severity="secondary" [outlined]="true" size="small"
      [ariaLabel]="'Anexar documento a ' + link().label" (onClick)="picker.click()" />
    <input #picker type="file" class="sr-only" tabindex="-1" multiple [accept]="accept" (change)="picked($event)" />
  `,
})
export class AttachButtonComponent {
  private readonly docs = inject(DocumentsService);
  readonly link = input.required<DocumentLink>();
  readonly category = input<DocumentCategory>();
  readonly label = input('Anexar documento');
  protected readonly accept = FILE_ACCEPT;

  protected picked(e: Event): void {
    const el = e.target as HTMLInputElement;
    const files = Array.from(el.files ?? []);
    el.value = '';
    this.docs.openUpload(files, { link: this.link(), category: this.category() });
  }
}
