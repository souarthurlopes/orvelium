'use client';
import { useEffect } from 'react';
/** Supabase may return failures in a URL fragment, which the server cannot read. */
export function AuthLinkError(){
  useEffect(()=>{
    const params=new URLSearchParams(window.location.hash.slice(1));
    if(params.has('error')||params.has('error_code')){
      const status=params.get('error_code')==='otp_expired'?'confirmacao-expirada':'confirmacao-invalida';
      const recovery=window.location.pathname==='/conta/recuperar'||params.get('type')==='recovery';
      window.location.replace(recovery?'/conta/recuperar?status=link-invalido':`/conta/entrar?status=${status}`);
    }
  },[]);
  return null;
}
