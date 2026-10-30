import type { NextRequest } from 'next/server';
import { authRedirect } from '@/lib/supabase/redirect';
import { createClient } from '@/lib/supabase/server';
export async function GET(request:NextRequest){
 const code=request.nextUrl.searchParams.get('code');
 if(code){try{const client=await createClient();const {error}=await client.auth.exchangeCodeForSession(code);if(!error)return authRedirect(request,'/conta/empresas');}catch{/* Never log auth codes/tokens. */}}
 return authRedirect(request,'/conta/entrar?status=confirmacao-invalida');
}
