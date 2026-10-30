import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getSupabaseConfig, supabaseCookieOptions } from './config';
import type { Database } from './database.types';
export async function createClient(){
  const config=getSupabaseConfig();
  if(!config)throw new Error('A conexão de conta ainda não está configurada.');
  const store=await cookies();
  return createServerClient<Database>(config.url,config.publishableKey,{cookieOptions:supabaseCookieOptions(config),cookies:{getAll(){return store.getAll();},setAll(values){try{values.forEach(({name,value,options})=>store.set(name,value,options));}catch{/* Server Components cannot write; middleware refreshes the session. */}}}});
}
