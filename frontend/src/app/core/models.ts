/**
 * API contract types (base path /api). JSON is camelCase.
 * Money is always a decimal string with 2 places ("2548.00"); dates are ISO "YYYY-MM-DD".
 */

export type Money = string;
export type IsoDate = string;

export type PaymentMethod = 'PIX' | 'BOLETO' | 'DEBIT' | 'FGTS' | 'SUBSIDY';
export type InstallmentStatus = 'PENDING' | 'DUE_SOON' | 'OVERDUE' | 'PAID';
export type ObligationCategory =
  | 'BUILDER_INSTALLMENT'
  | 'BROKERAGE'
  | 'FINANCING'
  | 'FINANCING_DIFFERENCE'
  | 'CONSTRUCTION_INTEREST'
  | 'FEE_TAX'
  | 'CONDO_IPTU'
  | 'OTHER';
export type ObligationStatus = 'ESTIMATED' | 'CONTRACTED';
export type FundingSource = 'OWN' | 'FGTS' | 'SUBSIDY' | 'FINANCING';
export type CorrectionIndex = 'NONE' | 'INCC_DI' | 'IGPM';
export type Periodicity = 'ONCE' | 'MONTHLY' | 'ANNUAL' | 'OPEN_ENDED';
export type MilestoneKey =
  | 'FINANCING_SIGNED'
  | 'CONTRACT_REGISTERED'
  | 'DOCS_CALL'
  | 'HABITE_SE'
  | 'INSPECTION_CALL'
  | 'KEY_DELIVERY';
export type TaskPhase =
  | 'PRE_CONTRACT'
  | 'CREDIT_APPROVAL'
  | 'SIGNING'
  | 'CONSTRUCTION'
  | 'KEY_DELIVERY'
  | 'POST_DELIVERY';
export type TaskSource = 'TEMPLATE' | 'RULE' | 'MANUAL';

export interface PaymentDto {
  paidOn: IsoDate;
  amount: Money;
  method: PaymentMethod;
}

export interface InstallmentDto {
  id: string;
  obligationId: string;
  obligationName: string;
  seq: number;
  count: number;
  dueDate: IsoDate;
  expectedAmount: Money;
  projectedAmount: Money;
  status: InstallmentStatus;
  payment: PaymentDto | null;
  /** Active documents linked to this installment (receipts, boletos…). */
  documentCount: number;
}

export interface ObligationDto {
  id: string;
  name: string;
  payee: string;
  category: ObligationCategory;
  status: ObligationStatus;
  fundingSource: FundingSource;
  correctionIndex: CorrectionIndex;
  periodicity: Periodicity;
  count: number | null;
  amount: Money;
  amounts: Money[] | null;
  dayOfMonth: number | null;
  firstDueDate: IsoDate | null;
  anchorMilestone: MilestoneKey | null;
  offsetDays: number;
  notes: string | null;
  totalExpected: Money;
  totalPaid: Money;
}

export type ObligationDetailDto = ObligationDto & { installments: InstallmentDto[] };

/** Body for POST/PUT /api/obligations (server computes id and totals). */
export type ObligationInput = Omit<ObligationDto, 'id' | 'totalExpected' | 'totalPaid'>;

export interface MilestoneDto {
  key: MilestoneKey;
  label: string;
  expectedDate: IsoDate | null;
  actualDate: IsoDate | null;
}

export interface MilestoneUpdateResult {
  milestone: MilestoneDto;
  effects: string[];
}

export interface TaskDto {
  id: string;
  title: string;
  phase: TaskPhase;
  dueDate: IsoDate | null;
  doneAt: IsoDate | null;
  notes: string | null;
  obligationId: string | null;
  installmentId: string | null;
  source: TaskSource;
}

/** PUT /api/tasks replaces the task, so send the current doneAt back or the task reopens. */
export type TaskInput = Pick<
  TaskDto,
  'title' | 'phase' | 'dueDate' | 'notes' | 'obligationId' | 'installmentId'
> & { doneAt?: IsoDate | null };

export interface SettingsDto {
  monthlyCapacity: Money;
  inccMonthlyEstimate: string;
  igpmMonthlyEstimate: string;
  dueSoonDays: number;
}

export interface PaymentInput {
  paidOn: IsoDate;
  amount: Money;
  method: PaymentMethod;
}

export interface InstallmentFilter {
  status?: 'OPEN' | InstallmentStatus;
  obligationId?: string;
  from?: IsoDate;
  to?: IsoDate;
}

export interface TaskFilter {
  phase?: TaskPhase;
  open?: boolean;
}

export interface DashboardDto {
  totals: {
    /** Contract value: sum of contractual amounts, no INCC/IGP-M. */
    expected: Money;
    /** Unpaid at projected amount + paid at the amount actually paid. */
    projected: Money;
    /** projected − expected (estimated correction). */
    projectedCorrection: Money;
    paid: Money;
    /** projected − paid; includes overdue. */
    pending: Money;
    /** Unpaid and past due; a subset of pending. */
    overdue: Money;
  };
  upcoming: InstallmentDto[];
  overdue: InstallmentDto[];
  byObligation: {
    obligationId: string;
    name: string;
    expected: Money;
    projected: Money;
    paid: Money;
    pending: Money;
  }[];
  monthly: { month: string; expected: Money; paid: Money }[];
  capacity: { monthlyCapacity: Money; currentMonthCommitment: Money; exceeded: boolean };
  nextTasks: TaskDto[];
  /** Documents already expired or about to (validUntil ascending). */
  expiringDocuments: DocumentDto[];
}

export type DocumentCategory =
  | 'PAYMENT_RECEIPT'
  | 'CONTRACT'
  | 'PERSONAL_ID'
  | 'INCOME_FGTS_TAX'
  | 'FINANCING'
  | 'TAXES_FEES'
  | 'PROJECT_SPEC'
  | 'OTHER';
export type DocumentExpiry = 'VALID' | 'DUE_SOON' | 'EXPIRED';
export type DocumentLinkType = 'INSTALLMENT' | 'OBLIGATION' | 'TASK' | 'MILESTONE';

export interface DocumentLink {
  type: DocumentLinkType;
  /** Installment/obligation/task id, or the MilestoneKey. */
  id: string;
  label: string;
}

export interface DocumentDto {
  id: string;
  title: string;
  category: DocumentCategory;
  documentDate: IsoDate | null;
  validUntil: IsoDate | null;
  notes: string | null;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  link: DocumentLink | null;
  expiry: DocumentExpiry | null;
}

/** Body of PUT /api/documents/{id} (replaces everything, including the link). At most one link field. */
export interface DocumentInput {
  title: string;
  category: DocumentCategory;
  documentDate?: IsoDate | null;
  validUntil?: IsoDate | null;
  notes?: string | null;
  installmentId?: string | null;
  obligationId?: string | null;
  taskId?: string | null;
  milestoneKey?: MilestoneKey | null;
}

/** Body of POST /api/documents: the metadata plus what the browser knows about the file. */
export type DocumentCreateInput = DocumentInput & { originalName: string; mimeType: string; sizeBytes: number };

export interface UploadInfo {
  url: string;
  method: string;
  headers: Record<string, string>;
}

export interface DocumentFilter {
  category?: DocumentCategory;
  q?: string;
  installmentId?: string;
  obligationId?: string;
  taskId?: string;
  milestoneKey?: MilestoneKey;
}

/** Limits enforced by the API (POST /documents and confirm). */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
];
