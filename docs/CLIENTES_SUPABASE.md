# Clientes no Supabase — implantação incremental

## O que muda

Clientes no painel (`/painel?modulo=clientes`) usa o PostgreSQL por meio do usuário autenticado. Cada Server Action revalida a conta, o vínculo e a empresa UUID ativa e rejeita uma requisição de uma tela cuja empresa já mudou. O adaptador `createSupabaseClientRepository` recebe esse cliente Supabase e o UUID; nenhuma operação usa chave administrativa. O banco aplica RLS também em chamadas diretas à API.

Os cadastros permanecem no banco após logout, login, limpeza do navegador e acesso por outro dispositivo. A interface pode ser atualizada pelo botão **Atualizar lista**, ao recarregar a página ou ao voltar à aba. Não há sincronização Realtime nesta etapa. Em caso de falha, não há fallback para dados locais. Nenhum dado é importado automaticamente.

A demonstração `/demo` continua utilizando o adaptador local e a chave `orvelium.clients.v1:<nome-codificado>`. Seu conteúdo não é lido pelo adaptador remoto. Os avisos e rótulos distinguem os ambientes; os formulários, filtros, detalhes e confirmações continuam com a identidade visual existente.

## Permissões efetivas no banco

| Papel atual na empresa | Consultar | Cadastrar/editar | Excluir |
| --- | --- | --- | --- |
| Proprietário | Sim | Sim | Sim |
| Administrador | Sim | Sim | Sim |
| Membro | Sim | Sim | Não |
| Leitor | Sim | Não | Não |
| Sem vínculo, anônimo ou e-mail não confirmado | Não | Não | Não |

RLS usa o vínculo atual, não nome da empresa, preferência ativa, papel em metadados ou papel de outra empresa. Uma pessoa vinculada a duas empresas pode consultar ambas pela API sob suas respectivas permissões; a interface limita cada operação à empresa ativa conferida no servidor. Revogar o vínculo bloqueia a próxima consulta/escrita. Respostas já mostradas no navegador não podem ser revogadas retroativamente.

Identidade, empresa, autor e timestamps não têm grants de escrita para usuários da API. `company_id` não pode ser alterado para mover registros. `created_by` é preenchido por `auth.uid()` e pode ficar nulo se o usuário for removido administrativamente. A exclusão administrativa de uma empresa com clientes é impedida pela FK `RESTRICT`, preservando os cadastros. A atualização de timestamp é feita por trigger.

CPF/CNPJ são armazenados somente como dígitos e possuem unicidade por `(company_id, document)`, inclusive em gravações concorrentes. O mesmo documento é permitido em empresas distintas. O adaptador normaliza a entrada; chamadas diretas devem enviar valores normalizados. A validação mantém a regra existente de formato/tamanho, sem consulta cadastral nem cálculo de dígitos verificadores. Campos e comprimentos também são validados no banco. Edições usam a última gravação; não há controle de revisão otimista nesta etapa.

## Orçamentos e Serviços: separação preservada

Foram revisados `components/quotes/quotes-module.tsx`, `components/services/services-module.tsx` e os adaptadores em `lib/quotes`/`lib/services`. Eles continuam recebendo/criando o `createLocalClientRepository` somente na demonstração. Não foi injetado o repositório remoto em documentos locais. Seus IDs e snapshots históricos permanecem intactos; excluir/editar um cliente remoto não toca os cadastros e históricos locais. Orçamentos e Serviços no painel real continuam indisponíveis até sua própria integração transacional. O novo módulo remoto nunca os monta.

## Antes de executar SQL

**Estado informado neste projeto:** o responsável executou a migration de Clientes manualmente e enviou a inspeção do esquema, das políticas, dos grants e dos helpers. A revisão não identificou divergência funcional. Não reaplique a migration neste projeto. As instruções de instalação abaixo servem para outros ambientes ainda sem a tabela, sempre após inspeção. O CRUD real, a persistência após novo login e o isolamento no aplicativo publicado continuam pendentes de validação.

As duas migrations iniciais foram aplicadas manualmente, conforme informado pelo responsável. **Não reaplicá-las, não executar reset e não usar `db push` indiscriminadamente**: o histórico do CLI pode não registrar execuções pelo SQL Editor.

No projeto correto do Supabase, abra o **SQL Editor** e execute primeiro somente estas consultas de inspeção:

```sql
select
  to_regclass('public.companies') as empresas,
  to_regclass('public.company_memberships') as vinculos,
  to_regtype('public.company_role') as papeis,
  to_regprocedure('private.touch_updated_at()') as trigger_timestamp,
  to_regclass('public.clients') as clientes,
  to_regprocedure('private.has_clients_access(uuid,text)') as autorizacao_clientes;
```

Os quatro primeiros resultados devem existir. Os dois últimos devem ser `NULL` para uma instalação nova de Clientes. Se `clientes` ou `autorizacao_clientes` já existir, **pare e inspecione** os objetos antes de executar a migration: não recrie, apague ou sobrescreva silenciosamente uma estrutura instalada.

