'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Building2, CheckCircle2, Database, Pencil, Plus, Search, Trash2, Users, X } from 'lucide-react';
import { Dialog } from '@/components/dialog';
import { ClientForm } from './client-form';
import { createLocalClientRepository, clientStorageKey } from '@/lib/clients/local-repository';
import { type Client, type ClientInput, type ClientRepository, digits, formatDocument } from '@/lib/clients/types';
type Panel = { kind: 'create' } | { kind: 'edit' | 'details' | 'delete'; client: Client } | null;
function message(error: unknown) { return error instanceof Error ? error.message : 'Não foi possível concluir esta operação. Tente novamente.'; }
function searchable(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR'); }
export function ClientStatus({ status }: { status: Client['status'] }) {
  return <span className={`status ${status === 'active' ? 'done' : 'client-inactive'}`}><i aria-hidden="true"/>{status === 'active' ? 'Ativo' : 'Inativo'}</span>;
}
function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value || 'Não informado'}</dd></div>;
}
export function ClientsModule({ workspace, repository: suppliedRepository, mode='local', canWrite=true, canDelete=true }: { workspace: string; repository?: ClientRepository; mode?:'local'|'remote'; canWrite?:boolean; canDelete?:boolean }) {
  const local=mode==='local';
  const repository = useMemo(() => {if(suppliedRepository)return suppliedRepository;if(!local)throw new Error('O cadastro remoto de Clientes está indisponível.');return createLocalClientRepository(workspace);}, [workspace, suppliedRepository, local]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const locked = useRef(false);
  const loadGeneration = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let current = true;
    async function load() {
      const generation=++loadGeneration.current;
      setLoading(true);
      try { const rows = await repository.list(); if (current&&generation===loadGeneration.current) { setClients(rows); setLoadError(''); } }
      catch (failure) { if (current&&generation===loadGeneration.current) {setClients([]);setPanel(null);setLoadError(message(failure));} }
      finally { if (current&&generation===loadGeneration.current) setLoading(false); }
    }
    void load();
    function sync(event: StorageEvent) {
      if (event.key === clientStorageKey(workspace) || event.key === null) {
        void load();
        setPanel(null);
        setNotice('Os dados locais foram atualizados em outra aba. A lista foi recarregada.');
      }
    }
    function refresh(){if(!locked.current)void load();}
    function visible(){if(document.visibilityState==='visible')refresh();}
    if(local)window.addEventListener('storage', sync);
    else {window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);}
    return () => { current = false; window.removeEventListener('storage', sync);window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible); };
  }, [repository, workspace, retry, local]);
  const filtered = useMemo(() => {
    const term = searchable(query.trim());
    const number = digits(term);
    return clients.filter(client => (type === 'all' || client.type === type) && (status === 'all' || client.status === status) && (!term || searchable(client.name).includes(term) || (!!number && /^[\d\s()./+\-]+$/.test(term) && (client.document.includes(number) || client.phone.includes(number)))));
  }, [clients, query, type, status]);
  function open(next: Panel) {if((next?.kind==='create'||next?.kind==='edit')&&!canWrite)return;if(next?.kind==='delete'&&!canDelete)return;setError(''); setPanel(next); }
  function close() { if (!locked.current) { setPanel(null); setError(''); } }
  async function mutate(action: () => Promise<unknown>, confirmation: string) {
    if (locked.current) return;
    locked.current = true; const generation=++loadGeneration.current; setBusy(true); setError('');
    try {
      await action();
      if (!mounted.current) return;
      setPanel(null); setNotice(confirmation);
      // A committed mutation and a failed refresh are reported separately.
      try { const rows=await repository.list();if(mounted.current&&generation===loadGeneration.current){setClients(rows);setLoadError('');} }
      catch (failure) { if(mounted.current){setClients([]);setLoadError(message(failure));} }
    } catch (failure) { if (mounted.current) setError(message(failure)); }
    finally { locked.current = false; if (mounted.current) {setBusy(false);setLoading(false);} }
  }
  function save(input: ClientInput) {
    if (panel?.kind === 'create') void mutate(() => repository.create(input), local?'Cliente cadastrado no armazenamento local deste navegador.':'Cliente cadastrado na sua empresa.');
    else if (panel?.kind === 'edit') { const id = panel.client.id; void mutate(() => repository.update(id, input), local?'Cliente atualizado no armazenamento local.':'Cliente atualizado na sua empresa.'); }
  }
  function clearFilters() { setQuery(''); setType('all'); setStatus('all'); }
  return <div className="clients-module">
    <div className="page-heading"><div><span className="eyebrow">RELACIONAMENTOS QUE CONSTROEM</span><h1>Clientes<span>.</span></h1><p>Organize seus contatos e tenha cada detalhe por perto.</p></div><div className="service-header-actions">{!local&&<button className="button" disabled={loading} onClick={()=>setRetry(value=>value+1)}>Atualizar lista</button>}{canWrite&&<button className="button primary" disabled={loading || !!loadError} onClick={() => open({ kind: 'create' })}><Plus size={17}/>Novo cliente</button>}</div></div>
    {local?<div className="clients-local-note"><Database size={18} aria-hidden="true"/><p><strong>Ambiente local e demonstrativo.</strong> Use somente dados fictícios. Os cadastros de <strong>{workspace}</strong> ficam neste navegador, sem autenticação, envio ou sincronização com servidor. Limpar os dados do navegador apaga os cadastros.</p></div>:<div className="clients-local-note"><Database size={18} aria-hidden="true"/><p>Clientes de <strong>{workspace}</strong>, salvos na sua empresa e disponíveis nos seus dispositivos. Os dados da demonstração ficam separados.{!canWrite&&' Seu acesso permite apenas consulta.'}</p></div>}
    {notice && <div className="notice" role="status"><span className="client-confirmation"><CheckCircle2 size={17} aria-hidden="true"/>{notice}</span><button className="icon-button" aria-label="Dispensar confirmação" onClick={() => setNotice('')}><X size={17}/></button></div>}
    <section className="panel clients-list" aria-label="Lista de clientes" aria-busy={loading}>
      <div className="clients-list-heading"><div><h2>Seus clientes <span className="client-count">{loadError ? '—' : clients.length}</span></h2><p>Pessoas e empresas, em um só lugar.</p></div><span className="subtle-tag">{local?'ARMAZENAMENTO LOCAL':'CADASTRO DA EMPRESA'}</span></div>
      <div className="clients-filters"><label className="client-search"><span className="sr-only">Pesquisar clientes</span><Search size={17} aria-hidden="true"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, CPF/CNPJ ou telefone" type="search"/></label><label>Tipo<select aria-label="Tipo" value={type} onChange={e => setType(e.target.value)}><option value="all">Todos os tipos</option><option value="individual">Pessoa física</option><option value="company">Pessoa jurídica</option></select></label><label>Situação<select aria-label="Situação" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Todas as situações</option><option value="active">Ativo</option><option value="inactive">Inativo</option></select></label></div>
      {loading ? <p className="clients-empty" role="status">{local?'Carregando clientes locais…':'Carregando clientes…'}</p> : loadError ? <div className="clients-empty"><p className="client-error" role="alert">{loadError}</p><button className="button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button></div> : clients.length === 0 ? <div className="clients-empty"><span className="empty-icon"><Users size={28}/></span><h2>Seu primeiro relacionamento começa aqui.</h2><p>{local?'Nenhum cliente cadastrado nesta empresa. Adicione uma pessoa ou empresa fictícia para testar.':'Nenhum cliente cadastrado nesta empresa.'}</p>{canWrite&&<button className="button primary" onClick={() => open({ kind: 'create' })}><Plus size={16}/>Cadastrar primeiro cliente</button>}</div> : filtered.length === 0 ? <div className="clients-empty"><Search size={25} aria-hidden="true"/><h2>Nenhum cliente encontrado</h2><p>Revise sua pesquisa ou remova os filtros para ver os cadastros.</p><button className="button" onClick={clearFilters}>Limpar pesquisa e filtros</button></div> : <div className="table-scroll" role="region" aria-label="Tabela de clientes, deslize para ver todas as colunas" tabIndex={0}><table className="clients-table"><caption className="sr-only">{local?'Clientes fictícios armazenados neste navegador':'Clientes da empresa ativa'}</caption><thead><tr>{['Cliente','CPF / CNPJ','Contato','Cidade / UF','Situação','Ações'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.map(client => <tr key={client.id}>
        <td><button className="client-name-button" onClick={() => open({ kind: 'details', client })}><span className="client-avatar">{client.type === 'company' ? <Building2 size={18}/> : <Users size={18}/>}</span><span><strong>{client.name}</strong><small>{client.type === 'individual' ? 'Pessoa física' : 'Pessoa jurídica'}</small></span></button></td>
        <td>{formatDocument(client.document, client.type)}</td><td><span className="client-contact">{client.phone || 'Sem telefone'}<small>{client.email || 'Sem e-mail'}</small></span></td><td>{[client.city, client.state].filter(Boolean).join(' / ') || 'Não informado'}</td><td><ClientStatus status={client.status}/></td>
        <td><div className="client-row-actions"><button className="icon-button" aria-label={`Ver detalhes de ${client.name}`} onClick={() => open({ kind: 'details', client })}><ArrowUpRight size={17}/></button>{canWrite&&<button className="icon-button" aria-label={`Editar ${client.name}`} onClick={() => open({ kind: 'edit', client })}><Pencil size={16}/></button>}{canDelete&&<button className="icon-button" aria-label={`Excluir ${client.name}`} onClick={() => open({ kind: 'delete', client })}><Trash2 size={16}/></button>}</div></td>
      </tr>)}</tbody></table></div>}
      {!loading && !loadError && <div className="clients-list-footer" role="status">{filtered.length} de {clients.length} {clients.length === 1 ? 'cliente' : 'clientes'} · {local?'Dados fictícios locais':'Dados da empresa'}</div>}
    </section>
    {panel && <Dialog key={panel.kind} title={panel.kind === 'create' ? 'Novo cliente' : panel.kind === 'edit' ? 'Editar cliente' : panel.kind === 'delete' ? 'Excluir cliente?' : 'Detalhes do cliente'} onClose={close} busy={busy} alert={panel.kind === 'delete'}>
      {(panel.kind === 'create' || panel.kind === 'edit') && <ClientForm demonstration={local} initial={panel.kind === 'edit' ? panel.client : undefined} onSave={save} onCancel={close} busy={busy} error={error}/>}
      {panel.kind === 'details' && <div className="client-details"><div className="client-detail-title"><div><span className="eyebrow">{local?'CADASTRO LOCAL · DEMONSTRAÇÃO':'CADASTRO DA EMPRESA'}</span><h3>{panel.client.name}</h3></div><ClientStatus status={panel.client.status}/></div><dl><Detail label="Tipo" value={panel.client.type === 'individual' ? 'Pessoa física' : 'Pessoa jurídica'}/><Detail label={(panel.client.type === 'individual' ? 'CPF' : 'CNPJ')+(local?' fictício':'')} value={formatDocument(panel.client.document, panel.client.type)}/><Detail label="Telefone" value={panel.client.phone}/><Detail label="E-mail" value={panel.client.email}/><Detail label="Endereço" value={panel.client.address}/><Detail label="Cidade" value={panel.client.city}/><Detail label="Estado" value={panel.client.state}/><Detail label="Observações" value={panel.client.notes}/></dl><p className="client-date">Cadastrado em {new Date(panel.client.createdAt).toLocaleDateString('pt-BR')} · Atualizado em {new Date(panel.client.updatedAt).toLocaleDateString('pt-BR')}</p><div className="form-actions"><button className="button" onClick={close}>Fechar</button>{canWrite&&<button className="button primary" onClick={() => open({ kind: 'edit', client: panel.client })}><Pencil size={15}/>Editar cliente</button>}</div></div>}
      {panel.kind === 'delete' && <div className="client-delete"><p>Excluir <strong>{panel.client.name}</strong> {local?'do armazenamento local desta empresa?':'do cadastro desta empresa?'}</p><p>Esta ação não pode ser desfeita.</p>{error && <p className="client-error" role="alert">{error}</p>}<div className="form-actions"><button className="button" disabled={busy} onClick={close}>Cancelar</button><button className="button client-danger" disabled={busy} onClick={() => { const id = panel.client.id; void mutate(() => repository.remove(id), local?'Cliente excluído do armazenamento local.':'Cliente excluído da sua empresa.'); }}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button></div></div>}
    </Dialog>}
  </div>;
}
