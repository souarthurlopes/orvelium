'use client';
import { useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Client } from '@/lib/clients/types';
import { type QuoteInput, type QuoteStatus, decimalInput, money, parseDecimal, quoteStatuses, totals, validateQuote } from '@/lib/quotes/types';
interface ItemDraft { id: string; description: string; quantity: string; unit: string; price: string }
export function QuoteForm({ initial, clients, lockedClient, onSave, onCancel, busy, error }: {
  initial: QuoteInput; clients: Client[]; lockedClient?: { id: string; name: string }; onSave: (input: QuoteInput) => void; onCancel: () => void; busy: boolean; error: string;
}) {
  const [data, setData] = useState(initial);
  const [items, setItems] = useState<ItemDraft[]>(initial.items.map(i => ({ id:i.id, description:i.description, quantity:decimalInput(i.quantityMilli,3), unit:i.unit, price:decimalInput(i.unitPriceCents) })));
  const [discount, setDiscount] = useState(decimalInput(initial.discount.value));
  const [validation, setValidation] = useState('');
  function change<K extends keyof QuoteInput>(key: K, value: QuoteInput[K]) { setData(current => ({ ...current, [key]: value })); setValidation(''); }
  function itemChange(id: string, key: keyof ItemDraft, value: string) { setItems(current => current.map(i => i.id === id ? { ...i, [key]:value } : i)); setValidation(''); }
  function value(): QuoteInput { return { ...data, discount: { kind: data.discount.kind, value: parseDecimal(discount) ?? NaN }, items: items.map(i => ({ id:i.id, description:i.description.trim(), quantityMilli:parseDecimal(i.quantity,3) ?? NaN, unit:i.unit.trim(), unitPriceCents:parseDecimal(i.price) ?? NaN })), paymentTerms:data.paymentTerms.trim(), notes:data.notes.trim() }; }
  let amounts: ReturnType<typeof totals> | null = null;
  try { amounts = totals(value()); } catch { /* Invalid drafts remain editable. */ }
  function submit(event: FormEvent) { event.preventDefault(); const input=value(); const problem=validateQuote(input); if(problem){setValidation(problem);return;} onSave(input); }
  return <form className="quote-form" autoComplete="off" onSubmit={submit}>
    <p className="quote-form-intro">Proposta demonstrativa. Use somente dados fictícios. Valores em reais; quantidade com até 3 casas decimais e preços com até 2.</p>
    <fieldset disabled={busy}><div className="form-grid">
      <label className="client-field-wide">Cliente cadastrado *<select aria-label="Cliente cadastrado" value={data.clientId} disabled={!!lockedClient} required onChange={e=>change('clientId',e.target.value)}><option value="">Selecione um cliente</option>{lockedClient ? <option value={lockedClient.id}>{lockedClient.name} · histórico preservado</option> : clients.map(c=><option value={c.id} key={c.id}>{c.name}{c.status==='inactive'?' · Inativo':''}</option>)}</select></label>
      {lockedClient && <p className="quote-hint client-field-wide">Cliente e dados históricos preservados após a emissão. Para selecionar outro cliente, duplique a proposta.</p>}
      <label>Data do orçamento *<input type="date" required value={data.date} onChange={e=>change('date',e.target.value)}/></label>
      <label>Validade *<input type="date" required min={data.date} value={data.validUntil} onChange={e=>change('validUntil',e.target.value)}/></label>
      <label className="client-field-wide">Status<select aria-label="Status do orçamento" value={data.status} onChange={e=>change('status',e.target.value as QuoteStatus)}>{Object.entries(quoteStatuses).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><small>Registro manual. Não envia a proposta nem registra aprovação externa. Enviados com validade ultrapassada aparecem como Vencido.</small></label>
    </div>
    <div className="quote-items-heading"><h3>Itens da proposta</h3><span>{items.length}/100 itens</span></div>
    <div className="quote-items">{items.map((item,index)=>{
      let subtotal='—';try{subtotal=money(totals({items:value().items.filter(i=>i.id===item.id),discount:{kind:'fixed',value:0}}).subtotal);}catch{}
      return <section className="quote-item" aria-label={`Item ${index+1}`} key={item.id}><div className="quote-item-heading"><strong>Item {String(index+1).padStart(2,'0')}</strong><button type="button" className="icon-button" aria-label={`Remover item ${index+1}`} disabled={items.length===1} onClick={()=>{if(window.confirm('Remover este item da proposta?'))setItems(current=>current.filter(i=>i.id!==item.id));}}><Trash2 size={16}/></button></div><label>Descrição *<input required maxLength={300} value={item.description} onChange={e=>itemChange(item.id,'description',e.target.value)} placeholder="Produto ou serviço fictício"/></label><div className="quote-item-values"><label>Quantidade *<input inputMode="decimal" required value={item.quantity} onChange={e=>itemChange(item.id,'quantity',e.target.value)} maxLength={14}/></label><label>Unidade *<input required maxLength={20} value={item.unit} onChange={e=>itemChange(item.id,'unit',e.target.value)} placeholder="un, h, m²"/></label><label>Preço unitário (R$) *<input required inputMode="decimal" maxLength={16} value={item.price} onChange={e=>itemChange(item.id,'price',e.target.value)}/></label></div><div className="quote-item-subtotal">Subtotal do item <strong>{subtotal}</strong></div></section>;
    })}</div>
    <button type="button" className="button" disabled={items.length>=100} onClick={()=>setItems(current=>[...current,{id:crypto.randomUUID(),description:'',quantity:'1',unit:'un',price:'0,00'}])}><Plus size={16}/>Adicionar item</button>
    <div className="quote-discount form-grid"><label>Tipo de desconto<select aria-label="Tipo de desconto" value={data.discount.kind} onChange={e=>{change('discount',{kind:e.target.value as 'fixed'|'percent',value:0});setDiscount('0');}}><option value="fixed">Valor em reais (R$)</option><option value="percent">Percentual (%)</option></select></label><label>Desconto {data.discount.kind==='fixed'?'(R$)':'(%)'}<input inputMode="decimal" required maxLength={16} value={discount} onChange={e=>{setDiscount(e.target.value);setValidation('');}}/></label></div>
    <div className="quote-totals" aria-live="polite"><div><span>Subtotal</span><strong>{amounts?money(amounts.subtotal):'—'}</strong></div><div><span>Desconto</span><strong>{amounts?money(amounts.discount):'—'}</strong></div><div className="quote-grand-total"><span>Total da proposta</span><strong>{amounts?money(amounts.total):'Revise os valores'}</strong></div></div>
    <div className="form-grid"><label className="client-field-wide">Condições de pagamento<textarea rows={3} maxLength={2000} value={data.paymentTerms} onChange={e=>change('paymentTerms',e.target.value)} placeholder="Ex.: 50% na contratação e 50% na entrega. Sem cobrança real."/></label><label className="client-field-wide">Observações<textarea rows={4} maxLength={4000} value={data.notes} onChange={e=>change('notes',e.target.value)} placeholder="Informações complementares da proposta fictícia"/></label></div></fieldset>
    {(validation||error)&&<p role="alert" className="client-error">{validation||error}</p>}
    <div className="form-actions"><button type="button" className="button" disabled={busy} onClick={onCancel}>Cancelar</button><button className="button primary" disabled={busy}>{busy?'Salvando…':'Salvar orçamento'}</button></div>
  </form>;
}
