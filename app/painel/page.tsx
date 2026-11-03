import Link from 'next/link';
import { AccountShell } from '@/components/account/shell';
import { SelectCompanyForm } from '@/components/account/forms';
import { requireCompany } from '@/lib/supabase/auth';
export const dynamic='force-dynamic';
export default async function Dashboard(){
  const context=await requireCompany();
  return <AccountShell signedIn>
    <div className="page-heading"><div><span className="eyebrow">SEU AMBIENTE DE GESTÃO</span><h1>{context.active.name}<span>.</span></h1><p>Olá, {context.profile?.full_name||'bem-vindo'}. Esta é sua empresa ativa.</p></div></div>
    <section className="panel account-card"><h2>Empresa ativa</h2><p>{context.active.legal_name||context.active.name}</p><code>{context.active.id}</code><p>Papel: {({owner:'Proprietário',admin:'Administrador',member:'Membro',viewer:'Leitor'})[context.role]}</p><SelectCompanyForm companies={context.companies} active={context.active.id}/></section>
    <div className="account-grid">
      <section className="panel account-card"><h2>Indicadores financeiros</h2><p>Ainda não há indicadores financeiros disponíveis neste ambiente. Receitas, despesas e resultado serão exibidos quando o módulo estiver conectado ao banco.</p></section>
      <section className="panel account-card"><h2>Clientes</h2><p>O cadastro de clientes ainda não está conectado a esta empresa no banco. Nenhuma contagem está disponível.</p></section>
      <section className="panel account-card"><h2>Orçamentos e serviços</h2><p>Os registros destes módulos ainda não estão disponíveis no ambiente autenticado.</p></section>
      <section className="panel account-card"><h2>Movimentações</h2><p>Nenhuma movimentação disponível para exibir. Os módulos operacionais ainda não estão conectados a esta empresa.</p></section>
    </div>
    <Link className="button" href="/conta/empresas">Gerenciar empresas e acessos</Link>
  </AccountShell>;
}
