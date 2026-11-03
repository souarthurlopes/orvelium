'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Building2, Menu, X, UserRound, ArrowUpRight } from 'lucide-react';
import { Logo } from '@/components/ui';
import { SelectCompanyForm, SignOutButton } from '@/components/account/forms';
import { workspaceModules,moduleHref } from './modules';
import type { CompanyRole } from '@/lib/supabase/database.types';
type Props={children:React.ReactNode;moduleId:string;company:{id:string;name:string};companies:{id:string;name:string}[];fullName:string;role:CompanyRole};
const roleNames={owner:'Proprietário',admin:'Administrador',member:'Membro',viewer:'Leitor'};
export function WorkspaceShell({children,moduleId,company,companies,fullName,role}:Props){
 const [mobile,setMobile]=useState(false);
 const menuButton=useRef<HTMLButtonElement>(null);
 const closeButton=useRef<HTMLButtonElement>(null);
 const active=workspaceModules.find(module=>module.id===moduleId)??workspaceModules[0];
 const initials=fullName.trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>Array.from(part)[0]).join('').toLocaleUpperCase('pt-BR')||'•';
 useEffect(()=>{setMobile(false);},[moduleId,company.id]);
 useEffect(()=>{
  if(!mobile)return;
  closeButton.current?.focus();
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){setMobile(false);menuButton.current?.focus();}};
  window.addEventListener('keydown',close);
  return()=>window.removeEventListener('keydown',close);
 },[mobile]);
 return <div className="app authenticated-workspace">
  <a className="skip-link" href="#main">Pular para o conteúdo</a>
  {mobile&&<button className="scrim" aria-label="Fechar navegação" onClick={()=>{setMobile(false);menuButton.current?.focus();}}/>}
  <aside id="workspace-navigation" className={`sidebar ${mobile?'open':''}`}>
   <div className="sidebar-logo"><Link href="/painel" aria-label="Orvelium One — painel"><Logo/></Link><button ref={closeButton} className="icon-button mobile-close" aria-label="Fechar menu" onClick={()=>{setMobile(false);menuButton.current?.focus();}}><X size={20}/></button></div>
   <div className="workspace-company"><span className="eyebrow">SUA EMPRESA</span><strong><Building2 size={17} aria-hidden="true"/>{company.name}</strong><details key={company.id}><summary>Trocar empresa</summary><SelectCompanyForm companies={companies} active={company.id}/></details></div>
   <span className="nav-label">PRINCIPAL</span>
   <nav aria-label="Navegação principal">{workspaceModules.map(({id,name,icon:Icon})=><Link key={id} href={moduleHref(id)} className={`nav-item ${id===active.id?'active':''}`} aria-current={id===active.id?'page':undefined} onClick={()=>setMobile(false)}><Icon size={18}/><span>{name}</span>{id===active.id&&<span className="nav-dot"/>}</Link>)}</nav>
   <div className="sidebar-bottom"><Link className="nav-item" href="/conta/empresas"><Building2 size={18}/>Gerenciar empresas</Link><Link className="nav-item" href="/conta"><UserRound size={18}/>Minha conta</Link><div className="workspace-signout"><SignOutButton/></div><Link className="profile" href="/conta"><span className="avatar">{initials}</span><span><strong>{fullName||'Minha conta'}</strong><small>{roleNames[role]}</small></span></Link></div>
  </aside>
  <div className="workspace"><header className="topbar"><div className="breadcrumb"><button ref={menuButton} className="icon-button mobile-toggle" aria-label="Abrir menu" aria-expanded={mobile} aria-controls="workspace-navigation" onClick={()=>setMobile(true)}><Menu size={22}/></button><span>{company.name}</span><span className="slash">/</span><strong>{active.name}</strong></div><div className="top-actions"><span className="workspace-status"><i/>Ambiente autenticado</span><Link href="/conta" aria-label="Minha conta" className="avatar small">{initials}</Link></div></header>
   <main id="main" className="main" tabIndex={-1}>{children}<footer className="footer"><span><strong>ORVELIUM ONE</strong> · Clareza para evoluir.</span><Link href="/demo">Abrir demonstração separada <ArrowUpRight size={12} aria-hidden="true"/></Link></footer></main>
  </div>
 </div>;
}
