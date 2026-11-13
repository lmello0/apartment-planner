import { firstValueFrom } from 'rxjs';
import { MockApiService } from './mock-api.service';
import { DocumentCreateInput } from './models';

function make(today = '2026-11-11'): MockApiService {
  const api = new MockApiService();
  api.latencyMs = 0;
  api.clock = () => today;
  return api;
}

const pdf = (name = 'a.pdf', body = '%PDF-1.4 fake') => new File([body], name, { type: 'application/pdf' });

/** The real 3-step flow against the mock. */
async function addDoc(api: MockApiService, over: Partial<DocumentCreateInput> = {}, file = pdf()) {
  const { document, upload } = await firstValueFrom(
    api.createDocument({
      title: 'Doc', category: 'OTHER', originalName: file.name, mimeType: file.type, sizeBytes: file.size, ...over,
    }),
  );
  await firstValueFrom(api.uploadDocumentFile(upload, file));
  return firstValueFrom(api.confirmDocument(document.id));
}

describe('MockApiService documents', () => {
  it('keeps a document hidden until the upload is confirmed', async () => {
    const api = make();
    const before = (await firstValueFrom(api.documents())).length;
    const { document, upload } = await firstValueFrom(
      api.createDocument({ title: 'Pendente', category: 'OTHER', originalName: 'p.pdf', mimeType: 'application/pdf', sizeBytes: 10 }),
    );
    expect(upload.method).toBe('PUT');
    expect((await firstValueFrom(api.documents())).length).toBe(before);
    await firstValueFrom(api.uploadDocumentFile(upload, pdf('p.pdf')));
    const active = await firstValueFrom(api.confirmDocument(document.id));
    expect(active.title).toBe('Pendente');
    expect((await firstValueFrom(api.documents())).length).toBe(before + 1);
  });

  it('refuses a confirm without bytes and drops the pending row', async () => {
    const api = make();
    const { document } = await firstValueFrom(
      api.createDocument({ title: 'x', category: 'OTHER', originalName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 10 }),
    );
    await expectAsync(firstValueFrom(api.confirmDocument(document.id))).toBeRejected();
    await expectAsync(firstValueFrom(api.confirmDocument(document.id))).toBeRejected(); // row is gone
  });

  it('validates mime type and size on create', async () => {
    const api = make();
    const base = { title: 'x', category: 'OTHER' as const, originalName: 'x.exe' };
    await expectAsync(firstValueFrom(api.createDocument({ ...base, mimeType: 'application/x-msdownload', sizeBytes: 10 }))).toBeRejected();
    await expectAsync(firstValueFrom(api.createDocument({ ...base, mimeType: 'application/pdf', sizeBytes: 21 * 1024 * 1024 }))).toBeRejected();
    await expectAsync(firstValueFrom(api.createDocument({ ...base, mimeType: 'application/pdf', sizeBytes: 0 }))).toBeRejected();
  });

  it('allows at most one link', async () => {
    const api = make();
    await expectAsync(
      firstValueFrom(api.createDocument({
        title: 'x', category: 'OTHER', originalName: 'x.pdf', mimeType: 'application/pdf', sizeBytes: 5,
        taskId: 't-1', obligationId: 'ob-itbi',
      })),
    ).toBeRejected();
  });

  it('counts documents per installment and shows the link label', async () => {
    const api = make();
    const inst = (await firstValueFrom(api.installments({ obligationId: 'ob-corretagem' })))[3]; // 4/6, unpaid
    expect(inst.documentCount).toBe(0);
    const doc = await addDoc(api, { category: 'PAYMENT_RECEIPT', installmentId: inst.id });
    expect(doc.link).toEqual({ type: 'INSTALLMENT', id: inst.id, label: 'Corretagem 4/6' });
    const after = (await firstValueFrom(api.installments({ obligationId: 'ob-corretagem' })))[3];
    expect(after.documentCount).toBe(1);
    // seed: corretagem 1/6 already has its receipt
    expect((await firstValueFrom(api.installments({ obligationId: 'ob-corretagem' })))[0].documentCount).toBe(1);
    expect((await firstValueFrom(api.documents({ installmentId: inst.id }))).map((d) => d.id)).toEqual([doc.id]);
  });

  it('computes expiry with dueSoonDays and lists expiring documents on the dashboard', async () => {
    const api = make('2026-11-11'); // dueSoonDays = 7
    const soon = await addDoc(api, { title: 'Soon', validUntil: '2026-11-17' });
    const exactly8 = await addDoc(api, { title: 'Later', validUntil: '2026-11-19' });
    const expired = await addDoc(api, { title: 'Old', validUntil: '2026-11-10' });
    const none = await addDoc(api, { title: 'None' });
    expect(soon.expiry).toBe('DUE_SOON');
    expect(exactly8.expiry).toBe('VALID');
    expect(expired.expiry).toBe('EXPIRED');
    expect(none.expiry).toBeNull();
    const exp = (await firstValueFrom(api.dashboard())).expiringDocuments;
    // seed "Certidão de estado civil" (valid until 2026-11-18) is also due soon; ordered by validUntil
    expect(exp.map((d) => d.title)).toEqual(['Old', 'Soon', 'Certidão de estado civil']);
    await firstValueFrom(api.updateSettings({ ...(await firstValueFrom(api.settings())), dueSoonDays: 10 }));
    expect((await firstValueFrom(api.documents({ q: 'later' })))[0].expiry).toBe('DUE_SOON');
  });

  it('filters by category and by text in title, file name and notes', async () => {
    const api = make();
    await addDoc(api, { title: 'Escritura', category: 'CONTRACT', notes: 'cartório central' }, pdf('esc-final.pdf'));
    expect((await firstValueFrom(api.documents({ category: 'CONTRACT' }))).map((d) => d.title)).toContain('Escritura');
    expect((await firstValueFrom(api.documents({ category: 'TAXES_FEES' }))).length).toBe(0);
    expect((await firstValueFrom(api.documents({ q: 'ESC-FINAL' }))).length).toBe(1);
    expect((await firstValueFrom(api.documents({ q: 'cartório' }))).length).toBe(1);
  });

  it('updates metadata and moves/removes the link (PUT replaces everything)', async () => {
    const api = make();
    const d = await addDoc(api, { title: 'A', obligationId: 'ob-itbi' });
    expect(d.link?.label).toBe('ITBI');
    const moved = await firstValueFrom(api.updateDocument(d.id, { title: 'B', category: 'TAXES_FEES', taskId: 't-1' }));
    expect(moved.title).toBe('B');
    expect(moved.link).toEqual({ type: 'TASK', id: 't-1', label: 'Conferir a minuta do contrato com a construtora' });
    const unlinked = await firstValueFrom(api.updateDocument(d.id, { title: 'B', category: 'TAXES_FEES' }));
    expect(unlinked.link).toBeNull();
  });

  it('sets the link to null (SET NULL) when the linked task or obligation is deleted, keeping the document', async () => {
    const api = make();
    const t = await addDoc(api, { taskId: 't-9' });
    const o = await addDoc(api, { obligationId: 'ob-itbi' });
    await firstValueFrom(api.deleteTask('t-9'));
    await firstValueFrom(api.deleteObligation('ob-itbi'));
    const all = await firstValueFrom(api.documents());
    expect(all.find((d) => d.id === t.id)!.link).toBeNull();
    expect(all.find((d) => d.id === o.id)!.link).toBeNull();
  });

  it('deletes a document and stops counting it', async () => {
    const api = make();
    const inst = (await firstValueFrom(api.installments({ obligationId: 'ob-corretagem' })))[0];
    expect(inst.documentCount).toBe(1);
    const doc = (await firstValueFrom(api.documents({ installmentId: inst.id })))[0];
    await firstValueFrom(api.deleteDocument(doc.id));
    expect((await firstValueFrom(api.installments({ obligationId: 'ob-corretagem' })))[0].documentCount).toBe(0);
    await expectAsync(firstValueFrom(api.deleteDocument(doc.id))).toBeRejected();
  });

  it('keeps the receipt and its link after undoing the payment', async () => {
    const api = make();
    const inst = (await firstValueFrom(api.installments({ obligationId: 'ob-corretagem' })))[3];
    await firstValueFrom(api.payInstallment(inst.id, { paidOn: '2026-11-11', amount: '2548.00', method: 'PIX' }));
    await addDoc(api, { category: 'PAYMENT_RECEIPT', installmentId: inst.id });
    const undone = await firstValueFrom(api.undoPayment(inst.id));
    expect(undone.documentCount).toBe(1);
  });

  it('serves the stored file through the download URL', async () => {
    const api = make();
    const d = await addDoc(api, {}, pdf('f.pdf', 'conteudo fake'));
    const { url, expiresAt } = await firstValueFrom(api.documentDownloadUrl(d.id));
    expect(url.startsWith('blob:')).toBeTrue();
    expect(new Date(expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(await (await fetch(url)).text()).toBe('conteudo fake');
  });
});