Para inspecionar eventual tabela existente:

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='clients'
order by ordinal_position;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname='public' and tablename='clients';
```

## Aplicar a migration no SQL Editor

1. Confirme projeto e ambiente; preferencialmente valide primeiro em um projeto de testes com a base inicial instalada.
2. Abra `supabase/migrations/20261103000100_clients.sql` deste repositório.
3. Copie **todo o conteúdo**, de `begin;` a `commit;`, em uma nova consulta do SQL Editor e execute **uma única vez** com a função administrativa padrão do editor.
4. Não copie o bootstrap `auth` de nenhum teste: o Supabase já fornece `auth.users`, `auth.uid()`, `anon` e `authenticated`.
5. A migration cria somente `public.clients`, índices, trigger, helper privado, políticas e grants. Ela não altera as migrations antigas, não importa localStorage e não modifica registros de empresas/usuários/vínculos. É transacional; erros devem ser investigados antes de qualquer nova tentativa, sem excluir objetos para forçar sucesso.
6. Após confirmar a instalação, publique o código com as mesmas variáveis públicas já utilizadas pelo Auth. Não há variável nova ou chave `service_role` a cadastrar. Em ambientes restritos, preserve a liberação do hostname do projeto Supabase.

### Conferir o resultado

```sql
select relrowsecurity
from pg_class
where oid='public.clients'::regclass;
-- Esperado: true

select policyname, cmd, roles
from pg_policies
where schemaname='public' and tablename='clients'
order by policyname;
-- Esperado: clients_read/SELECT, clients_create/INSERT,
-- clients_update/UPDATE e clients_delete/DELETE para authenticated.

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid='public.clients'::regclass;

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema='public' and table_name='clients'
  and grantee in ('anon','authenticated')
order by grantee, privilege_type, column_name;
```

O SQL Editor administrativo normalmente ignora RLS. Consultar por ele **não comprova isolamento de um usuário**. Valide também com sessões comuns pelo aplicativo/API, usando contas próprias e cadastros fictícios em projeto de testes:

- Proprietário cria PF/PJ, edita e exclui com confirmação; documento duplicado na mesma empresa é rejeitado.
- Logout/login e outro navegador/dispositivo recuperam o mesmo cliente.
- Empresas A/B, mesmo com nomes iguais, não compartilham cadastros; o mesmo CPF/CNPJ pode existir em ambas.
- Leitor só consulta. Membro cria/edita mas não exclui. Administrador pode excluir só onde tem esse papel.
- Chamadas diretas com UUID de outra empresa/cliente, mudança de `company_id`, autor ou timestamps são negadas.
- Revogação e sessão expirada bloqueiam novas operações; uma aba antiga não grava na empresa recém-selecionada.
- `/demo`, Orçamentos, OS, snapshots e dados antigos permanecem separados.

Não executar esses cadastros de teste em dados reais sem autorização. O esquema/tipos atuais são um contrato revisado com base nas migrations, não tipos gerados do projeto remoto. Após instalação autorizada, os tipos podem ser gerados e comparados em uma tarefa própria, sem sobrescrever código sem revisão.

## Testes locais e limites de validação

- `npm run test:clients:supabase`: executa a migration incremental sobre uma base com empresas/vínculos já existentes em PostgreSQL embarcado PGlite. Testa o adaptador real, RLS por papel/empresa, duplicidades, grants imutáveis, validação, revogação, contagem e paginação além do limite de resposta. O transporte SDK/PostgREST e a identidade são simulados; não testa GoTrue ou PostgREST hospedados.
- `npm run test:clients:actions`: testa Server Actions reais com dependências simuladas; inclui requisição antiga após troca de empresa, sessão expirada/redirecionamento e mensagens sem vazamento de detalhes internos.
- `npm run test:auth-boundaries`, `npm run test:supabase`: regressões da autenticação e das migrations iniciais com RLS local.
- `npm run test:clients`, `npm run test:quotes`, `npm run test:services`, `npm run test:supabase:config`: regressões de dados locais, snapshots e configuração.
- Após `npm run build`, execute `npm run test:workspace:browser`, `npm run test:supabase:browser`, `npm run test:quotes:browser` e `npm run test:services:browser`. A fixture do painel testa os componentes reais de Clientes com transporte e Auth locais simulados: CRUD, duplicidade, filtros, permissões visuais, reload, novo contexto de navegador, troca de empresa, falhas sem fallback local e 320/390 px. Ela não é uma rota do app e nunca é publicada.
- `npm run typecheck` e `npm run build`.

A autenticação e a criação de empresas no deploy foram validadas manualmente pelo responsável, segundo informado. **A instalação manual da tabela foi informada pelo responsável; falta validar o ciclo completo de Clientes no aplicativo publicado. Nenhuma migration remota foi executada pelo agente.**

## Arquivos desta entrega

```text
README.md
app/conta/entrar/page.tsx
app/conta/page.tsx
app/painel/client-actions.ts
app/painel/page.tsx
components/clients/client-form.tsx
components/clients/clients-module.tsx
components/clients/remote-clients-module.tsx
docs/CLIENTES_SUPABASE.md
docs/auditoria-clientes.sql
docs/SUPABASE.md
lib/clients/action-result.ts
lib/clients/supabase-repository.ts
lib/clients/types.ts
lib/supabase/database.types.ts
package.json
scripts/test-auth-boundaries.cjs
scripts/test-client-actions.cjs
scripts/test-clients-supabase.cjs
scripts/test-workspace-browser.cjs
supabase/migrations/20261103000100_clients.sql
```

A consulta somente de leitura `docs/auditoria-clientes.sql` oferece 18 verificações estruturais. Ela confere NOT NULL pelas colunas, independentemente de registros `contype=n` presentes em versões mais novas do PostgreSQL, e aceita diferenças de maiúsculas no corpo não citado do helper de timestamp. Não altera políticas nem substitui testes de isolamento com usuários comuns.
