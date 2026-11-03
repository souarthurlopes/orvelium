import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, ClientRow, ClientWrite } from '@/lib/supabase/database.types';
import { type Client, type ClientInput, type ClientRepository, normalizeClient, validateClient } from './types';
export class ClientRepositoryError extends Error {}
const columns='id,company_id,type,status,name,document,phone,email,address,city,state,notes,created_at,updated_at' as const;
const inputFields=['type','status','name','document','phone','email','address','city','state','notes'] as const;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function checked(input:ClientInput):ClientWrite{
 if(!input||inputFields.some(field=>typeof input[field]!=='string'))throw new ClientRepositoryError('Revise os campos do cliente.');
 const problem=validateClient(input);if(problem)throw new ClientRepositoryError(problem);
 const normalized=normalizeClient(input);
 // Explicit allowlist: never spread caller-supplied identity/company/author fields.
 return Object.fromEntries(inputFields.map(field=>[field,normalized[field]])) as ClientWrite;
}
function failure(error:{code?:string}|null):never{
 if(error?.code==='23505')throw new ClientRepositoryError('Já existe um cliente com esse CPF/CNPJ nesta empresa.');
 if(error?.code==='42501')throw new ClientRepositoryError('Você não tem permissão para esta operação. Verifique seu acesso à empresa.');
 if(error?.code==='42P01'||error?.code==='PGRST205')throw new ClientRepositoryError('O cadastro de Clientes ainda não está disponível neste ambiente. Solicite sua atualização.');
 if(error?.code==='PGRST116')throw new ClientRepositoryError('Cliente não encontrado ou acesso indisponível. Atualize a lista.');
 throw new ClientRepositoryError('Não foi possível concluir a operação de Clientes. Verifique sua conexão e tente novamente.');
}
function client(row:Omit<ClientRow,'created_by'>,companyId:string):Client{
 if(row.company_id!==companyId)throw new ClientRepositoryError('Não foi possível validar a empresa deste cliente.');
 return {id:row.id,type:row.type,status:row.status,name:row.name,document:row.document,phone:row.phone,email:row.email,address:row.address,city:row.city,state:row.state,notes:row.notes,createdAt:row.created_at,updatedAt:row.updated_at};
}
/** Server-side adapter: use only the verified user's SDK client, never service_role. */
export function createSupabaseClientRepository(supabase:SupabaseClient<Database>,companyId:string):ClientRepository{
 if(!uuid.test(companyId))throw new ClientRepositoryError('Selecione uma empresa válida.');
 function id(value:string){if(!uuid.test(value))throw new ClientRepositoryError('Cliente inválido. Atualize a lista.');return value;}
 return {
  async list(){
   const rows:Client[]=[];const seen=new Set<string>();let offset=0;
   // Supabase/PostgREST caps individual responses. Fetch all pages explicitly.
   for(;;){
    const {data,error,count}=await supabase.from('clients').select(columns,{count:'exact'}).eq('company_id',companyId).order('name').order('id').range(offset,offset+499);
    if(error||!data)failure(error);
    for(const row of data){if(seen.has(row.id))throw new ClientRepositoryError('A lista de clientes mudou durante a leitura. Atualize e tente novamente.');seen.add(row.id);rows.push(client(row,companyId));}offset+=data.length;
    if(count!==null&&offset>=count)break;
    if(count===null&&data.length<500)break;
    if(!data.length)throw new ClientRepositoryError('A lista de clientes mudou durante a leitura. Atualize e tente novamente.');
   }
   return rows;
  },
  async create(input){const values=checked(input);const {data,error}=await supabase.from('clients').insert({...values,company_id:companyId}).select(columns).single();if(error||!data)failure(error);return client(data,companyId);},
  async update(clientId,input){const values=checked(input);const {data,error}=await supabase.from('clients').update(values).eq('company_id',companyId).eq('id',id(clientId)).select(columns).single();if(error||!data)failure(error);return client(data,companyId);},
  async remove(clientId){const {data,error}=await supabase.from('clients').delete().eq('company_id',companyId).eq('id',id(clientId)).select('id').single();if(error||!data)failure(error);},
 };
}
export async function countActiveClients(supabase:SupabaseClient<Database>,companyId:string):Promise<number|null>{
 try{const {count,error}=await supabase.from('clients').select('id',{count:'exact',head:true}).eq('company_id',companyId).eq('status','active');return error?null:count;}catch{return null;}
}
