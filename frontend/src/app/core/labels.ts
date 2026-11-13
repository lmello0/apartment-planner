import {
  DocumentCategory, DocumentExpiry, FundingSource, InstallmentStatus, MilestoneKey, ObligationCategory, ObligationStatus,
  PaymentMethod, Periodicity, TaskPhase, CorrectionIndex,
} from './models';

export type Severity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

export const INSTALLMENT_STATUS: Record<InstallmentStatus, { label: string; severity: Severity; icon: string }> = {
  PENDING: { label: 'A vencer', severity: 'secondary', icon: 'pi pi-clock' },
  DUE_SOON: { label: 'Vence em breve', severity: 'warn', icon: 'pi pi-bell' },
  OVERDUE: { label: 'Atrasada', severity: 'danger', icon: 'pi pi-exclamation-triangle' },
  PAID: { label: 'Paga', severity: 'success', icon: 'pi pi-check' },
};

export const OBLIGATION_STATUS: Record<ObligationStatus, { label: string; severity: Severity; icon: string }> = {
  ESTIMATED: { label: 'Estimada', severity: 'warn', icon: 'pi pi-question-circle' },
  CONTRACTED: { label: 'Contratada', severity: 'info', icon: 'pi pi-lock' },
};

export const CATEGORY_LABEL: Record<ObligationCategory, string> = {
  BUILDER_INSTALLMENT: 'Parcela da construtora',
  BROKERAGE: 'Corretagem',
  FINANCING: 'Financiamento',
  FINANCING_DIFFERENCE: 'Diferença do financiamento',
  CONSTRUCTION_INTEREST: 'Juros de obra',
  FEE_TAX: 'Taxas e impostos',
  CONDO_IPTU: 'Condomínio e IPTU',
  OTHER: 'Outros',
};

export const FUNDING_LABEL: Record<FundingSource, string> = {
  OWN: 'Recursos próprios',
  FGTS: 'FGTS',
  SUBSIDY: 'Subsídio',
  FINANCING: 'Financiamento',
};

export const CORRECTION_LABEL: Record<CorrectionIndex, string> = {
  NONE: 'Sem correção',
  INCC_DI: 'INCC-DI',
  IGPM: 'IGP-M',
};

export const PERIODICITY_LABEL: Record<Periodicity, string> = {
  ONCE: 'Parcela única',
  MONTHLY: 'Mensal',
  ANNUAL: 'Anual',
  OPEN_ENDED: 'Mensal, sem fim definido',
};

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  DEBIT: 'Débito em conta',
  FGTS: 'FGTS',
  SUBSIDY: 'Subsídio',
};

export const PHASE_LABEL: Record<TaskPhase, string> = {
  PRE_CONTRACT: 'Pré-contrato',
  CREDIT_APPROVAL: 'Aprovação de crédito',
  SIGNING: 'Assinatura',
  CONSTRUCTION: 'Obra',
  KEY_DELIVERY: 'Entrega das chaves',
  POST_DELIVERY: 'Pós-entrega',
};

export const PHASE_ORDER: TaskPhase[] = [
  'PRE_CONTRACT', 'CREDIT_APPROVAL', 'SIGNING', 'CONSTRUCTION', 'KEY_DELIVERY', 'POST_DELIVERY',
];

export const MILESTONE_HELP: Record<MilestoneKey, string> = {
  FINANCING_SIGNED: 'Ao informar, inicia os juros de obra e vence a diferença do financiamento e a taxa de registro.',
  CONTRACT_REGISTERED: 'Cria a tarefa de apresentar a matrícula atualizada à Prefeitura de Santo André em 30 dias (multa do ITBI se atrasar).',
  DOCS_CALL: 'Cria a tarefa de entregar a documentação em 10 dias.',
  HABITE_SE: 'Muda o regime das parcelas em aberto (IGP-M + juros de 1% a.m.).',
  INSPECTION_CALL: 'Cria a tarefa de vistoria em 7 dias, inicia condomínio e IPTU e agenda a assistência técnica.',
  KEY_DELIVERY: 'Re-ancora a parcela das chaves e o financiamento; parcelas pagas não mudam.',
};

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  PAYMENT_RECEIPT: 'Comprovante de pagamento',
  CONTRACT: 'Contrato',
  PERSONAL_ID: 'Documento pessoal',
  INCOME_FGTS_TAX: 'Renda/FGTS/IR',
  FINANCING: 'Financiamento/Caixa',
  TAXES_FEES: 'Impostos e taxas',
  PROJECT_SPEC: 'Projeto/Memorial',
  OTHER: 'Outros',
};

export const DOCUMENT_EXPIRY: Record<DocumentExpiry, { label: string; severity: Severity; icon: string }> = {
  VALID: { label: 'Em dia', severity: 'success', icon: 'pi pi-check' },
  DUE_SOON: { label: 'Vence em breve', severity: 'warn', icon: 'pi pi-bell' },
  EXPIRED: { label: 'Vencido', severity: 'danger', icon: 'pi pi-exclamation-triangle' },
};

export const DOCUMENT_LINK_LABEL = {
  INSTALLMENT: 'Parcela',
  OBLIGATION: 'Obrigação',
  TASK: 'Tarefa',
  MILESTONE: 'Marco',
} as const;

export const enumOptions = <T extends string>(map: Record<T, string | { label: string }>) =>
  (Object.keys(map) as T[]).map((value) => {
    const v = map[value];
    return { value, label: typeof v === 'string' ? v : v.label };
  });
