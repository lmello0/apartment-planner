import { Component, input, output, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { FILE_ACCEPT } from './document-files';

/**
 * Drop area + picker button. Desktop: drag files in. Phone: the picker (the image option offers the
 * camera) and an explicit "Tirar foto" button; the "solte aqui" copy is hidden on touch widths.
 */
@Component({
  selector: 'app-file-drop',
  imports: [ButtonModule],
  template: `
    <div class="drop" [class.drop--over]="over()" [class.drop--compact]="compact()"
      (dragover)="onOver($event)" (dragleave)="over.set(false)" (drop)="onDrop($event)">
      <i class="pi pi-cloud-upload drop__icon" aria-hidden="true"></i>
      <div class="drop__text">
        <strong>{{ title() }}</strong>
        <span class="drop__hint">{{ hint() }}</span>
      </div>
      <div class="drop__buttons">
        <p-button [label]="buttonLabel()" icon="pi pi-paperclip" [severity]="compact() ? 'secondary' : 'primary'"
          [outlined]="compact()" size="small" (onClick)="picker.click()" />
        <p-button class="drop__camera" label="Tirar foto" icon="pi pi-camera" severity="secondary" [outlined]="true"
          size="small" (onClick)="camera.click()" />
      </div>
      <input #picker type="file" class="sr-only" tabindex="-1" [multiple]="multiple()" [accept]="accept" (change)="picked($event)" />
      <input #camera type="file" class="sr-only" tabindex="-1" accept="image/*" capture="environment" (change)="picked($event)" />
    </div>
  `,
  styles: `
    .drop { display: flex; align-items: center; gap: 1rem; padding: 1.1rem 1.25rem; border: 2px dashed var(--line); border-radius: var(--radius); background: var(--surface-2); transition: border-color .15s, background .15s; }
    .drop--over { border-color: var(--accent); background: var(--accent-soft); }
    .drop--compact { padding: 0.7rem 0.9rem; gap: 0.75rem; }
    .drop__icon { font-size: 1.6rem; color: var(--accent); }
    .drop--compact .drop__icon { font-size: 1.2rem; }
    .drop__text { display: flex; flex-direction: column; flex: 1; min-width: 0; }
    .drop__hint { color: var(--muted); font-size: 0.875rem; }
    .drop__buttons { display: flex; gap: 0.5rem; }
    .drop__camera { display: none; }
    @media (max-width: 640px) {
      .drop { flex-wrap: wrap; }
      .drop__icon { display: none; }
      .drop__hint { display: none; }
      .drop__text { flex-basis: 100%; }
      .drop__camera { display: inline-flex; }
    }
  `,
})
export class FileDropComponent {
  readonly title = input('Solte os arquivos aqui');
  readonly hint = input('PDF ou imagem, até 20 MB cada. Pode soltar vários de uma vez.');
  readonly buttonLabel = input('Escolher arquivos');
  readonly multiple = input(true);
  readonly compact = input(false);
  readonly files = output<File[]>();

  protected readonly accept = FILE_ACCEPT;
  protected readonly over = signal(false);

  protected onOver(e: DragEvent): void {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    this.over.set(true);
  }

  protected onDrop(e: DragEvent): void {
    e.preventDefault();
    this.over.set(false);
    const list = Array.from(e.dataTransfer?.files ?? []);
    if (list.length) this.files.emit(this.multiple() ? list : list.slice(0, 1));
  }

  protected picked(e: Event): void {
    const el = e.target as HTMLInputElement;
    const list = Array.from(el.files ?? []);
    el.value = ''; // lets the same file be chosen again
    if (list.length) this.files.emit(list);
  }
}
