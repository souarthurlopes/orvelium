import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseConfig } from './config';
/** Only fixed internal destinations; never accept user-controlled `next` URLs. */
export function authRedirect(request:NextRequest,path:'/conta/empresas'|'/conta/entrar?status=confirmacao-invalida'){
 let origin=request.nextUrl.origin;
 try{origin=getSupabaseConfig()?.siteUrl??origin;}catch{/* Invalid config cannot establish a session. */}
 return NextResponse.redirect(new URL(path,origin),{headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}
