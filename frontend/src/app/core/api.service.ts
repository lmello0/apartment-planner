import { Observable } from 'rxjs';
import {
  DashboardDto, InstallmentDto, InstallmentFilter, IsoDate, MilestoneDto, MilestoneKey,
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

  abstract settings(): Observable<SettingsDto>;
  abstract updateSettings(input: SettingsDto): Observable<SettingsDto>;
}
