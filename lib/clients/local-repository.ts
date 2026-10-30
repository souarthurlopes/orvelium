import { type Client, type ClientInput, type ClientRepository, normalizeClient, validateClient } from './types';
const fields = ['name', 'document', 'phone', 'email', 'address', 'city', 'state', 'notes', 'id', 'createdAt', 'updatedAt'] as const;
function isClient(value: unknown): value is Client {
  if (!value || typeof value !== 'object') return false;
  const row = value as Client;
  return fields.every(field => typeof row[field] === 'string') && !!row.id && !validateClient(row) && !Number.isNaN(Date.parse(row.createdAt)) && !Number.isNaN(Date.parse(row.updatedAt));
}
export function clientStorageKey(workspace: string) { return `orvelium.clients.v1:${encodeURIComponent(workspace)}`; }
/** Local only. Each workspace has its own versioned collection. No network calls. */
export function createLocalClientRepository(workspace: string): ClientRepository {
  const key = clientStorageKey(workspace);
  function read(): Client[] {
    let raw: string | null;
    try { raw = window.localStorage.getItem(key); }
    catch { throw new Error('O navegador bloqueou o armazenamento local. Habilite-o para usar Clientes.'); }
    if (raw === null) return [];
    try {
      const data = JSON.parse(raw);
      if (data.version !== 1 || !Array.isArray(data.clients) || !data.clients.every(isClient) || new Set(data.clients.map((c: Client) => c.id)).size !== data.clients.length) throw new Error();
      return data.clients;
    } catch { throw new Error('Os dados locais de Clientes estão em formato inválido. Eles foram preservados. Revise o armazenamento do navegador ou use outro perfil para testar.'); }
  }
  function write(clients: Client[]) {
    try { window.localStorage.setItem(key, JSON.stringify({ version: 1, clients })); }
    catch { throw new Error('Não foi possível salvar no navegador. O armazenamento pode estar cheio ou bloqueado. Nenhuma alteração foi confirmada.'); }
  }
  function checked(input: ClientInput, rows: Client[], exceptId?: string) {
    const error = validateClient(input);
    if (error) throw new Error(error);
    const normalized = normalizeClient(input);
    if (rows.some(row => row.id !== exceptId && row.document === normalized.document)) throw new Error('Já existe um cliente com esse CPF/CNPJ nesta empresa.');
    return normalized;
  }
  return {
    async list() { return read().sort((a,b) => a.name.localeCompare(b.name, 'pt-BR')); },
    async create(input) {
      const rows = read();
      const data = checked(input, rows);
      const now = new Date().toISOString();
      const client: Client = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
      write([...rows, client]);
      return client;
    },
    async update(id, input) {
      const rows = read();
      const previous = rows.find(row => row.id === id);
      if (!previous) throw new Error('Cliente não encontrado. Recarregue a lista e tente novamente.');
      const client = { ...previous, ...checked(input, rows, id), updatedAt: new Date().toISOString() };
      write(rows.map(row => row.id === id ? client : row));
      return client;
    },
    async remove(id) {
      const rows = read();
      if (!rows.some(row => row.id === id)) throw new Error('Este cliente já foi excluído. Recarregue a lista.');
      write(rows.filter(row => row.id !== id));
    },
  };
}
