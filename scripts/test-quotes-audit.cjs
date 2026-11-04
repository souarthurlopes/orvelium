// Build/test the READ-ONLY hosted audit against an isolated PostgreSQL fixture.
// --generate writes the SQL contract locally. Never connects to Supabase.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const root=path.join(__dirname,'..'),target=path.join(root,'docs/auditoria-orcamentos.sql');
const tables="('public.quotes','private.quote_counters')";
const names="('has_quotes_access','require_quote_access','validate_quote_input','capture_quote_client','create_quote','update_quote','remove_quote')";
const queries={
 'Tabelas, RLS e persistência':`select n.nspname||'.'||c.relname objeto,c.relkind::text tipo,c.relrowsecurity rls,c.relforcerowsecurity rls_forcada,c.relpersistence::text persistencia from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname in ${tables} order by 1`,
 'Colunas, tipos, NOT NULL, defaults e geração':`select n.nspname||'.'||c.relname objeto,a.attname coluna,format_type(a.atttypid,a.atttypmod) tipo,a.attnotnull obrigatoria,pg_get_expr(d.adbin,d.adrelid) padrao,a.attidentity::text identidade,a.attgenerated::text gerada from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where n.nspname||'.'||c.relname in ${tables} and a.attnum>0 and not a.attisdropped order by 1,a.attnum`,
 'Constraints, FKs e ações de exclusão':`select n.nspname||'.'||t.relname objeto,c.conname nome,c.contype::text tipo,c.convalidated validada,c.condeferrable adiavel,c.condeferred inicialmente_adiada,pg_get_constraintdef(c.oid) definicao from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname||'.'||t.relname in ${tables} and c.contype<>'n' order by 1,c.conname`,
 'Índices, ordem de colunas e validade':`select n.nspname||'.'||t.relname objeto,ci.relname nome,i.indisvalid valido,i.indisready pronto,pg_get_indexdef(i.indexrelid) definicao from pg_index i join pg_class t on t.oid=i.indrelid join pg_namespace n on n.oid=t.relnamespace join pg_class ci on ci.oid=i.indexrelid where n.nspname||'.'||t.relname in ${tables} order by 1,ci.relname`,
 'Políticas completas, incluindo extras':`select n.nspname||'.'||t.relname objeto,p.polname nome,p.polcmd::text comando,p.polpermissive permissiva,(select array_agg(coalesce(r.rolname::text,'PUBLIC') order by coalesce(r.rolname::text,'PUBLIC')) from unnest(p.polroles) id left join pg_roles r on r.oid=id) papeis,pg_get_expr(p.polqual,p.polrelid) filtro,pg_get_expr(p.polwithcheck,p.polrelid) validacao from pg_policy p join pg_class t on t.oid=p.polrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname||'.'||t.relname in ${tables} order by 1,p.polname`,
 'Funções: assinatura, corpo integral e segurança':`select n.nspname||'.'||p.proname nome,pg_get_function_identity_arguments(p.oid) argumentos,pg_get_function_result(p.oid) retorno,l.lanname linguagem,p.prokind::text especie,p.provolatile::text volatilidade,p.prosecdef definer,p.proleakproof leakproof,p.proisstrict estrita,p.proparallel::text paralelismo,p.pronargdefaults defaults,p.proconfig config,btrim(replace(p.prosrc,chr(13)||chr(10),chr(10))) corpo from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_language l on l.oid=p.prolang where n.nspname in ('public','private') and p.proname in ${names} order by 1,2`,
 'Triggers de aplicação':`select n.nspname||'.'||t.relname objeto,g.tgname nome,g.tgtype tipo,g.tgenabled::text estado,g.tgnargs argumentos,pg_get_expr(g.tgqual,g.tgrelid) filtro,pn.nspname||'.'||p.proname funcao,encode(g.tgargs,'hex') valores from pg_trigger g join pg_class t on t.oid=g.tgrelid join pg_namespace n on n.oid=t.relnamespace join pg_proc p on p.oid=g.tgfoid join pg_namespace pn on pn.oid=p.pronamespace where n.nspname||'.'||t.relname in ${tables} and not g.tgisinternal order by 1,g.tgname`,
};
const norm=q=>`select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) from (${q}) v`;
const literal=s=>"'"+s.replaceAll("'","''")+"'";
const extra=`
-- Effective privileges also catch inherited/column grants and altered default ACLs.
union all select 'Privilégios efetivos de tabela',not exists(
 select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 cross join (values ('anon'),('authenticated')) r(papel)
 cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilegio)
 where n.nspname||'.'||c.relname in ${tables}
 and has_table_privilege(r.papel,c.oid,v.privilegio) is distinct from (r.papel='authenticated' and n.nspname='public' and v.privilegio='SELECT')),
 'authenticated: somente SELECT em quotes; nenhum acesso ao contador. anon: nenhum acesso.'
union all select 'Privilégios efetivos por coluna',not exists(
 select 1 from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
 cross join (values ('anon'),('authenticated')) r(papel) cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilegio)
 where n.nspname||'.'||c.relname in ${tables} and a.attnum>0 and not a.attisdropped
 and has_column_privilege(r.papel,c.oid,a.attnum,v.privilegio) is distinct from (r.papel='authenticated' and n.nspname='public' and v.privilegio='SELECT')),
 'Nenhuma escrita por coluna; sem acesso ao contador.'
union all select 'EXECUTE efetivo e nenhum grant PUBLIC',not exists(
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join (values ('anon'),('authenticated')) r(papel)
 where n.nspname in ('public','private') and p.proname in ${names}
 and has_function_privilege(r.papel,p.oid,'EXECUTE') is distinct from (r.papel='authenticated' and ((n.nspname='public' and p.proname in ('create_quote','update_quote','remove_quote')) or (n.nspname='private' and p.proname='has_quotes_access'))))
 and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname in ('public','private') and p.proname in ${names} and a.grantee=0),
 'Somente helper RLS e três RPCs executáveis por authenticated; internos/anon/PUBLIC bloqueados.'
union all select 'Nenhum grant PUBLIC nas tabelas ou colunas',not exists(
 select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where n.nspname||'.'||c.relname in ${tables} and a.grantee=0)
 and not exists(select 1 from pg_attribute att join pg_class c on c.oid=att.attrelid join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(att.attacl) a where n.nspname||'.'||c.relname in ${tables} and a.grantee=0),
 'PUBLIC sem grants, inclusive por coluna.'
union all select 'Proprietários confiáveis e API sem bypass',
 (select count(*)=2 and bool_and(not rolsuper and not rolbypassrls) from pg_roles where rolname in ('anon','authenticated'))
 and exists(select 1 from pg_proc b where b.oid=to_regprocedure('private.is_company_member(uuid)'))
 and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname||'.'||c.relname in ${tables} and (c.relowner is distinct from (select proowner from pg_proc where oid=to_regprocedure('private.is_company_member(uuid)')) or pg_has_role('authenticated',c.relowner,'USAGE') or pg_has_role('anon',c.relowner,'USAGE')))
 and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ${names} and (p.proowner is distinct from (select proowner from pg_proc where oid=to_regprocedure('private.is_company_member(uuid)')) or pg_has_role('authenticated',p.proowner,'USAGE') or pg_has_role('anon',p.proowner,'USAGE'))),
 'Objetos novos com o dono do helper inicial; API não pode assumir seus privilégios.'
union all select 'Schemas e timestamp reutilizado',
 has_schema_privilege('authenticated','private','USAGE') and has_schema_privilege('authenticated','public','USAGE')
 and not has_schema_privilege('authenticated','private','CREATE') and not has_schema_privilege('anon','private','CREATE')
 and exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure('private.touch_updated_at()') and l.lanname='plpgsql' and p.prorettype='trigger'::regtype and not p.prosecdef and p.proconfig=array['search_path=""'] and lower(btrim(regexp_replace(p.prosrc,'[[:space:]]+',' ','g')))='begin new.updated_at := pg_catalog.now(); return new; end;'),
 'USAGE sem CREATE em private; helper de timestamp inicial preservado.'`;
