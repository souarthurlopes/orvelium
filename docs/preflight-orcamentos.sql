-- SOMENTE LEITURA. Execute ANTES de decidir aplicar a migration.
-- Confirme primeiro o projeto no seletor do Supabase; nomes de empresas não identificam o projeto.
-- Este inventário não substitui a auditoria das migrations anteriores já instaladas.
with dependencias(nome,existe) as (
 values
 ('schema private',to_regnamespace('private') is not null),
 ('auth.users',to_regclass('auth.users') is not null),
 ('auth.uid()',to_regprocedure('auth.uid()') is not null),
 ('public.profiles',to_regclass('public.profiles') is not null),
 ('public.companies',to_regclass('public.companies') is not null),
 ('public.company_memberships',to_regclass('public.company_memberships') is not null),
 ('public.user_preferences',to_regclass('public.user_preferences') is not null),
 ('public.clients',to_regclass('public.clients') is not null),
 ('public.company_role',to_regtype('public.company_role') is not null),
 ('private.touch_updated_at()',to_regprocedure('private.touch_updated_at()') is not null),
 ('private.has_clients_access(uuid,text)',to_regprocedure('private.has_clients_access(uuid,text)') is not null),
 ('private.is_company_member(uuid)',to_regprocedure('private.is_company_member(uuid)') is not null),
 ('gen_random_uuid()',to_regprocedure('gen_random_uuid()') is not null),
 ('papéis anon/authenticated',(select count(*)=2 from pg_roles where rolname in ('anon','authenticated'))),
 ('enum de papéis',(select array_agg(e.enumlabel::text order by e.enumsortorder)=array['owner','admin','member','viewer'] from pg_enum e where e.enumtypid=to_regtype('public.company_role'))),
 ('contrato mínimo de colunas das dependências',not exists(
   select 1 from (values
    ('auth.users','id','uuid'),('auth.users','email_confirmed_at','timestamp with time zone'),
    ('public.companies','id','uuid'),('public.companies','name','text'),
    ('public.company_memberships','company_id','uuid'),('public.company_memberships','user_id','uuid'),('public.company_memberships','role','company_role'),
    ('public.user_preferences','user_id','uuid'),('public.user_preferences','active_company_id','uuid'),
    ('public.profiles','id','uuid'),('public.profiles','full_name','text'),
    ('public.clients','id','uuid'),('public.clients','company_id','uuid'),('public.clients','name','text'),
    ('public.clients','type','text'),('public.clients','document','text'),('public.clients','phone','text'),
    ('public.clients','email','text'),('public.clients','address','text'),('public.clients','city','text'),('public.clients','state','text')
   ) e(tabela,coluna,tipo)
   where not exists(select 1 from pg_attribute a where a.attrelid=to_regclass(e.tabela) and a.attname=e.coluna and not a.attisdropped and format_type(a.atttypid,a.atttypmod)=e.tipo)
  )),
 ('unicidade do vínculo por empresa/usuário',exists(
   select 1 from pg_constraint c where c.conrelid=to_regclass('public.company_memberships') and c.contype='u' and c.convalidated and not c.condeferrable
   and (select array_agg(a.attname::text order by k.pos) from unnest(c.conkey) with ordinality k(num,pos) join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.num)=array['company_id','user_id']
 ))
), novos_relacoes(nome) as (
 values ('public.quotes'),('private.quote_counters'),('public.quotes_pkey'),
 ('public.quotes_company_number_key'),('public.quotes_company_date'),('public.quotes_company_client'),('private.quote_counters_pkey')
), novos_funcoes(schema,nome,assinatura) as (
 values ('private','has_quotes_access','private.has_quotes_access(uuid,text)'),
 ('private','require_quote_access','private.require_quote_access(uuid,text)'),
 ('private','validate_quote_input','private.validate_quote_input(jsonb)'),
 ('private','capture_quote_client','private.capture_quote_client(uuid,uuid)'),
 ('public','create_quote','public.create_quote(uuid,jsonb)'),
 ('public','update_quote','public.update_quote(uuid,uuid,bigint,jsonb)'),
 ('public','remove_quote','public.remove_quote(uuid,uuid,bigint)')
), inventario as (
 select nome,to_regclass(nome) is not null presente from novos_relacoes
 union all
 -- Detecta também sobrecargas inesperadas com o mesmo nome.
 select f.assinatura,exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname=f.schema and p.proname=f.nome) from novos_funcoes f
 union all
 select 'tipo public.quotes (inclusive conflito sem tabela)',to_regtype('public.quotes') is not null
 union all
 select 'tipo private.quote_counters (inclusive conflito sem tabela)',to_regtype('private.quote_counters') is not null
), resumo as (
 select case
  when exists(select 1 from dependencias where existe is distinct from true) then 'PARAR: dependências ausentes/incompatíveis; não aplicar'
  when not exists(select 1 from inventario where presente) then 'CANDIDATA A PRIMEIRA APLICAÇÃO: objetos novos ausentes; revisar dependências e auditoria de Clientes'
  when (select bool_and(presente) from inventario) then 'OBJETOS PRESENTES: não reaplicar; executar auditoria-orcamentos.sql'
  else 'ESTADO PARCIAL/CONFLITO: não aplicar nem reaplicar; inspecionar definições'
 end estado
)
select '0. Decisão' etapa,'Orçamentos' objeto,estado resultado from resumo
union all
select '1. Dependência',nome,case when existe then 'PRESENTE (conferir contrato)' else 'AUSENTE/INCOMPATÍVEL' end from dependencias
union all
select '2. Objeto novo',nome,case when presente then 'PRESENTE: não reaplicar' else 'AUSENTE' end from inventario
order by etapa,objeto;
