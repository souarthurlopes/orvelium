import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';
/** Only fixed internal destinations; never accept user-controlled `next` URLs. */
export function authRedirect(request:NextRequest,path:'/painel'|'/conta/empresas'|'/conta/nova-senha'|'/conta/recuperar?status=link-invalido'|'/conta/entrar?status=confirmacao-invalida'|'/conta/entrar?status=confirmacao-expirada'){
 let origin=request.nextUrl.origin;
 try{origin=getSupabaseConfig()?.siteUrl??origin;}catch{/* Invalid config cannot establish a session. */}
 return NextResponse.redirect(new URL(path,origin),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}

/** Short-lived marker is supplementary; the reset page/action also verify Auth. */
export function recoveryRedirect(request:NextRequest,userId:string){
 const response=authRedirect(request,'/conta/nova-senha');
 const secure=new URL(response.headers.get('location')!).protocol==='https:';
 response.cookies.set('orvelium-recovery',userId,{httpOnly:true,secure,sameSite:'lax',path:'/',maxAge:900});
 return response;
}
