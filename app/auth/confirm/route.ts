import type { NextRequest } from 'next/server';
import { authRedirect,recoveryRedirect } from '@/lib/supabase/redirect';
import { createClient } from '@/lib/supabase/server';
export async function GET(request:NextRequest){
 const params=request.nextUrl.searchParams;
 const recovery=params.get('flow')==='recovery'||params.get('type')==='recovery';
 const invalid=recovery?'/conta/recuperar?status=link-invalido':'/conta/entrar?status=confirmacao-invalida';
 if(params.has('error')||params.has('error_code'))return authRedirect(request,recovery?'/conta/recuperar?status=link-invalido':params.get('error_code')==='otp_expired'?'/conta/entrar?status=confirmacao-expirada':'/conta/entrar?status=confirmacao-invalida');
 const tokenHash=request.nextUrl.searchParams.get('token_hash');const type=request.nextUrl.searchParams.get('type');
 if(tokenHash&&(type==='email'||type==='signup'||type==='recovery')){
   try{
     const client=await createClient();
     const {error}=await client.auth.verifyOtp({token_hash:tokenHash,type});
     if(error?.code==='otp_expired')return authRedirect(request,recovery?'/conta/recuperar?status=link-invalido':'/conta/entrar?status=confirmacao-expirada');
     if(!error){
       const verified=await client.auth.getUser();
       if(!verified.error&&verified.data.user?.email_confirmed_at)return recovery?recoveryRedirect(request,verified.data.user.id):authRedirect(request,'/conta/empresas');
     }
   }catch{/* Never log codes, token hashes or provider error descriptions. */}
 }
 return authRedirect(request,invalid);
}
