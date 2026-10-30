import type { NextRequest } from 'next/server';
import { authRedirect } from '@/lib/supabase/redirect';
import { createClient } from '@/lib/supabase/server';
export async function GET(request:NextRequest){
 const tokenHash=request.nextUrl.searchParams.get('token_hash');const type=request.nextUrl.searchParams.get('type');
 if(tokenHash&&(type==='email'||type==='signup')){try{const client=await createClient();const {error}=await client.auth.verifyOtp({token_hash:tokenHash,type});if(!error)return authRedirect(request,'/conta/empresas');}catch{/* No tokens in logs or error messages. */}}
 return authRedirect(request,'/conta/entrar?status=confirmacao-invalida');
}
