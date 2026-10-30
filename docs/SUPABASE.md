# Supabase — Etapa 1

## Estado e limites desta entrega

Integração inicial com `@supabase/supabase-js` e `@supabase/ssr`, autenticação de e-mail/senha por Server Actions, confirmação de e-mail, sessão SSR, perfis, empresas, vínculos e empresa ativa. **Não considerar pronta para produção sem aplicar as migrations e validar o roteiro completo em um projeto Supabase real.** Os testes locais SQL não substituem GoTrue, PostgREST, entrega de e-mail, cookies, refresh ou Vercel.

A demonstração em `/` permanece disponível. Clientes, Orçamentos e Serviços continuam em `localStorage`, sem migração ou troca de repositório. A empresa ativa da conta **não filtra, protege ou sincroniza esses cadastros locais**. Não existe autenticação fictícia apresentada como real: a tela antiga continua demonstrativa; a nova área `/conta` usa exclusivamente o Supabase configurado. A navegação inclui o link “Área de conta”.

## Variáveis e instalação

Use Node 22/24 e `npm ci`. Copie `.env.example` para `.env.local`, que não é versionado. Configure:

| Nome | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Origem HTTPS pública do projeto Supabase, sem caminhos ou credenciais |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Chave pública `sb_publishable_...`; aceita também a chave legada `anon` |
| `NEXT_PUBLIC_SITE_URL` | Origem exata da aplicação: `http://localhost:3000` em desenvolvimento ou domínio HTTPS no deploy |

Nunca use `sb_secret_...`, `service_role`, senha do banco ou token de administração em variáveis `NEXT_PUBLIC_*`, arquivos do frontend ou commits. O preflight do `next.config.ts` rejeita chaves privilegiadas antes da compilação; os clientes também validam a configuração sem imprimir valores. Uma chave pública não é uma autorização administrativa: todas as operações autenticadas usam RLS/RPCs com o JWT do próprio usuário.

No ambiente de nuvem com rede restrita, autorize também o hostname HTTPS exato do projeto Supabase nas configurações de rede; variáveis não concedem acesso de rede automaticamente. Não amplie a lista para todos os projetos.

Sem configuração, a demonstração funciona e a área de conta fica explicitamente indisponível. Se configurar Supabase no build de produção, `NEXT_PUBLIC_SITE_URL` é obrigatória. Após alterar variáveis públicas, reinicie o desenvolvimento ou gere novo build/redeploy; salvar configuração não muda um bundle já compilado.

## Aplicar as migrations no projeto de testes

Use primeiro um projeto Supabase dedicado a testes com dados fictícios. Inspecione tabelas já existentes: estas migrations criam o esquema inicial e não sobrescrevem silenciosamente um esquema incompatível.

Em uma máquina confiável com o CLI oficial Supabase instalado:

```sh
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push --dry-run
supabase db push
```

O login e a conexão administrativa do CLI são para aplicar DDL. Informe credenciais somente pelos mecanismos seguros do CLI/ambiente; não as coloque no frontend nem no chat. Uma chave pública não pode aplicar migrations. Alternativamente, execute no SQL Editor, em ordem, os conteúdos completos de:

1. `supabase/migrations/20261030000100_identity_and_companies.sql`
2. `supabase/migrations/20261030000200_company_operations.sql`

Não execute o bootstrap `auth` do teste PGlite no Supabase: ele existe apenas dentro de `scripts/test-supabase.cjs`. O Supabase já fornece `auth.users`, `auth.uid()`, `anon` e `authenticated`.

O `supabase/config.toml` configura apenas a stack local, caso use `supabase start` com Docker. **Ele não aplica as configurações de Auth do projeto hospedado.** Não use resets destrutivos no projeto remoto. Depois de aplicar o esquema, gere e revise os tipos reais:

```sh
supabase gen types typescript --linked > lib/supabase/database.types.ts
npm run typecheck
```

O arquivo atual é um contrato tipado manual para estas migrations, não uma alegação de geração contra o seu projeto.

## Configurar Auth no painel Supabase

