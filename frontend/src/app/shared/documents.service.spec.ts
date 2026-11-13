import { TestBed } from '@angular/core/testing';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Observable, firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { MockApiService } from '../core/mock-api.service';
import { fileProblem, linkFields, linkKey, mimeOf, titleFromName } from './document-files';
import { ActionsService } from './actions.service';
import { DocumentsService } from './documents.service';

describe('DocumentsService upload flow', () => {
  let docs: DocumentsService;
  let api: MockApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ApiService, useClass: MockApiService }, MessageService, ConfirmationService],
    });
    api = TestBed.inject(ApiService) as MockApiService;
    api.latencyMs = 0;
    docs = TestBed.inject(DocumentsService);
  });

  it('runs create → PUT → confirm, reports progress and emits the ACTIVE document', async () => {
    const file = new File(['%PDF fake'], 'comprovante.pdf', { type: 'application/pdf' });
    const progress: number[] = [];
    const doc = await firstValueFrom(
      docs.upload(file, { title: 'Comprovante', category: 'PAYMENT_RECEIPT', installmentId: 'ob-corretagem-4' }, (f) => progress.push(f)),
    );
    expect(doc.originalName).toBe('comprovante.pdf');
    expect(doc.sizeBytes).toBe(file.size);
    expect(doc.link?.type).toBe('INSTALLMENT');
    expect(progress).toEqual([1]);
    expect((await firstValueFrom(api.documents({ installmentId: 'ob-corretagem-4' }))).length).toBe(1);
  });

  it('notifies listeners (changed$) after a successful upload', async () => {
    let changes = 0;
    const sub = TestBed.inject(ActionsService).changed$.subscribe(() => changes++);
    await firstValueFrom(docs.upload(new File(['x'], 'a.pdf', { type: 'application/pdf' }), { title: 'A', category: 'OTHER' }));
    sub.unsubscribe();
    expect(changes).toBe(1);
  });

  it('rejects an unsupported file before calling the API', async () => {
    const before = (await firstValueFrom(api.documents())).length;
    const exe = new File(['MZ'], 'virus.exe', { type: 'application/x-msdownload' });
    await expectAsync(firstValueFrom(docs.upload(exe, { title: 'x', category: 'OTHER' }))).toBeRejectedWithError(/Tipo não aceito/);
    expect((await firstValueFrom(api.documents())).length).toBe(before);
  });

  it('surfaces a failed confirm (no bytes) as an error', async () => {
    spyOn(api, 'uploadDocumentFile').and.callFake(() => new Observable<void>((s) => { s.next(); s.complete(); }));
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });
    await expectAsync(firstValueFrom(docs.upload(file, { title: 'A', category: 'OTHER' }))).toBeRejected();
  });
});

describe('document file helpers', () => {
  it('detects HEIC by extension when the browser leaves the type empty', () => {
    expect(mimeOf(new File(['x'], 'IMG_1.HEIC'))).toBe('image/heic');
    expect(fileProblem(new File(['x'], 'IMG_1.HEIC'))).toBeNull();
  });
  it('flags wrong types, empty files and files over 20 MB', () => {
    expect(fileProblem(new File(['x'], 'a.docx', { type: 'application/msword' }))).toContain('Tipo');
    expect(fileProblem(new File([], 'a.pdf', { type: 'application/pdf' }))).toContain('vazio');
    const big = { name: 'big.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 } as File;
    expect(fileProblem(big)).toContain('20 MB');
  });
  it('prefills the title from the file name', () => {
    expect(titleFromName('contrato_final__v2.pdf')).toBe('contrato final v2');
  });
  it('round-trips the link select value', () => {
    expect(linkFields(linkKey({ type: 'MILESTONE', id: 'HABITE_SE' }))).toEqual({ milestoneKey: 'HABITE_SE' });
    expect(linkFields(linkKey({ type: 'INSTALLMENT', id: 'ob-1-2' }))).toEqual({ installmentId: 'ob-1-2' });
    expect(linkFields(null)).toEqual({});
  });
});
