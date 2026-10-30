import { createLocalClientRepository } from '../clients/local-repository';
import { type ClientRepository, validateClient } from '../clients/types';
import { type Quote, type QuoteInput, type QuoteRepository, validateQuote, today } from './types';
export function quoteStorageKey(workspace: string) { return `orvelium.quotes.v1:${encodeURIComponent(workspace)}`; }
interface Store { version: 1; nextNumber: number; quotes: Quote[] }
function validStoredQuote(value: unknown): value is Quote {
  try {
    const q = value as Quote;
    const client = q.clientSnapshot;
    return !validateQuote(q) && typeof q.id === 'string' && !!q.id && Number.isSafeInteger(q.number) && q.number > 0 && Number.isSafeInteger(q.revision) && q.revision > 0 && !!client && q.clientId === client.id && ['name','document','phone','email','address','city','state'].every(key => typeof client[key as keyof typeof client] === 'string') && !validateClient({ ...client, status: 'active', notes: '' }) && typeof q.companySnapshot?.name === 'string' && !!q.companySnapshot.name && [q.createdAt,q.updatedAt].every(t => typeof t === 'string' && !Number.isNaN(Date.parse(t))) && (q.issuedAt === null || (typeof q.issuedAt === 'string' && !Number.isNaN(Date.parse(q.issuedAt))));
  } catch { return false; }
}
export function createLocalQuoteRepository(workspace: string, clients: ClientRepository = createLocalClientRepository(workspace)): QuoteRepository {
  const key = quoteStorageKey(workspace);
  function read(): Store {
    let raw: string | null;
    try { raw = window.localStorage.getItem(key); } catch { throw new Error('O armazenamento local está bloqueado. Habilite-o para usar Orçamentos.'); }
    if (raw === null) return { version: 1, nextNumber: 1, quotes: [] };
    try {
      const data = JSON.parse(raw) as Store;
      if (data.version !== 1 || !Array.isArray(data.quotes) || !data.quotes.every(validStoredQuote) || !Number.isSafeInteger(data.nextNumber) || data.nextNumber < 1 || data.quotes.some(q => q.number >= data.nextNumber) || new Set(data.quotes.map(q => q.id)).size !== data.quotes.length || new Set(data.quotes.map(q => q.number)).size !== data.quotes.length) throw new Error();
      return data;
    } catch { throw new Error('Os dados locais de Orçamentos são inválidos e foram preservados. Revise o armazenamento do navegador antes de continuar.'); }
  }
  function write(data: Store) {
    try { window.localStorage.setItem(key, JSON.stringify(data)); } catch { throw new Error('Não foi possível salvar no navegador. Verifique o espaço e as permissões. Nenhuma alteração foi confirmada.'); }
  }
  // Supported browsers serialize quote mutations across tabs. Supabase should use DB transactions.
  async function transaction<T>(action: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(key, action);
    return action();
  }
  async function snapshot(input: QuoteInput, previous?: Quote) {
    const error = validateQuote(input); if (error) throw new Error(error);
    if (input.status === 'expired' && input.validUntil >= today()) throw new Error('Um orçamento vencido deve ter validade anterior a hoje.');
    if (previous?.issuedAt) {
      if (previous.clientId !== input.clientId) throw new Error('O cliente de um orçamento emitido não pode ser trocado. Duplique a proposta para escolher outro cliente.');
      return previous.clientSnapshot;
    }
    const client = (await clients.list()).find(c => c.id === input.clientId);
    if (!client) throw new Error('Cliente não encontrado nesta empresa. Selecione um cliente cadastrado antes de salvar.');
    const { id,name,type,document,phone,email,address,city,state } = client;
    return { id,name,type,document,phone,email,address,city,state };
  }
  return {
    async list() { return read().quotes.sort((a,b) => b.number - a.number); },
    async create(input) { return transaction(async () => {
      const clientSnapshot = await snapshot(input);
      const data = read();
      if (data.nextNumber >= Number.MAX_SAFE_INTEGER) throw new Error('Limite de numeração atingido.');
      const now = new Date().toISOString();
      const quote: Quote = { ...structuredClone(input), id: crypto.randomUUID(), number: data.nextNumber, revision: 1, clientSnapshot, companySnapshot: { name: workspace }, issuedAt: input.status === 'draft' ? null : now, createdAt: now, updatedAt: now };
      write({ version: 1, nextNumber: data.nextNumber + 1, quotes: [...data.quotes, quote] }); return quote;
    }); },
    async update(id, input, revision) { return transaction(async () => {
      let data = read();
      const previous = data.quotes.find(q => q.id === id);
      if (!previous) throw new Error('Orçamento não encontrado. Recarregue a lista.');
      if (previous.revision !== revision) throw new Error('Este orçamento foi alterado em outra aba. Feche o painel e recarregue a lista antes de editar.');
      const clientSnapshot = await snapshot(input, previous);
      data = read();
      if (data.quotes.find(q => q.id === id)?.revision !== revision) throw new Error('O orçamento mudou durante a edição. Recarregue a lista.');
      const now = new Date().toISOString();
      const quote: Quote = { ...previous, ...structuredClone(input), clientSnapshot, issuedAt: previous.issuedAt ?? (input.status === 'draft' ? null : now), revision: previous.revision + 1, updatedAt: now };
      write({ ...data, quotes: data.quotes.map(q => q.id === id ? quote : q) }); return quote;
    }); },
    async remove(id, revision) { return transaction(async () => {
      const data = read(); const previous = data.quotes.find(q => q.id === id);
      if (!previous) throw new Error('Orçamento não encontrado.');
      if (previous.revision !== revision) throw new Error('O orçamento mudou. Recarregue antes de excluir.');
      write({ ...data, quotes: data.quotes.filter(q => q.id !== id) });
    }); },
  };
}