async function setup(db){
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb not null default '{}'::jsonb);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
}
async function main(){const db=new PGlite();try{
 await setup(db);
 const files=fs.readdirSync(path.join(root,'supabase/migrations')).filter(n=>n.endsWith('.sql')&&n<='20261104000100_quotes.sql').sort();
 const preflight=fs.readFileSync(path.join(root,'docs/preflight-orcamentos.sql'),'utf8');
 for(const file of files){
  if(file==='20261104000100_quotes.sql'){
   const before=(await db.query(preflight)).rows;assert.match(before.find(r=>r.etapa==='0. Decisão').resultado,/CANDIDATA A PRIMEIRA/);
   await db.exec('begin;create function public.create_quote() returns void language sql as $$select$$;');
   assert.match((await db.query(preflight)).rows.find(r=>r.etapa==='0. Decisão').resultado,/PARCIAL\/CONFLITO/);await db.exec('rollback');
  }
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations',file),'utf8'));
 }
 assert.match((await db.query(preflight)).rows.find(r=>r.etapa==='0. Decisão').resultado,/OBJETOS PRESENTES/);
 console.log('PASS: preflight distingue primeira aplicação, sobrecarga conflitante e objetos já instalados.');
 const checks=[];for(const [name,q] of Object.entries(queries)){const expected=(await db.query(norm(q))).rows[0].coalesce;checks.push(`select ${literal(name)} verificacao, (${norm(q)})=${literal(JSON.stringify(expected))}::jsonb correto, 'Contrato integral da migration; diferenças de formatação/versão exigem revisão, nunca reaplicação.' observacao`);}
 const sql=`-- SOMENTE LEITURA: executar inteiro APÓS a migration, como administrador no SQL Editor.\n-- Não chama RPCs, não lê registros de clientes/propostas e não cria/altera dados ou objetos.\n-- Contrato gerado pelas quatro migrations locais; PostgreSQL 18 NOT NULL é verificado nas colunas.\n-- Qualquer REVISAR exige inspeção; não reaplicar migration nem usar DROP/RESET.\nwith checagens as (\n${checks.join('\nunion all\n')}\n${extra}\n)\nselect verificacao,case when coalesce(correto,false) then 'OK' else 'REVISAR' end resultado,observacao from checagens order by verificacao;\n`;
 if(process.argv.includes('--generate'))fs.writeFileSync(target,sql);
 assert.equal(fs.readFileSync(target,'utf8'),sql,'Audit contract is stale; review then regenerate locally with --generate');
 const run=async()=> (await db.query(sql)).rows;
 let rows=await run();assert.equal(rows.length,13);assert.deepEqual(rows.filter(r=>r.resultado!=='OK'),[]);console.log('PASS: contrato completo instalado, 13 verificações OK.');
 const functions=(await db.query("select pg_get_functiondef(p.oid) definicao from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in "+names)).rows;
 await db.exec('begin');try{for(const f of functions)await db.exec(f.definicao.replaceAll('\n','\r\n'));assert.deepEqual((await run()).filter(r=>r.resultado!=='OK'),[]);console.log('PASS: corpos com CRLF preservam os 13 OK, sem ignorar outras alterações.');}finally{await db.exec('rollback');}

 const cases=[
 ['RLS desativada','alter table public.quotes disable row level security','Tabelas, RLS e persistência'],
 ['política extra',"create policy leaked on public.quotes for select using(true)",'Políticas completas, incluindo extras'],
 ['grant por coluna','grant update(notes) on public.quotes to authenticated','Privilégios efetivos por coluna'],
 ['grant PUBLIC','grant select on private.quote_counters to public','Nenhum grant PUBLIC nas tabelas ou colunas'],
 ['EXECUTE interno','grant execute on function private.validate_quote_input(jsonb) to authenticated','EXECUTE efetivo e nenhum grant PUBLIC'],
 ['corpo RPC adulterado',"create or replace function public.remove_quote(p_company_id uuid,p_quote_id uuid,p_revision bigint) returns void language plpgsql security definer set search_path='' as $$begin return; end;$$",'Funções: assinatura, corpo integral e segurança'],
 ['FK removida','alter table public.quotes drop constraint quotes_company_id_fkey','Constraints, FKs e ações de exclusão'],
 ['trigger desativado','alter table public.quotes disable trigger quotes_updated','Triggers de aplicação'],
 ['índice removido','drop index public.quotes_company_client','Índices, ordem de colunas e validade'],
 ];
 for(const [label,mutation,check] of cases){await db.exec('begin');try{await db.exec(mutation);rows=await run();assert.equal(rows.find(r=>r.verificacao===check).resultado,'REVISAR',label);}finally{await db.exec('rollback');}console.log('PASS: detecta '+label+'.');}
 await db.exec('drop table public.quotes cascade;drop table private.quote_counters');rows=await run();assert.equal(rows.find(r=>r.verificacao==='Tabelas, RLS e persistência').resultado,'REVISAR');console.log('PASS: objetos ausentes são REVISAR sem erro de regclass.');
 }finally{await db.close();}}
main().catch(error=>{console.error(error);process.exitCode=1;});
