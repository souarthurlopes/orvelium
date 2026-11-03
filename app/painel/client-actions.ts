'use server';
import { revalidatePath } from 'next/cache';
import { requireCompany } from '@/lib/supabase/auth';
import { createSupabaseClientRepository, ClientRepositoryError } from '@/lib/clients/supabase-repository';
import type { Client, ClientInput, ClientRepository } from '@/lib/clients/types';
import type { ClientActionResult } from '@/lib/clients/action-result';
async function run<T>(companyId:string,operation:(repository:ClientRepository)=>Promise<T>,mutates=false):Promise<ClientActionResult<T>>{
 // Keep redirects outside the operation catch: invalid sessions must leave the workspace.
 const context=await requireCompany();
 if(context.active.id!==companyId)return{error:'A empresa ativa mudou. Reabra Clientes antes de continuar.'};
 try{const data=await operation(createSupabaseClientRepository(context.supabase,context.active.id));if(mutates)revalidatePath('/painel');return{data};}
 catch(error){return{error:error instanceof ClientRepositoryError?error.message:'Não foi possível concluir a operação de Clientes.'};}
}
export async function listClientsAction(companyId:string):Promise<ClientActionResult<Client[]>>{return run(companyId,repository=>repository.list());}
export async function createClientAction(companyId:string,input:ClientInput):Promise<ClientActionResult<Client>>{return run(companyId,repository=>repository.create(input),true);}
export async function updateClientAction(companyId:string,id:string,input:ClientInput):Promise<ClientActionResult<Client>>{return run(companyId,repository=>repository.update(id,input),true);}
export async function removeClientAction(companyId:string,id:string):Promise<ClientActionResult<null>>{return run(companyId,async repository=>{await repository.remove(id);return null;},true);}
