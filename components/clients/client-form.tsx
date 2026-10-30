'use client';
import { useState, type FormEvent } from 'react';
import { type ClientInput, emptyClient, states, validateClient } from '@/lib/clients/types';
export function ClientForm({ initial, onSave, onCancel, busy, error }: {
  initial?: ClientInput; onSave: (input: ClientInput) => void; onCancel: () => void; busy: boolean; error: string;
}) {
  const [data, setData] = useState<ClientInput>(initial ?? { ...emptyClient });
  const [validation, setValidation] = useState('');
  function change<K extends keyof ClientInput>(key: K, value: ClientInput[K]) { setData(current => ({ ...current, [key]: value })); setValidation(''); }
  function submit(event: FormEvent) {
    event.preventDefault();
    const problem = validateClient(data);
    if (problem) { setValidation(problem); return; }
    onSave(data);
  }
  return <form className="client-form" onSubmit={submit} autoComplete="off">
    <p className="client-form-intro">Use somente dados fictícios. Nome e CPF/CNPJ são obrigatórios. Os demais campos são opcionais.</p>
    <fieldset disabled={busy}><div className="form-grid">
      <label>Tipo de cliente<select aria-label="Tipo de cliente" value={data.type} onChange={e => change('type', e.target.value as ClientInput['type'])}><option value="individual">Pessoa física</option><option value="company">Pessoa jurídica</option></select></label>
      <label>Situação<select aria-label="Situação" value={data.status} onChange={e => change('status', e.target.value as ClientInput['status'])}><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label>
      <label>{data.type === 'individual' ? 'Nome completo' : 'Nome / razão social'} *<input name="name" value={data.name} onChange={e => change('name', e.target.value)} required maxLength={120} placeholder={data.type === 'individual' ? 'Ex.: Pessoa Exemplo' : 'Ex.: Empresa Exemplo Ltda.'}/></label>
      <label>{data.type === 'individual' ? 'CPF' : 'CNPJ'} fictício *<input name="document" value={data.document} onChange={e => change('document', e.target.value)} inputMode="numeric" required maxLength={18} placeholder={data.type === 'individual' ? '000.000.000-00' : '00.000.000/0000-00'} aria-describedby="client-document-hint"/></label>
      <p id="client-document-hint" className="client-field-hint">Somente o formato é validado, sem verificação de dígitos ou consulta cadastral. Use zeros como exemplo.</p>
      <label>Telefone<input name="phone" type="tel" value={data.phone} onChange={e => change('phone', e.target.value)} maxLength={20} placeholder="(00) 00000-0000"/></label>
      <label>E-mail<input name="email" type="email" value={data.email} onChange={e => change('email', e.target.value)} maxLength={160} placeholder="cliente@example.com"/></label>
      <label className="client-field-wide">Endereço<input name="address" value={data.address} onChange={e => change('address', e.target.value)} maxLength={200} placeholder="Rua Exemplo, 100 — Bairro fictício"/></label>
      <label>Cidade<input name="city" value={data.city} onChange={e => change('city', e.target.value)} maxLength={80} placeholder="Cidade de exemplo"/></label>
      <label>Estado<select aria-label="Estado" name="state" value={data.state} onChange={e => change('state', e.target.value)}><option value="">Não informado</option>{states.map(state => <option key={state}>{state}</option>)}</select></label>
      <label className="client-field-wide">Observações<textarea name="notes" value={data.notes} onChange={e => change('notes', e.target.value)} maxLength={2000} rows={4} placeholder="Informações adicionais fictícias"/><small>{data.notes.length}/2000 caracteres</small></label>
    </div></fieldset>
    {(validation || error) && <p role="alert" className="client-error">{validation || error}</p>}
    <div className="form-actions"><button type="button" className="button" onClick={onCancel} disabled={busy}>Cancelar</button><button className="button primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar cliente'}</button></div>
  </form>;
}
