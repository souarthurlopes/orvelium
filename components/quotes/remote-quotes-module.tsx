'use client';
import { useMemo } from 'react';
import { QuotesModule } from './quotes-module';
import { listQuotesAction,createQuoteAction,updateQuoteAction,removeQuoteAction } from '@/app/painel/quote-actions';
import { listClientsAction } from '@/app/painel/client-actions';
import type { ClientRepository } from '@/lib/clients/types';
import type { QuoteRepository } from '@/lib/quotes/types';
import type { ClientActionResult } from '@/lib/clients/action-result';
import type { CompanyRole } from '@/lib/supabase/database.types';
async function result<T>(pending:Promise<ClientActionResult<T>>):Promise<T>{const value=await pending;if(value.error!==undefined)throw new Error(value.error);return value.data;}
export function RemoteQuotesModule({companyId,companyName,role}:{companyId:string;companyName:string;role:CompanyRole}){
 const repository=useMemo<QuoteRepository>(()=>({list:()=>result(listQuotesAction(companyId)),create:input=>result(createQuoteAction(companyId,input)),update:(id,input,revision)=>result(updateQuoteAction(companyId,id,input,revision)),remove:async(id,revision)=>{await result(removeQuoteAction(companyId,id,revision));}}),[companyId]);
 const clients=useMemo<ClientRepository>(()=>({list:()=>result(listClientsAction(companyId)),create:async()=>{throw new Error('Use o módulo Clientes para cadastrar.');},update:async()=>{throw new Error('Use o módulo Clientes para editar.');},remove:async()=>{throw new Error('Use o módulo Clientes para excluir.');}}),[companyId]);
 return <QuotesModule key={companyId} workspace={companyName} repository={repository} clientRepository={clients} mode="remote" canWrite={role!=='viewer'} canDelete={role==='owner'||role==='admin'}/>;
}
