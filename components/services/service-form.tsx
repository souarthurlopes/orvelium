'use client';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Client } from '@/lib/clients/types';
import { type ClientSnapshot, decimalInput, lineSubtotal, money, parseDecimal } from '@/lib/quotes/types';
import { normalizeService, validateService } from '@/lib/services/rules';
import { servicePriorities, type ServiceInput, type ServicePriority } from '@/lib/services/types';
interface ItemDraft { id:string; description:string; quantity:string; unit:string; price:string }
export function ServiceForm({initial,clients,currentClient,lockedClient=false,editing=false,busy,error,onSave,onCancel}:{initial:ServiceInput;clients:Client[];currentClient?:ClientSnapshot;lockedClient?:boolean;editing?:boolean;busy:boolean;error:string;onSave:(input:ServiceInput)=>void;onCancel:()=>void}){
  const [data,setData]=useState(initial);
  const [value,setValue]=useState(decimalInput(initial.expectedValueCents));
  const [items,setItems]=useState<ItemDraft[]>(initial.items.map(item=>({id:item.id,description:item.description,quantity:decimalInput(item.quantityMilli,3),unit:item.unit,price:decimalInput(item.unitPriceCents)})));
  const [validation,setValidation]=useState('');
  function change<K extends keyof ServiceInput>(key:K,value:ServiceInput[K]){setData(current=>({...current,[key]:value}));setValidation('');}
  function itemChange(id:string,key:keyof ItemDraft,value:string){setItems(current=>current.map(item=>item.id===id?{...item,[key]:value}:item));setValidation('');}
  function input():ServiceInput{return {...data,expectedValueCents:parseDecimal(value)??NaN,items:items.map(item=>({id:item.id,description:item.description,quantityMilli:parseDecimal(item.quantity,3)??NaN,unit:item.unit,unitPriceCents:parseDecimal(item.price)??NaN}))};}
  let subtotal:number|null=0;
  try{for(const item of input().items)subtotal+=lineSubtotal(item);}catch{subtotal=null;}
  function submit(event:FormEvent){event.preventDefault();const current=input();const issue=validateService(current);if(issue){setValidation(issue);return;}onSave(normalizeService(current));}
  return <form className="service-form" autoComplete="off" onSubmit={submit}>
    <p className="service-hint">Use somente dados fictícios. Os campos com * são obrigatórios. O valor previsto é independente do subtotal dos itens, permitindo prever descontos ou outros custos.</p>
    <fieldset disabled={busy}><div className="form-grid">
      <label className="client-field-wide">Cliente *<select aria-label="Cliente da OS" required disabled={lockedClient} value={data.clientId} onChange={e=>change('clientId',e.target.value)}><option value="">Selecione um cliente</option>{currentClient&&<option value={currentClient.id}>{currentClient.name} · Histórico preservado</option>}{!lockedClient&&clients.filter(client=>client.id!==currentClient?.id).map(client=><option key={client.id} value={client.id}>{client.name}{client.status==='inactive'?' · Inativo':''}</option>)}</select></label>
      {currentClient&&<p className="service-hint client-field-wide">{lockedClient?'Cliente fixado pelo orçamento de origem.':'Os dados do cliente atual são históricos; selecionar outro cliente registra a mudança no histórico.'}</p>}
      <label className="client-field-wide">Título do serviço *<input required maxLength={160} value={data.title} onChange={e=>change('title',e.target.value)} placeholder="Ex.: Execução do serviço contratado"/></label>
      <label className="client-field-wide">Descrição e escopo *<textarea required rows={4} maxLength={4000} value={data.description} onChange={e=>change('description',e.target.value)} placeholder="Descreva o que será executado, sem limitar o segmento."/></label>
      <label>Tipo de serviço *<input required maxLength={80} value={data.serviceType} onChange={e=>change('serviceType',e.target.value)} placeholder="Ex.: Instalação, consultoria, manutenção"/></label>
      <label>Responsável *<input required maxLength={120} value={data.assignee} onChange={e=>change('assignee',e.target.value)} placeholder="Ex.: Equipe Exemplo"/><small>Texto livre nesta versão, sem vínculo com Funcionários.</small></label>
      <label>Data de abertura *<input type="date" required disabled={editing} value={data.openedDate} onChange={e=>change('openedDate',e.target.value)}/></label>
      <label>Prioridade<select aria-label="Prioridade da OS" value={data.priority} onChange={e=>change('priority',e.target.value as ServicePriority)}>{Object.entries(servicePriorities).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      <label>Início previsto *<input type="date" required min={data.openedDate} value={data.plannedStart} onChange={e=>change('plannedStart',e.target.value)}/></label>
      <label>Conclusão prevista *<input type="date" required min={data.plannedStart} value={data.plannedEnd} onChange={e=>change('plannedEnd',e.target.value)}/></label>
      <label className="client-field-wide">Valor previsto (R$) *<input inputMode="decimal" required maxLength={16} value={value} onChange={e=>{setValue(e.target.value);setValidation('');}}/><small>Use vírgula ou ponto decimal, sem separador de milhar. Valor armazenado em centavos.</small></label>
    </div>
    <div className="quote-items-heading"><h3>Materiais e itens previstos</h3><span>{items.length}/100</span></div>
    <p className="service-hint">Opcional. Não movimenta estoque nem gera cobranças. Quantidades com até 3 casas decimais e preços com até 2.</p>
    <div className="quote-items">{items.map((item,index)=>{let amount='—';try{amount=money(lineSubtotal(input().items[index]));}catch{}return <section className="quote-item" aria-label={`Item previsto ${index+1}`} key={item.id}><div className="quote-item-heading"><strong>Item {String(index+1).padStart(2,'0')}</strong><button type="button" className="icon-button" aria-label={`Remover item previsto ${index+1}`} onClick={()=>{if(window.confirm('Remover este item previsto da OS?'))setItems(current=>current.filter(i=>i.id!==item.id));}}><Trash2 size={16}/></button></div><label>Descrição do item *<input required maxLength={300} value={item.description} onChange={e=>itemChange(item.id,'description',e.target.value)}/></label><div className="quote-item-values"><label>Quantidade *<input inputMode="decimal" required maxLength={14} value={item.quantity} onChange={e=>itemChange(item.id,'quantity',e.target.value)}/></label><label>Unidade *<input required maxLength={20} value={item.unit} onChange={e=>itemChange(item.id,'unit',e.target.value)}/></label><label>Preço unitário (R$) *<input inputMode="decimal" required maxLength={16} value={item.price} onChange={e=>itemChange(item.id,'price',e.target.value)}/></label></div><div className="quote-item-subtotal"><span>Subtotal do item</span><strong>{amount}</strong></div></section>;})}</div>
    <button type="button" className="button" disabled={items.length>=100} onClick={()=>setItems(current=>[...current,{id:crypto.randomUUID(),description:'',quantity:'1',unit:'un',price:'0,00'}])}><Plus size={16}/>Adicionar item previsto</button>
    <div className="quote-totals"><div><span>Subtotal dos itens · referência</span><strong>{subtotal===null?'Revise os itens':money(subtotal)}</strong></div><div className="quote-grand-total"><span>Valor previsto da OS</span><strong>{parseDecimal(value)===null?'Revise o valor':money(parseDecimal(value)!)}</strong></div></div>
    <label>Observações internas<textarea rows={4} maxLength={4000} value={data.internalNotes} onChange={e=>change('internalNotes',e.target.value)}/><small>Incluídas no PDF da OS. Revise antes de compartilhar o arquivo.</small></label></fieldset>
    {(validation||error)&&<p role="alert" className="client-error">{validation||error}</p>}
    <div className="form-actions"><button type="button" className="button" disabled={busy} onClick={onCancel}>Cancelar</button><button className="button primary" disabled={busy}>{busy?'Salvando…':'Salvar OS'}</button></div>
  </form>;
}
