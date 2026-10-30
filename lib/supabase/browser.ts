'use client';
import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig, supabaseCookieOptions } from './config';
import type { Database } from './database.types';
export function createClient(){
  const config=getSupabaseConfig();
  if(!config)throw new Error('A conexão de conta ainda não está configurada.');
  return createBrowserClient<Database>(config.url,config.publishableKey,{cookieOptions:supabaseCookieOptions(config)});
}
