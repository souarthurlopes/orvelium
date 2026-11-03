-- ORVELIUM ONE: auditoria estrutural de Clientes. SOMENTE LEITURA.
-- Executar no SQL Editor administrativo, uma vez; nao executa migrations.
-- Nao le registros de clientes/usuarios: consulta apenas catalogos e privilegios.
-- REVISAR pode significar divergencia real ou formatacao de outra versao do PostgreSQL.
-- NOT NULL e verificado nas colunas, sem depender de constraints n do PostgreSQL 18.
-- No helper de timestamp, aceita maiusculas/minusculas somente sem literais/identificadores entre aspas.
-- Todos OK nao substituem testes de isolamento com usuarios comuns.
with
objetos as (select to_regclass('public.clients') as tabela,to_regprocedure('private.has_clients_access(uuid,text)') as funcao,(select oid from pg_roles where rolname='authenticated') as auth,(select oid from pg_roles where rolname='anon') as anon),
esperado as (select
  '[{"nome":"id","tipo":"uuid","obrigatoria":true,"padrao":"gen_random_uuid()"},{"nome":"company_id","tipo":"uuid","obrigatoria":true,"padrao":null},{"nome":"type","tipo":"text","obrigatoria":true,"padrao":null},{"nome":"status","tipo":"text","obrigatoria":true,"padrao":"''active''::text"},{"nome":"name","tipo":"text","obrigatoria":true,"padrao":null},{"nome":"document","tipo":"text","obrigatoria":true,"padrao":null},{"nome":"phone","tipo":"text","obrigatoria":true,"padrao":"''''::text"},{"nome":"email","tipo":"text","obrigatoria":true,"padrao":"''''::text"},{"nome":"address","tipo":"text","obrigatoria":true,"padrao":"''''::text"},{"nome":"city","tipo":"text","obrigatoria":true,"padrao":"''''::text"},{"nome":"state","tipo":"text","obrigatoria":true,"padrao":"''''::text"},{"nome":"notes","tipo":"text","obrigatoria":true,"padrao":"''''::text"},{"nome":"created_by","tipo":"uuid","obrigatoria":false,"padrao":"auth.uid()"},{"nome":"created_at","tipo":"timestamp with time zone","obrigatoria":true,"padrao":"now()"},{"nome":"updated_at","tipo":"timestamp with time zone","obrigatoria":true,"padrao":"now()"}]'::jsonb as colunas,
  '[{"nome":"clients_address_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK ((char_length(address) <= 200))"},{"nome":"clients_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK ((((type = ''individual''::text) AND (document ~ ''^[0-9]{11}$''::text)) OR ((type = ''company''::text) AND (document ~ ''^[0-9]{14}$''::text))))"},{"nome":"clients_city_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK ((char_length(city) <= 80))"},{"nome":"clients_company_document_key","tipo":"u","validada":true,"adiavel":false,"definicao":"UNIQUE (company_id, document)"},{"nome":"clients_company_id_fkey","tipo":"f","validada":true,"adiavel":false,"definicao":"FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT"},{"nome":"clients_created_by_fkey","tipo":"f","validada":true,"adiavel":false,"definicao":"FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL"},{"nome":"clients_email_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK (((char_length(email) <= 160) AND ((email = ''''::text) OR (email ~ ''^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$''::text))))"},{"nome":"clients_name_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK (((name = btrim(name)) AND ((char_length(name) >= 1) AND (char_length(name) <= 120))))"},{"nome":"clients_notes_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK ((char_length(notes) <= 2000))"},{"nome":"clients_phone_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK (((phone = ''''::text) OR (phone ~ ''^[0-9]{10,11}$''::text)))"},{"nome":"clients_pkey","tipo":"p","validada":true,"adiavel":false,"definicao":"PRIMARY KEY (id)"},{"nome":"clients_state_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK ((state = ANY (ARRAY[''''::text, ''AC''::text, ''AL''::text, ''AP''::text, ''AM''::text, ''BA''::text, ''CE''::text, ''DF''::text, ''ES''::text, ''GO''::text, ''MA''::text, ''MT''::text, ''MS''::text, ''MG''::text, ''PA''::text, ''PB''::text, ''PR''::text, ''PE''::text, ''PI''::text, ''RJ''::text, ''RN''::text, ''RS''::text, ''RO''::text, ''RR''::text, ''SC''::text, ''SP''::text, ''SE''::text, ''TO''::text])))"},{"nome":"clients_status_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK ((status = ANY (ARRAY[''active''::text, ''inactive''::text])))"},{"nome":"clients_type_check","tipo":"c","validada":true,"adiavel":false,"definicao":"CHECK ((type = ANY (ARRAY[''individual''::text, ''company''::text])))"}]'::jsonb as restricoes,
  '[{"nome":"clients_create","comando":"a","permissiva":true,"papeis":["authenticated"],"filtro":null,"validacao":"private.has_clients_access(company_id, ''create''::text)"},{"nome":"clients_delete","comando":"d","permissiva":true,"papeis":["authenticated"],"filtro":"private.has_clients_access(company_id, ''delete''::text)","validacao":null},{"nome":"clients_read","comando":"r","permissiva":true,"papeis":["authenticated"],"filtro":"private.has_clients_access(company_id, ''read''::text)","validacao":null},{"nome":"clients_update","comando":"w","permissiva":true,"papeis":["authenticated"],"filtro":"private.has_clients_access(company_id, ''update''::text)","validacao":"private.has_clients_access(company_id, ''update''::text)"}]'::jsonb as politicas,
  '[{"nome":"clients_company_document_key","valido":true,"pronto":true,"definicao":"CREATE UNIQUE INDEX clients_company_document_key ON public.clients USING btree (company_id, document)"},{"nome":"clients_company_name_id","valido":true,"pronto":true,"definicao":"CREATE INDEX clients_company_name_id ON public.clients USING btree (company_id, name, id)"},{"nome":"clients_company_status","valido":true,"pronto":true,"definicao":"CREATE INDEX clients_company_status ON public.clients USING btree (company_id, status)"},{"nome":"clients_pkey","valido":true,"pronto":true,"definicao":"CREATE UNIQUE INDEX clients_pkey ON public.clients USING btree (id)"}]'::jsonb as indices,
  'select exists( select 1 from public.company_memberships m join auth.users u on u.id=m.user_id where m.company_id=p_company_id and m.user_id=auth.uid() and u.email_confirmed_at is not null and case p_operation when ''read'' then m.role in (''owner'',''admin'',''member'',''viewer'') when ''create'' then m.role in (''owner'',''admin'',''member'') when ''update'' then m.role in (''owner'',''admin'',''member'') when ''delete'' then m.role in (''owner'',''admin'') else false end );'::text as corpo_funcao,
  '["search_path=\"\""]'::jsonb as config_funcao,
  'begin new.updated_at := pg_catalog.now(); return new; end;'::text as corpo_timestamp,
  '["search_path=\"\""]'::jsonb as config_timestamp
),
colunas as (
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) as atual
  from (select a.attname as nome,format_type(a.atttypid,a.atttypmod) as tipo,a.attnotnull as obrigatoria,regexp_replace(btrim(pg_get_expr(d.adbin,d.adrelid)),E'\\s+',' ','g') as padrao from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=to_regclass('public.clients') and a.attnum>0 and not a.attisdropped order by a.attnum) v
),
restricoes as (
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) as atual
  from (select c.conname as nome,c.contype as tipo,c.convalidated as validada,c.condeferrable as adiavel,regexp_replace(btrim(pg_get_constraintdef(c.oid)), '[[:space:]]+', ' ', 'g') as definicao from pg_constraint c where c.conrelid=to_regclass('public.clients') and c.contype<>'n' order by c.conname) v
),
politicas as (
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) as atual
  from (select p.polname as nome,p.polcmd::text as comando,p.polpermissive as permissiva,(select array_agg(coalesce(r.rolname::text,'PUBLIC') order by coalesce(r.rolname::text,'PUBLIC')) from unnest(p.polroles) id left join pg_roles r on r.oid=id) as papeis,regexp_replace(btrim(pg_get_expr(p.polqual,p.polrelid)), '[[:space:]]+', ' ', 'g') as filtro,regexp_replace(btrim(pg_get_expr(p.polwithcheck,p.polrelid)), '[[:space:]]+', ' ', 'g') as validacao from pg_policy p where p.polrelid=to_regclass('public.clients') order by p.polname) v
),
indices as (
  select coalesce(jsonb_agg(to_jsonb(v)), '[]'::jsonb) as atual
  from (select ci.relname as nome,i.indisvalid as valido,i.indisready as pronto,regexp_replace(btrim(pg_get_indexdef(i.indexrelid)), '[[:space:]]+', ' ', 'g') as definicao from pg_index i join pg_class ci on ci.oid=i.indexrelid where i.indrelid=to_regclass('public.clients') order by ci.relname) v
),
checagens as (
  select 1 as ordem,'Tabela clients' as verificacao,coalesce((exists(select 1 from pg_class c where c.oid=o.tabela and c.relkind='r')),false) as correto,'Deve existir como tabela comum em public.' as observacao
  from objetos o
  union all
  select 2 as ordem,'15 colunas, tipos, NOT NULL e defaults' as verificacao,coalesce(((select atual from colunas)=(select colunas from esperado)),false) as correto,'Comparacao exata com o contrato da migration; formatacao diferente pode exigir revisao.' as observacao
  from objetos o
  union all
  select 3 as ordem,'Constraints e validacoes' as verificacao,coalesce(((select atual from restricoes)=(select restricoes from esperado)),false) as correto,'Inclui PK, documento unico por empresa, FKs/acoes de exclusao e todos os CHECKs validados.' as observacao
  from objetos o
  union all
  select 4 as ordem,'Indices esperados' as verificacao,coalesce(((select atual from indices)=(select indices from esperado)),false) as correto,'Compara indices, ordem de colunas e validade; indice extra tambem pede revisao.' as observacao
  from objetos o
  union all
  select 5 as ordem,'RLS ativada' as verificacao,coalesce((exists(select 1 from pg_class c where c.oid=o.tabela and c.relrowsecurity)),false) as correto,'RLS deve estar habilitada para clientes.' as observacao
  from objetos o
  union all
  select 6 as ordem,'Quatro politicas completas' as verificacao,coalesce(((select atual from politicas)=(select politicas from esperado)),false) as correto,'Compara comandos, papeis, USING e WITH CHECK; politicas extras pedem revisao.' as observacao
  from objetos o
  union all
  select 7 as ordem,'Assinatura e seguranca da funcao' as verificacao,coalesce((exists(select 1 from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=o.funcao and p.prorettype='boolean'::regtype and l.lanname='sql' and p.provolatile='s' and p.prosecdef and not p.proretset and p.pronargs=2 and p.pronargdefaults=0 and to_jsonb(p.proconfig)=(select config_funcao from esperado))),false) as correto,'Boolean, SQL, STABLE, SECURITY DEFINER e search_path vazio.' as observacao
  from objetos o
  union all
  select 8 as ordem,'Corpo completo da autorizacao' as verificacao,coalesce((exists(select 1 from pg_proc p where p.oid=o.funcao and btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g'))=(select corpo_funcao from esperado))),false) as correto,'Confere auth.uid(), vinculo, confirmacao do email e a matriz completa de papeis.' as observacao
  from objetos o
  union all
  select 9 as ordem,'Proprietarios dos objetos novos' as verificacao,coalesce((exists(select 1 from pg_proc p join pg_class c on c.oid=o.tabela join pg_proc b on b.oid=to_regprocedure('private.is_company_member(uuid)') where p.oid=o.funcao and p.proowner=b.proowner and c.relowner=b.proowner)),false) as correto,'Tabela/helper devem pertencer ao mesmo proprietario do helper inicial, nao a um papel da API.' as observacao
  from objetos o
  union all
  select 10 as ordem,'EXECUTE do helper' as verificacao,coalesce((has_function_privilege(o.auth,o.funcao,'EXECUTE') and not has_function_privilege(o.anon,o.funcao,'EXECUTE') and not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl where p.oid=o.funcao and acl.grantee=0)),false) as correto,'authenticated executa; anon e PUBLIC nao executam.' as observacao
  from objetos o
  union all
  select 11 as ordem,'Grants de tabela para authenticated' as verificacao,coalesce((o.tabela is not null and not exists(select 1 from (values ('SELECT',true),('DELETE',true),('INSERT',false),('UPDATE',false),('TRUNCATE',false),('REFERENCES',false),('TRIGGER',false)) e(privilegio,permitido) where has_table_privilege(o.auth,o.tabela,e.privilegio) is distinct from e.permitido)),false) as correto,'SELECT/DELETE na tabela; INSERT/UPDATE somente por coluna; sem TRUNCATE/REFERENCES/TRIGGER.' as observacao
  from objetos o
  union all
  select 12 as ordem,'Grants por coluna para authenticated' as verificacao,coalesce((o.tabela is not null and not exists(select 1 from pg_attribute a cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilegio) where a.attrelid=o.tabela and a.attnum>0 and not a.attisdropped and has_column_privilege(o.auth,o.tabela,a.attnum,v.privilegio) is distinct from (case v.privilegio when 'SELECT' then true when 'INSERT' then a.attname in ('company_id','type','status','name','document','phone','email','address','city','state','notes') when 'UPDATE' then a.attname in ('type','status','name','document','phone','email','address','city','state','notes') else false end))),false) as correto,'ID, empresa na atualizacao, autor e timestamps devem ficar protegidos.' as observacao
  from objetos o
  union all
  select 13 as ordem,'Nenhum acesso de anon' as verificacao,coalesce((o.tabela is not null and not exists(select 1 from (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) v(privilegio) where has_table_privilege(o.anon,o.tabela,v.privilegio)) and not exists(select 1 from pg_attribute a cross join (values ('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) v(privilegio) where a.attrelid=o.tabela and a.attnum>0 and not a.attisdropped and has_column_privilege(o.anon,o.tabela,a.attnum,v.privilegio))),false) as correto,'Verifica permissoes efetivas de anon, inclusive grants herdados ou por coluna.' as observacao
  from objetos o
  union all
  select 14 as ordem,'Nenhum grant a PUBLIC' as verificacao,coalesce((o.tabela is not null and not exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) acl where c.oid=o.tabela and acl.grantee=0) and not exists(select 1 from pg_attribute a cross join lateral aclexplode(a.attacl) acl where a.attrelid=o.tabela and a.attnum>0 and not a.attisdropped and acl.grantee=0)),false) as correto,'PUBLIC nao pode receber grants na tabela ou nas colunas.' as observacao
  from objetos o
  union all
  select 15 as ordem,'Papeis da API sem bypass de RLS' as verificacao,coalesce(((select count(*)=2 from pg_roles r where r.oid in (o.auth,o.anon) and not r.rolsuper and not r.rolbypassrls) and exists(select 1 from pg_class c where c.oid=o.tabela and not pg_has_role(o.auth,c.relowner,'USAGE') and not pg_has_role(o.anon,c.relowner,'USAGE'))),false) as correto,'authenticated/anon nao podem ser superusuarios, BYPASSRLS ou herdar o dono da tabela.' as observacao
  from objetos o
  union all
  select 16 as ordem,'Schema private protegido' as verificacao,coalesce((has_schema_privilege(o.auth,to_regnamespace('private'),'USAGE') and not has_schema_privilege(o.auth,to_regnamespace('private'),'CREATE') and not has_schema_privilege(o.anon,to_regnamespace('private'),'CREATE')),false) as correto,'authenticated precisa de USAGE, sem permitir criacao de objetos pelos papeis da API.' as observacao
  from objetos o
  union all
  select 17 as ordem,'Trigger de updated_at' as verificacao,coalesce(((select count(*)=1 and bool_and(t.tgname='clients_updated' and t.tgfoid=to_regprocedure('private.touch_updated_at()') and t.tgtype=19 and t.tgenabled in ('O','A') and t.tgqual is null and t.tgnargs=0) from pg_trigger t where t.tgrelid=o.tabela and not t.tgisinternal)),false) as correto,'Exatamente um trigger de aplicacao: BEFORE UPDATE FOR EACH ROW, ativo e sem filtro.' as observacao
  from objetos o
  union all
  select 18 as ordem,'Funcao de timestamp preservada' as verificacao,coalesce((exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.touch_updated_at()') and strpos(p.prosrc,chr(39))=0 and strpos(p.prosrc,chr(34))=0 and lower(btrim(regexp_replace(p.prosrc, '[[:space:]]+', ' ', 'g')))=(select corpo_timestamp from esperado) and to_jsonb(p.proconfig)=(select config_timestamp from esperado))),false) as correto,'Confere corpo e search_path do helper de timestamp reutilizado da migration inicial.' as observacao
  from objetos o
)
select ordem,verificacao,case when correto then 'OK' else 'REVISAR' end as resultado,observacao
from checagens order by ordem;
