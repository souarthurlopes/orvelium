import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json, QuoteRow } from '@/lib/supabase/database.types';
import { type Quote, type QuoteInput, type QuoteRepository, validateQuote, totals } from './types';
import { validateClient } from '../clients/types';
export class QuoteRepositoryError extends Error {}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const columns='id,company_id,number,revision,client_id,client_snapshot,company_snapshot,date,valid_until,status,items,discount_kind,discount_value,subtotal_cents,discount_cents,total_cents,notes,payment_terms,issued_at,created_at,updated_at' as const;
function checked(input:QuoteInput):Json{
 try{
  const error=validateQuote(input);if(error)throw new QuoteRepositoryError(error);
  if(!uuid.test(input.clientId)||input.items.some(item=>typeof item.id!=='string'||item.id.length>100))throw new QuoteRepositoryError('Selecione um cliente válido e revise os itens.');
  return {clientId:input.clientId,date:input.date,validUntil:input.validUntil,status:input.status,items:input.items.map(({id,description,quantityMilli,unit,unitPriceCents})=>({id,description,quantityMilli,unit,unitPriceCents})),discount:{kind:input.discount.kind,value:input.discount.value},notes:input.notes,paymentTerms:input.paymentTerms};
 }catch(error){if(error instanceof QuoteRepositoryError)throw error;throw new QuoteRepositoryError('Revise os campos do orçamento.');}
}
function failure(error:{code?:string}|null):never{
 if(error?.code==='42501')throw new QuoteRepositoryError('Você não tem permissão para esta operação de Orçamentos.');
 if(error?.code==='40001')throw new QuoteRepositoryError('Este orçamento foi alterado em outra sessão. Feche o painel e atualize a lista antes de editar.');
 if(error?.code==='P0002'||error?.code==='PGRST116')throw new QuoteRepositoryError('Orçamento ou cliente indisponível nesta empresa. Atualize a lista e confira o cadastro.');
 if(['22023','22007','22008','22P02','23514'].includes(error?.code||''))throw new QuoteRepositoryError('Revise os dados. O cliente de uma proposta emitida não pode ser trocado; verifique também datas, itens, limites e desconto.');
 if(['42P01','42883','PGRST202','PGRST205'].includes(error?.code||''))throw new QuoteRepositoryError('Orçamentos ainda não está disponível neste ambiente. Solicite sua atualização.');
 throw new QuoteRepositoryError('Não foi possível concluir a operação de Orçamentos. Verifique a conexão e tente novamente.');
}
function quote(row:Omit<QuoteRow,'created_by'>,companyId:string):Quote{
 try{
  if(row.company_id!==companyId)throw new Error();
  const result:Quote={id:row.id,number:row.number,revision:row.revision,clientId:row.client_id,clientSnapshot:row.client_snapshot as unknown as Quote['clientSnapshot'],companySnapshot:row.company_snapshot as unknown as Quote['companySnapshot'],date:row.date,validUntil:row.valid_until,status:row.status,items:row.items as unknown as Quote['items'],discount:{kind:row.discount_kind,value:row.discount_value},notes:row.notes,paymentTerms:row.payment_terms,issuedAt:row.issued_at,createdAt:row.created_at,updatedAt:row.updated_at};
  if(!uuid.test(result.id)||!Number.isSafeInteger(result.number)||result.number<1||!Number.isSafeInteger(result.revision)||result.revision<1||validateQuote(result)||result.clientSnapshot.id!==result.clientId||validateClient({...result.clientSnapshot,status:'active',notes:''})||!result.companySnapshot.name)throw new Error();
  const calculated=totals(result);if(calculated.subtotal!==row.subtotal_cents||calculated.discount!==row.discount_cents||calculated.total!==row.total_cents)throw new Error();
  return result;
 }catch{throw new QuoteRepositoryError('Não foi possível validar os dados do orçamento. Atualize a lista.');}
}
export function createSupabaseQuoteRepository(supabase:SupabaseClient<Database>,companyId:string):QuoteRepository{
 if(!uuid.test(companyId))throw new QuoteRepositoryError('Selecione uma empresa válida.');
 function identity(id:string,revision:number){if(!uuid.test(id)||!Number.isSafeInteger(revision)||revision<1)throw new QuoteRepositoryError('Identificador ou revisão inválida. Atualize a lista.');}
 return {
  async list(){const rows:Quote[]=[];const seen=new Set<string>();let offset=0;
   for(;;){const {data,error,count}=await supabase.from('quotes').select(columns,{count:'exact'}).eq('company_id',companyId).order('number',{ascending:false}).range(offset,offset+499);if(error||!data)failure(error);
    for(const row of data){if(seen.has(row.id))throw new QuoteRepositoryError('A lista mudou durante a leitura. Atualize e tente novamente.');seen.add(row.id);rows.push(quote(row,companyId));}offset+=data.length;
    if(count!==null&&offset>=count)break;if(count===null&&data.length<500)break;if(!data.length)throw new QuoteRepositoryError('A lista mudou durante a leitura. Atualize e tente novamente.');
   }return rows;
  },
  async create(input){const {data,error}=await supabase.rpc('create_quote',{p_company_id:companyId,p_input:checked(input)}).single();if(error||!data)failure(error);return quote(data,companyId);},
  async update(id,input,revision){identity(id,revision);const {data,error}=await supabase.rpc('update_quote',{p_company_id:companyId,p_quote_id:id,p_revision:revision,p_input:checked(input)}).single();if(error||!data)failure(error);return quote(data,companyId);},
  async remove(id,revision){identity(id,revision);const {error}=await supabase.rpc('remove_quote',{p_company_id:companyId,p_quote_id:id,p_revision:revision});if(error)failure(error);},
 };
}
