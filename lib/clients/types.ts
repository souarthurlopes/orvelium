export type ClientType = 'individual' | 'company';
export type ClientStatus = 'active' | 'inactive';
export interface ClientInput {
  type: ClientType;
  status: ClientStatus;
  name: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  notes: string;
}
export interface Client extends ClientInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}
/** Replace this adapter with a Supabase implementation without changing the UI. */
export interface ClientRepository {
  list(): Promise<Client[]>;
  create(input: ClientInput): Promise<Client>;
  update(id: string, input: ClientInput): Promise<Client>;
  remove(id: string): Promise<void>;
}
export const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export const emptyClient: ClientInput = {
  type: 'individual', status: 'active', name: '', document: '', phone: '', email: '', address: '', city: '', state: '', notes: '',
};
export function digits(value: string) { return value.replace(/\D/g, ''); }
export function formatDocument(value: string, type: ClientType) {
  const number = digits(value);
  if (type === 'individual' && number.length === 11) return number.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (type === 'company' && number.length === 14) return number.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return value;
}
export function normalizeClient(input: ClientInput): ClientInput {
  return { ...input, name: input.name.trim(), document: digits(input.document), phone: digits(input.phone), email: input.email.trim(), address: input.address.trim(), city: input.city.trim(), notes: input.notes.trim() };
}
export function validateClient(input: ClientInput): string | null {
  if (!['individual', 'company'].includes(input.type) || !['active', 'inactive'].includes(input.status)) return 'Selecione um tipo e uma situação válidos.';
  if (!input.name.trim() || input.name.length > 120) return 'Informe um nome de até 120 caracteres.';
  if (!/^[0-9\s./-]+$/.test(input.document) || digits(input.document).length !== (input.type === 'individual' ? 11 : 14)) return `Informe um ${input.type === 'individual' ? 'CPF com 11' : 'CNPJ com 14'} dígitos fictícios.`;
  if (input.phone && !/^[0-9 ()+.-]+$/.test(input.phone)) return 'Informe um telefone fictício válido.';
  if (input.phone && ![10, 11].includes(digits(input.phone).length)) return 'O telefone deve ter DDD e 10 ou 11 dígitos.';
  if (input.email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 160)) return 'Informe um e-mail de exemplo válido.';
  if (input.state && !states.includes(input.state)) return 'Selecione um estado válido.';
  if (input.address.length > 200 || input.city.length > 80 || input.notes.length > 2000) return 'Revise o tamanho do endereço, cidade ou observações.';
  return null;
}
