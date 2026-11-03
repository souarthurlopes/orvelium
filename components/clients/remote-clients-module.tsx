'use client';
import { useMemo } from 'react';
import { ClientsModule } from './clients-module';
import { listClientsAction,createClientAction,updateClientAction,removeClientAction } from '@/app/painel/client-actions';
import type { ClientRepository } from '@/lib/clients/types';
import type { ClientActionResult } from '@/lib/clients/action-result';
import type { CompanyRole } from '@/lib/supabase/database.types';
async function result<T>(pending:Promise<ClientActionResult<T>>):Promise<T>{const value=await pending;if(value.error!==undefined)throw new Error(value.error);return value.data;}
export function RemoteClientsModule({companyId,companyName,role}:{companyId:string;companyName:string;role:CompanyRole}){
 const repository=useMemo<ClientRepository>(()=>({
  list:()=>result(listClientsAction(companyId)),
  create:input=>result(createClientAction(companyId,input)),
  update:(id,input)=>result(updateClientAction(companyId,id,input)),
  remove:async id=>{await result(removeClientAction(companyId,id));},
 }),[companyId]);
 return <ClientsModule key={companyId} workspace={companyName} repository={repository} mode="remote" canWrite={role!=='viewer'} canDelete={role==='owner'||role==='admin'}/>;
}
