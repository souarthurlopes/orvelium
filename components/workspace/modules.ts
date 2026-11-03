import { LayoutDashboard, Wallet, Users, Package, FileText, Wrench, Contact, ClipboardList } from 'lucide-react';
export const workspaceModules=[
 {id:'visao-geral',name:'Visão geral',icon:LayoutDashboard},
 {id:'financeiro',name:'Financeiro',icon:Wallet},
 {id:'clientes',name:'Clientes',icon:Users},
 {id:'estoque',name:'Estoque',icon:Package},
 {id:'orcamentos',name:'Orçamentos',icon:FileText},
 {id:'servicos',name:'Serviços',icon:Wrench},
 {id:'funcionarios',name:'Funcionários',icon:Contact},
 {id:'rdo',name:'RDO',icon:ClipboardList},
] as const;
export function moduleHref(id:string){return id==='visao-geral'?'/painel':`/painel?modulo=${id}`;}
