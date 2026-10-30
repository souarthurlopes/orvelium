import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig, supabaseCookieOptions } from './config';
import type { Database } from './database.types';
export async function updateSession(request:NextRequest){
  let response=NextResponse.next({request});
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');
  let config;try{config=getSupabaseConfig();}catch{return response;}
  if(!config)return response;
  const client=createServerClient<Database>(config.url,config.publishableKey,{cookieOptions:supabaseCookieOptions(config),cookies:{getAll(){return request.cookies.getAll();},setAll(values){values.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});values.forEach(({name,value,options})=>response.cookies.set(name,value,options));response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');}}});
  // getUser verifies with Auth. Never authorize from getSession() cookie contents.
  try{await client.auth.getUser();}catch{/* Server pages still require a verified user and fail closed. */}
  return response;
}
