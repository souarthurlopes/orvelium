import { dateLabel, isDate, lineSubtotal, money, quoteNumber, today, totals, validateQuote, type Quote, type ClientSnapshot } from '../quotes/types';
import { servicePriorities, serviceStatuses, type ServiceInput, type ServiceOrder, type ServiceStatus, type ServiceChange, type StatusChange } from './types';
export const transitions: Record<ServiceStatus, ServiceStatus[]> = {
  pending: ['in_progress', 'cancelled'],
  in_progress: ['paused', 'completed', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};
export function serviceNumber(number: number) { return `OS-${String(number).padStart(6, '0')}`; }
export function terminal(status: ServiceStatus) { return status === 'completed' || status === 'cancelled'; }
export function overdue(order: Pick<ServiceOrder, 'status' | 'plannedEnd'>, on = today()) { return !terminal(order.status) && order.plannedEnd < on; }
export function validateService(input: ServiceInput, on = today()): string | null {
  if (typeof input.clientId !== 'string' || !input.clientId) return 'Selecione um cliente cadastrado ou um orçamento aprovado.';
  for (const [value, label, max] of [[input.title,'Título',160],[input.description,'Descrição',4000],[input.serviceType,'Tipo de serviço',80],[input.assignee,'Responsável',120]] as const) {
    if (typeof value !== 'string' || !value.trim() || value.length > max) return `${label} é obrigatório e deve ter até ${max} caracteres.`;
  }
  if (!Object.hasOwn(servicePriorities, input.priority)) return 'Selecione uma prioridade válida.';
  if (!isDate(input.openedDate) || input.openedDate > on || !isDate(input.plannedStart) || !isDate(input.plannedEnd) || input.plannedStart < input.openedDate || input.plannedEnd < input.plannedStart) return 'Revise as datas: abertura até hoje, início a partir da abertura e conclusão a partir do início.';
  if (!Number.isSafeInteger(input.expectedValueCents) || input.expectedValueCents < 0 || input.expectedValueCents > 1_000_000_000_000) return 'Informe um valor previsto válido, de zero até 1 trilhão de centavos.';
  if (typeof input.internalNotes !== 'string' || input.internalNotes.length > 4000) return 'Observações internas: até 4000 caracteres.';
  if (!Array.isArray(input.items) || input.items.length > 100 || new Set(input.items.map(i => i.id)).size !== input.items.length) return 'Use até 100 itens com identificadores únicos.';
  let sum = 0;
  for (const item of input.items) {
    if (typeof item.id !== 'string' || !item.id || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 300 || typeof item.unit !== 'string' || !item.unit.trim() || item.unit.length > 20 || item.quantityMilli > 1_000_000_000 || item.unitPriceCents > 10_000_000_000) return 'Revise descrição, quantidade, unidade e preço dos itens.';
    try { sum += lineSubtotal(item); } catch { return 'Quantidade ou preço de item inválido.'; }
    if (sum > 1_000_000_000_000) return 'O subtotal dos itens ultrapassa o limite permitido.';
  }
  return null;
}
export function normalizeService(input: ServiceInput): ServiceInput {
  return { clientId:input.clientId, openedDate:input.openedDate, plannedStart:input.plannedStart, plannedEnd:input.plannedEnd, priority:input.priority, expectedValueCents:input.expectedValueCents, title: input.title.trim(), description: input.description.trim(), serviceType: input.serviceType.trim(), assignee: input.assignee.trim(), internalNotes: input.internalNotes.trim(), items: input.items.map(i => ({ ...i, description:i.description.trim(), unit:i.unit.trim() })) };
}
export function validateStatusChange(order: ServiceOrder, change: StatusChange, on = today()): string | null {
  if (!transitions[order.status]?.includes(change.status)) return 'Transição de status não permitida. Ordens concluídas ou canceladas não podem ser reabertas nesta versão.';
  const previous = [...order.history].reverse().find(event => event.kind === 'status' || event.kind === 'created')!;
  if (!isDate(change.date) || change.date < order.openedDate || change.date < previous.effectiveDate || change.date > on) return 'A data da mudança deve estar entre a última mudança de status e hoje.';
  if (typeof change.note !== 'string' || !change.note.trim() || change.note.length > 1000) return 'Informe uma observação para a mudança, com até 1000 caracteres.';
  return null;
}
export function inputFromQuote(quote: Quote): ServiceInput {
  const date = today();
  return { clientId:quote.clientId, title:`Serviços de ${quoteNumber(quote.number)}`, description:quote.items.map(i => i.description).join('\n').slice(0,4000), serviceType:'Prestação de serviços', assignee:'', openedDate:date, plannedStart:date, plannedEnd:date, priority:'normal', expectedValueCents:totals(quote).total, items:structuredClone(quote.items), internalNotes:quote.notes };
}
export function emptyService(): ServiceInput {
  const date = today();
  return { clientId:'', title:'', description:'', serviceType:'', assignee:'', openedDate:date, plannedStart:date, plannedEnd:date, priority:'normal', expectedValueCents:0, items:[], internalNotes:'' };
}
const labels: Record<keyof ServiceInput, string> = { clientId:'Cliente', title:'Título', description:'Descrição', serviceType:'Tipo de serviço', assignee:'Responsável', openedDate:'Abertura', plannedStart:'Início previsto', plannedEnd:'Conclusão prevista', priority:'Prioridade', expectedValueCents:'Valor previsto', items:'Itens previstos', internalNotes:'Observações internas' };
export function serviceChanges(previous: ServiceOrder, input: ServiceInput, client: ClientSnapshot): ServiceChange[] {
  function display(key: keyof ServiceInput, value: ServiceInput[keyof ServiceInput], before: boolean) {
    if (key === 'clientId') return JSON.stringify(before ? previous.clientSnapshot : client);
    if (key === 'expectedValueCents') return money(value as number);
    if (key === 'priority') return servicePriorities[value as keyof typeof servicePriorities];
    if (key === 'items') return JSON.stringify(value);
    if (['openedDate','plannedStart','plannedEnd'].includes(key)) return dateLabel(value as string);
    return String(value);
  }
  return (Object.keys(labels) as (keyof ServiceInput)[]).filter(key => JSON.stringify(previous[key]) !== JSON.stringify(input[key])).map(key => ({ field:key, label:labels[key], before:display(key,previous[key],true), after:display(key,input[key],false) }));
}
export interface ServiceFilters { query: string; status: string; clientId: string; from: string; until: string; deadline: 'all' | 'late' | 'on_time'; sort: 'newest' | 'oldest' }
export const emptyFilters: ServiceFilters = { query:'', status:'all', clientId:'all', from:'', until:'', deadline:'all', sort:'newest' };
function search(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR'); }
export function filterServices(orders: ServiceOrder[], filters: ServiceFilters, on = today()) {
  const term = search(filters.query.trim());
  return orders.filter(order => (filters.status === 'all' || order.status === filters.status) && (filters.clientId === 'all' || order.clientId === filters.clientId) && (!filters.from || order.plannedEnd >= filters.from) && (!filters.until || order.plannedEnd <= filters.until) && (filters.deadline === 'all' || (filters.deadline === 'late' ? overdue(order,on) : !overdue(order,on))) && (!term || search(`${serviceNumber(order.number)} ${order.title} ${order.serviceType} ${order.clientSnapshot.name} ${order.assignee}`).includes(term))).sort((a,b) => filters.sort === 'newest' ? b.openedDate.localeCompare(a.openedDate) || b.number-a.number : a.openedDate.localeCompare(b.openedDate) || a.number-b.number);
}
export function serviceIndicators(orders: ServiceOrder[], on = today()) {
  return { open:orders.filter(o => !terminal(o.status)).length, inProgress:orders.filter(o => o.status === 'in_progress').length, late:orders.filter(o => overdue(o,on)).length, completed:orders.filter(o => o.status === 'completed').length };
}
/** Origin validation is independent of current quote storage: history survives deletion. */
export function validOrigin(quote: Quote) { return quote.status === 'approved' && !validateQuote(quote) && Number.isSafeInteger(quote.revision) && quote.revision > 0 && Number.isSafeInteger(quote.number) && quote.number > 0; }
export function changeText(field: string, value: string): string {
  if (!value) return 'Não informado';
  if (field === 'items' || field === 'clientId') {
    try {
      const parsed=JSON.parse(value);
      if(field==='items'&&Array.isArray(parsed))return parsed.length?parsed.map(item=>`${item.description} · ${item.quantityMilli/1000} ${item.unit} · ${money(item.unitPriceCents)}`).join('\n'):'Nenhum item';
      if(field==='clientId')return [parsed.name,parsed.document,parsed.phone,parsed.email,parsed.address,parsed.city,parsed.state].filter(Boolean).join(' · ');
    } catch { /* Preserve readable legacy text. */ }
  }
  return value;
}
