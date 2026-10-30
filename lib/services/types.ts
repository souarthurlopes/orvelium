import type { ClientSnapshot, Quote, QuoteItem } from '../quotes/types';
export const serviceStatuses = { pending: 'Pendente', in_progress: 'Em andamento', paused: 'Pausada', completed: 'Concluída', cancelled: 'Cancelada' } as const;
export const servicePriorities = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' } as const;
export type ServiceStatus = keyof typeof serviceStatuses;
export type ServicePriority = keyof typeof servicePriorities;
export interface ServiceInput {
  clientId: string;
  title: string;
  description: string;
  serviceType: string;
  assignee: string;
  openedDate: string;
  plannedStart: string;
  plannedEnd: string;
  priority: ServicePriority;
  expectedValueCents: number;
  items: QuoteItem[];
  internalNotes: string;
}
export interface ServiceChange { field: string; label: string; before: string; after: string }
export interface ServiceEvent {
  id: string;
  kind: 'created' | 'updated' | 'status';
  recordedAt: string;
  effectiveDate: string;
  note: string;
  changes: ServiceChange[];
}
export interface ServiceOrder extends ServiceInput {
  id: string;
  number: number;
  revision: number;
  companySnapshot: { name: string };
  clientSnapshot: ClientSnapshot;
  origin: Quote | null;
  status: ServiceStatus;
  actualStart: string | null;
  completedDate: string | null;
  cancelledDate: string | null;
  history: ServiceEvent[];
  createdAt: string;
  updatedAt: string;
}
export interface StatusChange { status: ServiceStatus; date: string; note: string }
/** Implement these operations transactionally when migrating to Supabase. */
export interface ServiceRepository {
  list(): Promise<ServiceOrder[]>;
  create(input: ServiceInput): Promise<ServiceOrder>;
  createFromQuote(quoteId: string, quoteRevision: number, input: ServiceInput): Promise<ServiceOrder>;
  update(id: string, revision: number, input: ServiceInput): Promise<ServiceOrder>;
  changeStatus(id: string, revision: number, change: StatusChange): Promise<ServiceOrder>;
}
