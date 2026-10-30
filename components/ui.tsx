import { ArrowUpRight, type LucideIcon } from 'lucide-react';
export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? 'light' : ''}`} aria-label="Orvelium One">
      {/* The diagonal breaks remain transparent in both monochrome variants. */}
      <svg className="brand-symbol" width="34" height="34" viewBox="0 0 100 100" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M80.18 15.28A46 46 0 0 0 15.28 80.18L28.70 64.91A26 26 0 0 1 64.91 28.70Z M19.82 84.72A46 46 0 0 0 84.72 19.82L71.30 35.09A26 26 0 0 1 35.09 71.30Z" />
      </svg>
      <span className="brand-name">ORVELIUM ONE</span>
    </div>
  );
}
export function Metric({label,value,change,detail,icon:Icon}:{label:string;value:string;change:string;detail:string;icon:LucideIcon}) {return <article className="metric"><div className="metric-top"><span>{label}</span><Icon size={18} aria-hidden="true"/></div><strong>{value}</strong><div className="metric-bottom"><span className={label==='Despesas totais'?'trend neutral':'trend'}><ArrowUpRight size={13} aria-hidden="true"/>{change}</span><span>{detail}</span></div></article>}
export function EmptyModule({name,icon:Icon}:{name:string;icon:LucideIcon}) {return <section className="panel module-empty"><div className="empty-icon"><Icon size={30}/></div><span className="eyebrow">MÓDULO PREVISTO</span><h2>{name}</h2><p>Este espaço fará parte da gestão integrada da sua empresa.</p><p className="muted">Nesta primeira versão, explore a visão geral e o cadastro demonstrativo de empresas.</p></section>}
