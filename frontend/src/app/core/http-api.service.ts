import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiService } from './api.service';
import {
  DashboardDto, InstallmentDto, InstallmentFilter, IsoDate, MilestoneDto, MilestoneKey,
  MilestoneUpdateResult, ObligationDetailDto, ObligationDto, ObligationInput, PaymentInput,
  SettingsDto, TaskDto, TaskFilter, TaskInput,
} from './models';

@Injectable()
export class HttpApiService extends ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiUrl;

  dashboard(): Observable<DashboardDto> {
    return this.http.get<DashboardDto>(`${this.base}/dashboard`);
  }

  installments(filter: InstallmentFilter = {}): Observable<InstallmentDto[]> {
    let params = new HttpParams();
    // "OPEN" (a pagar) is a UI notion: the API only filters by one concrete status.
    if (filter.status && filter.status !== 'OPEN') params = params.set('status', filter.status);
    if (filter.obligationId) params = params.set('obligationId', filter.obligationId);
    if (filter.from) params = params.set('from', filter.from);
    if (filter.to) params = params.set('to', filter.to);
    const req = this.http.get<InstallmentDto[]>(`${this.base}/installments`, { params });
    return filter.status === 'OPEN'
      ? req.pipe(map((list) => list.filter((i) => i.status !== 'PAID')))
      : req;
  }

  payInstallment(id: string, input: PaymentInput): Observable<InstallmentDto> {
    return this.http.post<InstallmentDto>(`${this.base}/installments/${id}/payment`, input);
  }

  undoPayment(id: string): Observable<InstallmentDto> {
    return this.http.delete<InstallmentDto>(`${this.base}/installments/${id}/payment`);
  }

  obligations(): Observable<ObligationDto[]> {
    return this.http.get<ObligationDto[]>(`${this.base}/obligations`);
  }
  obligation(id: string): Observable<ObligationDetailDto> {
    return this.http.get<ObligationDetailDto>(`${this.base}/obligations/${id}`);
  }
  createObligation(input: ObligationInput): Observable<ObligationDto> {
    return this.http.post<ObligationDto>(`${this.base}/obligations`, input);
  }
  updateObligation(id: string, input: ObligationInput): Observable<ObligationDto> {
    return this.http.put<ObligationDto>(`${this.base}/obligations/${id}`, input);
  }
  deleteObligation(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/obligations/${id}`);
  }

  milestones(): Observable<MilestoneDto[]> {
    return this.http.get<MilestoneDto[]>(`${this.base}/milestones`);
  }
  updateMilestone(
    key: MilestoneKey,
    body: { expectedDate: IsoDate | null; actualDate: IsoDate | null },
  ): Observable<MilestoneUpdateResult> {
    return this.http.put<MilestoneUpdateResult>(`${this.base}/milestones/${key}`, body);
  }

  tasks(filter: TaskFilter = {}): Observable<TaskDto[]> {
    let params = new HttpParams();
    if (filter.phase) params = params.set('phase', filter.phase);
    if (filter.open !== undefined) params = params.set('open', String(filter.open));
    return this.http.get<TaskDto[]>(`${this.base}/tasks`, { params });
  }
  createTask(input: TaskInput): Observable<TaskDto> {
    return this.http.post<TaskDto>(`${this.base}/tasks`, input);
  }
  updateTask(id: string, input: TaskInput): Observable<TaskDto> {
    return this.http.put<TaskDto>(`${this.base}/tasks/${id}`, input);
  }
  deleteTask(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/tasks/${id}`);
  }
  toggleTask(id: string): Observable<TaskDto> {
    return this.http.post<TaskDto>(`${this.base}/tasks/${id}/toggle`, {});
  }

  settings(): Observable<SettingsDto> {
    return this.http.get<SettingsDto>(`${this.base}/settings`);
  }
  updateSettings(input: SettingsDto): Observable<SettingsDto> {
    return this.http.put<SettingsDto>(`${this.base}/settings`, input);
  }
}
