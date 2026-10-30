import type { Client } from '../clients/types';
export const quoteStatuses = { draft: 'Rascunho', sent: 'Enviado', approved: 'Aprovado', rejected: 'Recusado', expired: 'Vencido' } as const;
export type QuoteStatus = keyof typeof quoteStatuses;
export interface QuoteItem { id: string; description: string; quantityMilli: number; unit: string; unitPriceCents: number }
export interface QuoteInput {
  clientId: string;
  date: string;
  validUntil: string;
  status: QuoteStatus;
  items: QuoteItem[];
  discount: { kind: 'fixed' | 'percent'; value: number }; // cents or basis points (100 = 1%)
  notes: string;
  paymentTerms: string;
}
export type ClientSnapshot = Pick<Client, 'id' | 'name' | 'type' | 'document' | 'phone' | 'email' | 'address' | 'city' | 'state'>;
export interface Quote extends QuoteInput {
  id: string; number: number; revision: number;
  clientSnapshot: ClientSnapshot;
  companySnapshot: { name: string };
  issuedAt: string | null;
  createdAt: string; updatedAt: string;
}
export interface QuoteRepository {
  list(): Promise<Quote[]>;
  create(input: QuoteInput): Promise<Quote>;
  update(id: string, input: QuoteInput, revision: number): Promise<Quote>;
  remove(id: string, revision: number): Promise<void>;
}
export function today() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`;
}
export function dateLabel(value: string) { return value.split('-').reverse().join('/'); }
export function quoteNumber(value: number) { return `ORC-${String(value).padStart(6, '0')}`; }
export function money(cents: number) { return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
/** Parse decimal input with integer arithmetic; never multiply a float by 100. */
export function parseDecimal(value: string, precision = 2): number | null {
  const text = value.trim().replace(',', '.');
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${precision}})?$`).test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const result = BigInt(whole) * (10n ** BigInt(precision)) + BigInt(fraction.padEnd(precision, '0'));
  return result <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(result) : null;
}
export function decimalInput(value: number, precision = 2) { return (value / (10 ** precision)).toFixed(precision); }
const MAX_TOTAL = 1_000_000_000_000;
export function lineSubtotal(item: QuoteItem): number {
  if (!Number.isSafeInteger(item.quantityMilli) || !Number.isSafeInteger(item.unitPriceCents) || item.quantityMilli <= 0 || item.unitPriceCents < 0) throw new Error('Quantidade ou preço inválido.');
  const result = (BigInt(item.quantityMilli) * BigInt(item.unitPriceCents) + 500n) / 1000n;
  if (result > BigInt(MAX_TOTAL)) throw new Error('O subtotal excede o limite permitido.');
  return Number(result);
}
export function totals(input: Pick<QuoteInput, 'items' | 'discount'>) {
  let subtotal = 0;
  for (const item of input.items) { subtotal += lineSubtotal(item); if (subtotal > MAX_TOTAL) throw new Error('O orçamento excede o limite permitido.'); }
  const { kind, value } = input.discount;
  if (!['fixed','percent'].includes(kind) || !Number.isSafeInteger(value) || value < 0 || (kind === 'percent' && value > 10000)) throw new Error('Informe um desconto válido (percentual de 0 a 100%).');
  const discount = kind === 'fixed' ? value : Number((BigInt(subtotal) * BigInt(value) + 5000n) / 10000n);
  if (discount > subtotal) throw new Error('O desconto não pode ultrapassar o subtotal.');
  return { subtotal, discount, total: subtotal - discount };
}
export function isDate(value: string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) === value; }
export function effectiveStatus(quote: Pick<QuoteInput, 'status' | 'validUntil'>, on = today()): QuoteStatus {
  return quote.status === 'sent' && quote.validUntil < on ? 'expired' : quote.status;
}
export function validateQuote(input: QuoteInput): string | null {
  if (typeof input.clientId !== 'string' || !input.clientId) return 'Selecione um cliente cadastrado nesta empresa.';
  if (!Object.hasOwn(quoteStatuses, input.status)) return 'Selecione uma situação válida.';
  if (!isDate(input.date) || !isDate(input.validUntil) || input.validUntil < input.date) return 'Informe datas válidas; a validade não pode ser anterior à data do orçamento.';
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) return 'Adicione de 1 a 100 itens.';
  if (new Set(input.items.map(i => i.id)).size !== input.items.length) return 'Os itens devem ter identificadores únicos.';
  for (const item of input.items) {
    if (!item.id || typeof item.description !== 'string' || !item.description.trim() || item.description.length > 300 || typeof item.unit !== 'string' || !item.unit.trim() || item.unit.length > 20) return 'Preencha a descrição e a unidade de todos os itens.';
    if (item.quantityMilli > 1_000_000_000 || item.unitPriceCents > 10_000_000_000) return 'Quantidade ou preço acima do limite permitido.';
  }
  if (typeof input.notes !== 'string' || input.notes.length > 4000 || typeof input.paymentTerms !== 'string' || input.paymentTerms.length > 2000) return 'Observações: até 4000 caracteres. Condições de pagamento: até 2000.';
  try { totals(input); } catch (error) { return error instanceof Error ? error.message : 'Revise os valores.'; }
  return null;
}
export function duplicateInput(quote: Quote, clients: Client[]): QuoteInput {
  const date = today();
  return { clientId: clients.some(c => c.id === quote.clientId) ? quote.clientId : '', date, validUntil: quote.validUntil >= date ? quote.validUntil : date, status: 'draft', items: quote.items.map(item => ({ ...item, id: crypto.randomUUID() })), discount: { ...quote.discount }, notes: quote.notes, paymentTerms: quote.paymentTerms };
}
