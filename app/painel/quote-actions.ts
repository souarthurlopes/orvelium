'use server';
import { revalidatePath } from 'next/cache';
import { requireCompany } from '@/lib/supabase/auth';
import { createSupabaseQuoteRepository,QuoteRepositoryError } from '@/lib/quotes/supabase-repository';
import type { Quote,QuoteInput,QuoteRepository } from '@/lib/quotes/types';
import type { ClientActionResult } from '@/lib/clients/action-result';
async function run<T>(companyId:string,operation:(repository:QuoteRepository)=>Promise<T>,mutates=false):Promise<ClientActionResult<T>>{
 const context=await requireCompany();
 if(context.active.id!==companyId)return{error:'A empresa ativa mudou. Reabra Orçamentos antes de continuar.'};
 let data:T;
 try{data=await operation(createSupabaseQuoteRepository(context.supabase,context.active.id));}
 catch(error){return{error:error instanceof QuoteRepositoryError?error.message:'Não foi possível concluir a operação de Orçamentos.'};}
 // A cache refresh must never turn a committed database write into a reported failure.
 if(mutates){try{revalidatePath('/painel');}catch{/* The module refreshes its own list after mutations. */}}
 return{data};
}
export async function listQuotesAction(companyId:string):Promise<ClientActionResult<Quote[]>>{return run(companyId,repository=>repository.list());}
export async function createQuoteAction(companyId:string,input:QuoteInput):Promise<ClientActionResult<Quote>>{return run(companyId,repository=>repository.create(input),true);}
export async function updateQuoteAction(companyId:string,id:string,input:QuoteInput,revision:number):Promise<ClientActionResult<Quote>>{return run(companyId,repository=>repository.update(id,input,revision),true);}
export async function removeQuoteAction(companyId:string,id:string,revision:number):Promise<ClientActionResult<null>>{return run(companyId,async repository=>{await repository.remove(id,revision);return null;},true);}
