import { Observable } from 'rxjs';
import {
  DashboardDto, DocumentCreateInput, DocumentDto, DocumentFilter, DocumentInput, UploadInfo, InstallmentDto, InstallmentFilter, IsoDate, MilestoneDto, MilestoneKey,
  MilestoneUpdateResult, ObligationDetailDto, ObligationDto, ObligationInput, PaymentInput,
  SettingsDto, TaskDto, TaskFilter, TaskInput,
} from './models';

/** Contract with the backend (/api). Abstract class so it doubles as the DI token. */
export abstract class ApiService {
  abstract dashboard(): Observable<DashboardDto>;

  abstract installments(filter?: InstallmentFilter): Observable<InstallmentDto[]>;
  abstract payInstallment(id: string, input: PaymentInput): Observable<InstallmentDto>;
  abstract undoPayment(id: string): Observable<InstallmentDto>;

  abstract obligations(): Observable<ObligationDto[]>;
  abstract obligation(id: string): Observable<ObligationDetailDto>;
  abstract createObligation(input: ObligationInput): Observable<ObligationDto>;
  abstract updateObligation(id: string, input: ObligationInput): Observable<ObligationDto>;
  abstract deleteObligation(id: string): Observable<void>;

  abstract milestones(): Observable<MilestoneDto[]>;
  abstract updateMilestone(
    key: MilestoneKey,
    body: { expectedDate: IsoDate | null; actualDate: IsoDate | null },
  ): Observable<MilestoneUpdateResult>;

  abstract tasks(filter?: TaskFilter): Observable<TaskDto[]>;
  abstract createTask(input: TaskInput): Observable<TaskDto>;
  abstract updateTask(id: string, input: TaskInput): Observable<TaskDto>;
  abstract deleteTask(id: string): Observable<void>;
  abstract toggleTask(id: string): Observable<TaskDto>;

  abstract documents(filter?: DocumentFilter): Observable<DocumentDto[]>;
  /** Step 1 of the upload: creates the PENDING document and tells where to PUT the bytes. */
  abstract createDocument(input: DocumentCreateInput): Observable<{ document: DocumentDto; upload: UploadInfo }>;
  /** Step 2: sends the bytes to upload.url (no bearer token; the URL is the credential). */
  abstract uploadDocumentFile(upload: UploadInfo, file: File, onProgress?: (fraction: number) => void): Observable<void>;
  /** Step 3: the API checks the object and activates the document. */
  abstract confirmDocument(id: string): Observable<DocumentDto>;
  abstract updateDocument(id: string, input: DocumentInput): Observable<DocumentDto>;
  abstract deleteDocument(id: string): Observable<void>;
  abstract documentDownloadUrl(id: string): Observable<{ url: string; expiresAt: string }>;

  abstract settings(): Observable<SettingsDto>;
  abstract updateSettings(input: SettingsDto): Observable<SettingsDto>;
}
