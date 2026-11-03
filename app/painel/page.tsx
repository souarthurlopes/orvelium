import Link from 'next/link';
import { RemoteClientsModule } from '@/components/clients/remote-clients-module';
import { countActiveClients } from '@/lib/clients/supabase-repository';
import { Wallet, ArrowUpRight, LayoutDashboard, Users, FileText, Wrench } from 'lucide-react';
import { WorkspaceShell } from '@/components/workspace/shell';
import { workspaceModules,moduleHref } from '@/components/workspace/modules';
import { requireCompany } from '@/lib/supabase/auth';
export const dynamic='force-dynamic';
export default async function Dashboard({searchParams}:{searchParams:Promise<{modulo?:string}>}){
 const context=await requireCompany();
 const params=await searchParams;
 const selected=workspaceModules.find(module=>module.id===params.modulo)??workspaceModules[0];
 const Icon=selected.icon;
 const activeClientCount=selected.id==='visao-geral'?await countActiveClients(context.supabase,context.active.id):null;
 return <WorkspaceShell key={context.active.id} moduleId={selected.id} company={{id:context.active.id,name:context.active.name}} companies={context.companies.map(({id,name})=>({id,name}))} fullName={context.profile?.full_name||''} role={context.role}>
  {selected.id==='visao-geral'?<>
   <div className="page-heading"><div><span className="eyebrow">UMA VISÃO CLARA. NOVAS POSSIBILIDADES.</span><h1>Seu negócio em perspectiva<span>.</span></h1><p>Olá, {context.profile?.full_name||'bem-vindo'}. Este é o espaço de {context.active.name}.</p></div><Link className="button primary" href="/conta/empresas">Gerenciar empresa <ArrowUpRight size={16}/></Link></div>
   <div className="overview-bar"><div><span className="live-dot"/><strong>Visão geral</strong><span className="overview-caption">A clareza que move suas decisões.</span></div></div>
   <div className="metrics">{[{label:'Receita total',icon:Wallet},{label:'Despesas totais',icon:ArrowUpRight},{label:'Resultado líquido',icon:LayoutDashboard},{label:'Clientes ativos',icon:Users}].map(({label,icon:MetricIcon})=><article className="metric" key={label}><div className="metric-top"><span>{label}</span><MetricIcon size={18} aria-hidden="true"/></div><strong aria-label={`${label}: ${label==='Clientes ativos'&&activeClientCount!==null?activeClientCount:'indisponível'}`}>{label==='Clientes ativos'&&activeClientCount!==null?activeClientCount:'—'}</strong><div className="metric-bottom">{label==='Clientes ativos'&&activeClientCount!==null?'Na empresa ativa':'Ainda indisponível'}</div></article>)}</div>
   <div className="charts"><section className="panel"><div className="panel-heading"><div><h2>Fluxo financeiro</h2><p>Receitas e despesas da sua empresa</p></div><Wallet size={18}/></div><div className="workspace-empty"><span className="empty-icon"><Wallet size={28}/></span><h3>Seu panorama financeiro começa aqui.</h3><p>Os indicadores aparecerão quando o módulo financeiro estiver disponível.</p></div></section><section className="panel"><div className="panel-heading"><div><h2>Seu trabalho, em movimento</h2><p>Acompanhe seus serviços</p></div><Wrench size={18}/></div><div className="workspace-empty"><span className="empty-icon"><Wrench size={28}/></span><h3>Serviços ainda indisponíveis.</h3><p>As informações de serviços aparecerão neste espaço.</p></div></section></div>
   <div className="section-heading"><div><h2>Seu espaço de gestão</h2><p>Um lugar para cada parte do seu negócio.</p></div></div><div className="quick-cards">{[{id:'clientes',name:'Clientes',text:'Organize seus relacionamentos.',icon:Users},{id:'orcamentos',name:'Orçamentos',text:'Acompanhe suas propostas.',icon:FileText},{id:'servicos',name:'Serviços',text:'Planeje e acompanhe suas entregas.',icon:Wrench}].map(({id,name,text,icon:ModuleIcon})=><Link className="quick-card" key={id} href={moduleHref(id)}><span className="quick-icon"><ModuleIcon size={20}/></span><span><strong>{name}</strong><small>{text}</small></span><ArrowUpRight size={17}/></Link>)}</div>
   <section className="panel"><div className="panel-heading"><div><h2>Últimas movimentações</h2><p>A atividade da sua empresa, em um só lugar.</p></div></div><div className="workspace-empty"><h3>Nenhuma movimentação disponível para exibir.</h3><p>Este espaço será atualizado quando os módulos de gestão estiverem disponíveis.</p></div></section>
  </>:selected.id==='clientes'?<RemoteClientsModule key={context.active.id} companyId={context.active.id} companyName={context.active.name} role={context.role}/>:<>
   <div className="page-heading"><div><span className="eyebrow">{context.active.name}</span><h1>{selected.name}<span>.</span></h1><p>Uma visão conectada de cada parte do seu negócio.</p></div></div>
   <section className="panel module-empty"><div className="empty-icon"><Icon size={30}/></div><span className="eyebrow">EM BREVE</span><h2>{selected.name} na sua empresa</h2><p>Este módulo ainda não está disponível para {context.active.name}.</p><p className="muted">Seus registros da demonstração ficam em um ambiente separado.</p><Link className="button" href="/painel">Voltar à visão geral</Link></section>
  </>}
 </WorkspaceShell>;
}