1. Habilite o provedor **Email** e cadastro por senha.
2. Habilite **Confirm email**. Use senha mínima de 12 caracteres para os novos cadastros. O banco também exige `email_confirmed_at` para criar empresas e associar usuários.
3. Em **URL Configuration**, configure **Site URL** para a origem real da aplicação. Adicione os redirects exatos `/auth/callback` e `/auth/confirm` dessa origem. Para desenvolvimento, inclua as duas URLs com `http://localhost:3000`. Evite curingas globais em produção.
4. O fluxo padrão usa PKCE com retorno a `/auth/callback`. Para confirmação de e-mail SSR por token hash, o template de confirmação pode apontar para:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirmar e-mail</a>
```

O segundo fluxo permite confirmação em outro navegador/dispositivo. Os endpoints usam destinos internos fixos e ignoram `next` externo. Links/códigos/tokens nunca devem ser registrados em logs. Os retornos inválidos não ecoam tokens.

5. Verifique as restrições do serviço de e-mail do projeto (destinatários, limites e SMTP). Configure SMTP próprio no painel antes de depender de entrega em produção; credenciais de SMTP não pertencem ao app.
6. Revise limites de requisição, política de senhas e demais opções do Auth no projeto real. Recuperação de senha, convites por e-mail, MFA e troca de proprietário não foram implementados nesta etapa.

## Modelo de dados e autorização

- `profiles`: UUID do usuário de `auth.users`, nome de exibição e timestamps. Um trigger cria/backfill o perfil. Metadados de cadastro não atribuem papéis nem empresas. Cada usuário só lê/edita seu próprio perfil, e só a coluna de nome pode ser atualizada pelo cliente.
- `companies`: UUID próprio, nome, razão social opcional e criador. Nomes não são identificadores nem precisam ser únicos.
- `company_memberships`: UUID do vínculo e unicidade `(company_id,user_id)`. Um usuário pode participar de várias empresas com papéis diferentes.
- `user_preferences`: empresa ativa por usuário. Só o RPC autorizado pode alterar a seleção; a seleção não é prova de autorização.
- `private.role_permissions`: matriz de permissões, fora dos schemas expostos à API e sem acesso direto por usuários.

| Papel | Ler empresa | Atualizar nome/razão social | Ler equipe | Conceder papéis/gerenciar vínculos |
| --- | --- | --- | --- | --- |
| Proprietário (`owner`) | Sim | Sim | Sim | Sim, para outros usuários e sem conceder `owner` |
| Administrador (`admin`) | Sim | Sim | Sim | Não |
| Membro (`member`) | Sim | Não | Sim | Não |
| Leitor (`viewer`) | Sim | Não | Apenas o próprio vínculo | Não |

A atualização de dados da empresa está autorizada no banco, mas não tem formulário específico nesta etapa. Cadastro, seleção e gestão inicial de vínculos têm interface.

RPCs:

- `create_company(name, legal_name)`: exige usuário confirmado; cria **sempre um novo UUID**, associa o chamador como proprietário e seleciona a empresa na mesma transação. Não recebe UUID de empresa existente, ID de proprietário ou papel. Não procura empresas por nome/domínio e não faz upsert de empresa.
- `set_active_company(company_id)`: exige associação atual. Revogar um vínculo limpa a seleção ativa correspondente.
- `add_company_member(company_id,user_id,role)`: somente proprietário, usuário já confirmado e papel `admin/member/viewer`.
- `set_company_member_role(...)`: somente proprietário, sem autopromoção, concessão de `owner` ou alteração do proprietário.
- `remove_company_member(...)`: somente proprietário, sem remoção do proprietário.

O proprietário solicita o UUID exibido em “Minha conta” ao próprio usuário. Não há busca global de usuários por e-mail nem envio de convite. Os formulários são uma conveniência; as RPCs verificam o papel atual no banco, inclusive se chamadas diretamente com o SDK. Metadados/JWT não armazenam a autoridade empresarial. Colunas de propriedade, identidade de vínculo e papéis não têm escrita direta concedida ao cliente. O último proprietário tem proteção adicional por trigger.

Todas as tabelas expostas têm RLS. Não há política `USING (true)` para todos os autenticados. Helpers `SECURITY DEFINER` ficam em schema privado, têm `search_path` fixo e não aceitam o ID do ator; usam `auth.uid()`. Funções públicas são executáveis apenas por `authenticated`, não por `anon`/`PUBLIC`. Nenhum cliente com `service_role` é utilizado.

## Sessão e interface

Rotas públicas: `/conta/entrar`, `/conta/cadastro` e callbacks. `/conta` e `/conta/empresas` verificam o usuário no servidor com `auth.getUser()`, além da autorização no banco. O middleware renova cookies somente nas rotas de conta/retorno de Auth; a demonstração local não depende dele. Não se autoriza usuário com `getSession()` ou conteúdo de cookie não verificado. Cookies usam `SameSite=Lax` e `Secure` na origem HTTPS configurada (desenvolvimento HTTP local fica sem Secure). Rotas de conta são dinâmicas, privadas e sem cache público; links de Auth não propagam referrer.

Após confirmação/login, o usuário cria empresa ou seleciona seus vínculos. A seleção persiste no banco por usuário. A área mostra UUIDs distintos para empresas de nomes iguais. O logout encerra a sessão deste navegador (`scope: local`), não todas as sessões de outros dispositivos.

## Vercel

1. Importe o repositório com o framework **Next.js**, raiz do projeto, instalação `npm ci` e build `npm run build`.
2. Cadastre as três variáveis públicas nas configurações da Vercel, separadas por Development/Preview/Production. Use projeto Supabase de teste para Preview; não reutilize dados reais para testes.
3. `NEXT_PUBLIC_SITE_URL` deve ser a origem HTTPS exata do deploy correspondente. Cadastre essa mesma origem e os redirects no painel Supabase. Para previews, prefira domínios explícitos autorizados em vez de curingas abertos.
4. Faça novo deploy após mudar variáveis. Não configure `service_role`, senha do banco ou `SUPABASE_ACCESS_TOKEN` como variáveis públicas.
5. Aplique as migrations pelo canal administrativo, não durante `next build`. O app usa apenas a chave pública e sessões de usuários.
6. Valide cadastro, e-mail, retorno, login, expiração/refresh, seleção de empresas, autorização e logout no domínio real antes de liberar uso de produção.

## Testes locais reproduzíveis

```sh
npm run test:clients
npm run test:quotes
npm run test:services
npm run test:supabase
npm run test:supabase:config
npm run typecheck
npm run build
npm run test:quotes:browser
npm run test:services:browser
npm run test:supabase:browser
```

Os 15 testes SQL executam **as migrations reais** em PostgreSQL embarcado PGlite e usam papéis distintos `anon`/`authenticated`, com usuários/empresas fictícios. Verificam RLS, UUIDs, nomes iguais, criação atômica, multiempresa, seleção, concessão/revogação, autopromoção, propriedade e grants de funções. O fixture local de `auth.uid()` simula somente a identidade validada; **não testa assinatura JWT, GoTrue, PostgREST, entrega de e-mail nem Supabase hospedado**.

Os cinco testes de configuração rejeitam chaves privilegiadas, URLs/redirects indevidos e identificadores inválidos. O teste de navegador da conta verifica branding, controles públicos, rotas anônimas protegidas, cookies falsos, callback sem open redirect, no-store e 320/390 px. **Ele não faz login real nem valida sessão autenticada.** Os testes existentes exercitam a preservação de Orçamentos/Serviços e PDFs. Os scripts de navegador precisam de Chromium/Playwright e, para PDFs, Poppler.

## Validação em projeto Supabase real — obrigatória antes de produção

Configure as variáveis do app, aplique as migrations e use contas próprias de teste, sem dados empresariais reais.

1. Cadastre três contas de teste por `/conta/cadastro`. Confira a entrega dos e-mails e confirme cada conta pelos links reais. Antes da confirmação, o cadastro de empresa deve ser negado.
2. Entre, crie uma empresa fictícia e verifique seu vínculo de proprietário. Crie outra empresa com o mesmo nome por outro usuário: os UUIDs devem ser diferentes e nenhum acesso deve ser herdado pelo nome.
3. Associe um usuário confirmado pelo UUID. Valide participação em duas empresas, seleção ativa, persistência após reload/logout/login e papéis diferentes em cada vínculo.
4. Tente promoções e escrita direta com um usuário comum e com um administrador, inclusive usando o SDK fora da interface. Valide negação pelo banco. Remova o acesso e confirme bloqueio na próxima requisição.
5. Valide cookies SSR no domínio real, retorno de confirmação no mesmo/outro navegador (conforme template), renovação após expiração e logout. Use TTL reduzido apenas no projeto de teste para verificar refresh; restaure a configuração adequada depois.
6. Confirme que os registros locais antigos permanecem intactos e não aparecem como dados protegidos da empresa Supabase.

Há um script opcional de integração real para contas já confirmadas:

```sh
npm run test:supabase:remote
```

Além das variáveis públicas, ele requer `SUPABASE_TEST_OWNER_EMAIL`, `SUPABASE_TEST_OWNER_PASSWORD`, `SUPABASE_TEST_MEMBER_EMAIL`, `SUPABASE_TEST_MEMBER_PASSWORD`, `SUPABASE_TEST_OUTSIDER_EMAIL` e `SUPABASE_TEST_OUTSIDER_PASSWORD`, configuradas somente em ambiente seguro de testes. Nunca forneça senhas no chat nem as versione. O script não aceita chave privilegiada e não imprime tokens/senhas/e-mails. Sem pré-requisitos, termina com código 2 e “NÃO EXECUTADO”, sem simular aprovação.

O teste remoto cria duas empresas fictícias `QA Orvelium ...` e associações para verificar login, RLS, RPCs e papéis. Ele informa os UUIDs para inspeção/limpeza administrativa posterior; não apaga contas nem empresas automaticamente. Use um projeto dedicado e usuários distintos. **Esse script ainda não substitui os passos manuais de cadastro/confirmação, cookies SSR, refresh e deploy.** Registre os resultados do roteiro completo antes de declarar prontidão de produção.
