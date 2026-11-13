import { DOCUMENT_MAX_BYTES, DOCUMENT_MIME_TYPES, DocumentInput, DocumentLink } from '../core/models';

/** `accept` for file pickers: PDF and images (on phones the image option offers the camera). */
export const FILE_ACCEPT = 'application/pdf,image/*,.pdf,.heic,.heif';

const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  heic: 'image/heic', heif: 'image/heif', webp: 'image/webp',
};

/** Browsers often leave `file.type` empty for HEIC, so fall back to the extension. */
export function mimeOf(file: File): string {
  if (DOCUMENT_MIME_TYPES.includes(file.type)) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? file.type;
}

/** pt-BR reason why the API would refuse this file, or null when it looks fine. */
export function fileProblem(file: File): string | null {
  if (!DOCUMENT_MIME_TYPES.includes(mimeOf(file))) return 'Tipo não aceito. Envie PDF ou imagem (JPG, PNG, HEIC, WebP).';
  if (file.size < 1) return 'O arquivo está vazio.';
  if (file.size > DOCUMENT_MAX_BYTES) return 'O arquivo passa de 20 MB.';
  return null;
}

export function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim() || name;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

export function fileIcon(mime: string): string {
  return mime === 'application/pdf' ? 'pi pi-file-pdf' : mime.startsWith('image/') ? 'pi pi-image' : 'pi pi-file';
}

/** Select value for a link: "TYPE:id". */
export function linkKey(link: Pick<DocumentLink, 'type' | 'id'> | null | undefined): string | null {
  return link ? `${link.type}:${link.id}` : null;
}

/** Inverse of linkKey, shaped as the link fields of DocumentInput (exactly one set, or none). */
export function linkFields(key: string | null | undefined): Partial<DocumentInput> {
  if (!key) return {};
  const [type, ...rest] = key.split(':');
  const id = rest.join(':');
  switch (type) {
    case 'INSTALLMENT': return { installmentId: id };
    case 'OBLIGATION': return { obligationId: id };
    case 'TASK': return { taskId: id };
    case 'MILESTONE': return { milestoneKey: id as DocumentInput['milestoneKey'] };
    default: return {};
  }
}

export function linkRoute(link: Pick<DocumentLink, 'type' | 'id'>): string[] {
  switch (link.type) {
    case 'INSTALLMENT': return ['/parcelas'];
    case 'OBLIGATION': return ['/obrigacoes', link.id];
    case 'TASK': return ['/tarefas'];
    case 'MILESTONE': return ['/marcos'];
  }
}
