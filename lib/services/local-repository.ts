import { createLocalClientRepository } from '../clients/local-repository';
import { type ClientRepository, validateClient } from '../clients/types';
import { createLocalQuoteRepository } from '../quotes/local-repository';
import { type ClientSnapshot, type QuoteRepository, today, isDate } from '../quotes/types';
import { normalizeService, serviceChanges, validateService, validateStatusChange, terminal, validOrigin } from './rules';
import { serviceStatuses, type ServiceRepository, type ServiceInput, type ServiceOrder, type ServiceEvent } from './types';
export function serviceStorageKey(workspace: string) { return `orvelium.services.v1:${encodeURIComponent(workspace)}`; }
interface Store { version: 1; nextNumber: number; orders: ServiceOrder[] }
function validClient(client: ClientSnapshot) {
  return !!client && typeof client.id === 'string' && !!client.id && ['name','document','phone','email','address','city','state'].every(key => typeof client[key as keyof ClientSnapshot] === 'string') && !validateClient({ ...client, notes:'', status:'active' });
}
function validDateTime(value: unknown) { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
function validStoredOrder(value: unknown): value is ServiceOrder {
  try {
    const order = value as ServiceOrder;
    return !validateService(order) && typeof order.id === 'string' && !!order.id && Number.isSafeInteger(order.number) && order.number > 0 && Number.isSafeInteger(order.revision) && order.revision > 0 && Object.hasOwn(serviceStatuses,order.status) && validClient(order.clientSnapshot) && order.clientId === order.clientSnapshot.id && typeof order.companySnapshot.name === 'string' && !!order.companySnapshot.name && (order.origin === null || (validOrigin(order.origin) && order.origin.clientId === order.clientId && validClient(order.origin.clientSnapshot))) && [order.actualStart,order.completedDate,order.cancelledDate].every(date => date === null || isDate(date as string)) && (order.status !== 'completed' || !!order.completedDate) && (order.status !== 'cancelled' || !!order.cancelledDate) && validDateTime(order.createdAt) && validDateTime(order.updatedAt) && Array.isArray(order.history) && order.history.length === order.revision && new Set(order.history.map(e => e.id)).size === order.history.length && order.history[0].kind === 'created' && order.history.every(e => typeof e.id === 'string' && !!e.id && ['created','updated','status'].includes(e.kind) && validDateTime(e.recordedAt) && isDate(e.effectiveDate) && typeof e.note === 'string' && Array.isArray(e.changes) && e.changes.every(c => ['field','label','before','after'].every(key => typeof c[key as keyof typeof c] === 'string')));
  } catch { return false; }
}
export function createLocalServiceRepository(workspace: string, clients: ClientRepository = createLocalClientRepository(workspace), quotes: QuoteRepository = createLocalQuoteRepository(workspace,clients)): ServiceRepository {
  const key = serviceStorageKey(workspace);
  function read(): Store {
    let raw: string | null;
    try { raw = window.localStorage.getItem(key); } catch { throw new Error('O navegador bloqueou o armazenamento local de Serviços. Verifique as permissões.'); }
    if (raw === null) return { version:1, nextNumber:1, orders:[] };
    try {
      const data = JSON.parse(raw) as Store;
      if (data.version !== 1 || !Array.isArray(data.orders) || !data.orders.every(validStoredOrder) || !Number.isSafeInteger(data.nextNumber) || data.nextNumber < 1 || data.orders.some(o => o.number >= data.nextNumber) || new Set(data.orders.map(o => o.id)).size !== data.orders.length || new Set(data.orders.map(o => o.number)).size !== data.orders.length || new Set(data.orders.filter(o => o.origin).map(o => o.origin!.id)).size !== data.orders.filter(o => o.origin).length) throw new Error();
      return data;
    } catch { throw new Error('Os dados locais de Serviços são inválidos e foram preservados. Revise o armazenamento antes de continuar.'); }
  }
  function write(data: Store) {
    try { window.localStorage.setItem(key, JSON.stringify(data)); } catch { throw new Error('Não foi possível salvar a OS neste navegador. Verifique o espaço e as permissões; nenhuma alteração foi confirmada.'); }
  }
  async function transaction<T>(action: () => Promise<T>): Promise<T> {
    if (typeof navigator !== 'undefined' && navigator.locks) return navigator.locks.request(key, action);
    return action();
  }
  async function clientSnapshot(id: string, previous?: ServiceOrder): Promise<ClientSnapshot> {
    if (previous?.clientId === id) return previous.clientSnapshot;
    const client = (await clients.list()).find(c => c.id === id);
    if (!client) throw new Error('Cliente não encontrado nesta empresa. Selecione um cliente cadastrado.');
    const {name,type,document,phone,email,address,city,state} = client;
    return {id,name,type,document,phone,email,address,city,state};
  }
  function event(kind: ServiceEvent['kind'], date: string, note: string, changes: ServiceEvent['changes'] = []): ServiceEvent {
    return { id:crypto.randomUUID(), kind, effectiveDate:date, recordedAt:new Date().toISOString(), note, changes };
  }
  function existing(id: string, revision: number) {
    const data=read();const previous=data.orders.find(order => order.id === id);
    if (!previous) throw new Error('Ordem de serviço não encontrada. Recarregue a lista.');
    if (previous.revision !== revision) throw new Error('A OS foi alterada em outra aba. Feche o painel e recarregue antes de continuar.');
    return { data, previous };
  }
  async function create(input: ServiceInput, origin?: { id: string; revision: number }) {
    return transaction(async () => {
      const error=validateService(input); if(error)throw new Error(error);
      const normalized=normalizeService(input);
      let quote: ServiceOrder['origin']=null;
      let customer: ClientSnapshot;
      if(origin){
        quote=(await quotes.list()).find(q => q.id === origin.id) ?? null;
        if(!quote || !validOrigin(quote))throw new Error('Selecione um orçamento aprovado desta empresa.');
        if(quote.revision !== origin.revision)throw new Error('O orçamento foi editado. Recarregue e importe a versão atual antes de criar a OS.');
        if(quote.clientId !== input.clientId)throw new Error('O cliente deve corresponder ao orçamento de origem.');
        customer=structuredClone(quote.clientSnapshot);
      }else customer=await clientSnapshot(input.clientId);
      const data=read();
      if(quote && data.orders.some(order => order.origin?.id === quote!.id))throw new Error('Já existe uma OS vinculada a este orçamento, inclusive se estiver cancelada. Consulte a ordem existente.');
      if(data.nextNumber >= Number.MAX_SAFE_INTEGER)throw new Error('Limite de numeração de OS atingido.');
      const now=new Date().toISOString();
      const order: ServiceOrder={...normalized,id:crypto.randomUUID(),number:data.nextNumber,revision:1,companySnapshot:{name:workspace},clientSnapshot:customer,origin:quote?structuredClone(quote):null,status:'pending',actualStart:null,completedDate:null,cancelledDate:null,history:[event('created',input.openedDate,quote?'OS aberta a partir de orçamento aprovado. Dados originais preservados.':'OS aberta manualmente.')],createdAt:now,updatedAt:now};
      write({...data,nextNumber:data.nextNumber+1,orders:[...data.orders,order]});return order;
    });
  }
  return {
    async list(){return read().orders.sort((a,b) => b.number-a.number);},
    create(input){return create(input);},
    createFromQuote(quoteId,quoteRevision,input){return create(input,{id:quoteId,revision:quoteRevision});},
    async update(id,revision,input){return transaction(async()=>{
      const {previous}=existing(id,revision);
      if(terminal(previous.status))throw new Error('OS concluídas ou canceladas não podem ser editadas. O histórico foi preservado.');
      const error=validateService(input);if(error)throw new Error(error);
      if(input.openedDate !== previous.openedDate)throw new Error('A data original de abertura não pode ser alterada.');
      if(previous.origin && input.clientId !== previous.clientId)throw new Error('O cliente de uma OS vinculada a orçamento não pode ser trocado.');
      const normalized=normalizeService(input);const customer=await clientSnapshot(input.clientId,previous);
      const {data}=existing(id,revision);
      const changes=serviceChanges(previous,normalized,customer);
      if(!changes.length)return previous;
      const order: ServiceOrder={...previous,...normalized,clientSnapshot:customer,revision:previous.revision+1,history:[...previous.history,event('updated',today(),'Dados de planejamento atualizados.',changes)],updatedAt:new Date().toISOString()};
      write({...data,orders:data.orders.map(o => o.id === id?order:o)});return order;
    });},
    async changeStatus(id,revision,change){return transaction(async()=>{
      const {data,previous}=existing(id,revision);const error=validateStatusChange(previous,change);if(error)throw new Error(error);
      const order: ServiceOrder={...previous,status:change.status,actualStart:previous.actualStart??(change.status === 'in_progress'?change.date:null),completedDate:change.status === 'completed'?change.date:null,cancelledDate:change.status === 'cancelled'?change.date:null,revision:previous.revision+1,history:[...previous.history,event('status',change.date,change.note.trim(),[{field:'status',label:'Status',before:serviceStatuses[previous.status],after:serviceStatuses[change.status]}])],updatedAt:new Date().toISOString()};
      write({...data,orders:data.orders.map(o => o.id === id?order:o)});return order;
    });},
  };
}
