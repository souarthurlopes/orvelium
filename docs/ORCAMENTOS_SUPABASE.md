# Orçamentos no Supabase — integração incremental

Estado em 04/11/2026: o responsável informou a aplicação manual da migration de Orçamentos e apresentou a auditoria com 12 OK; o item de funções foi esclarecido pela coincidência exata dos sete tamanhos/hashes após conversão CRLF/LF. Não reaplicar nem alterar migrations. O código aguarda autorização para commit, push e publicação. Auth/empresas e Clientes já foram testados manualmente pelo responsável; o CRUD hospedado de Orçamentos ainda não foi validado. O procedimento de primeira aplicação abaixo permanece como referência para instalações novas.

## Comportamento preservado

O painel `/painel?modulo=orcamentos` usa exclusivamente clientes e propostas remotos da empresa UUID ativa. Server Actions verificam usuário confirmado, vínculo e seleção ativa a cada operação, inclusive para bloquear uma aba antiga após trocar de empresa. A demonstração `/demo` continua local; nenhum cadastro ou proposta é importado automaticamente. Serviços/OS continuam locais na demonstração, sem converter orçamentos remotos em documentos locais.

A interface mantém busca/filtros, criação, edição, duplicação como novo rascunho, exclusão confirmada, PDF A4 e mensagem WhatsApp para revisão. O status é um registro manual: não há envio, aceite externo, cobrança ou assinatura. PDF remoto não apresenta dados como demonstrativos; PDFs e mensagens da demonstração mantêm seus avisos. O PDF usa somente os dados conhecidos da empresa/cliente; não inventa endereço, CNPJ ou outras informações do emitente.

- Numeração sequencial por empresa UUID, sem reaproveitamento após exclusão.
- Revisão otimista: salvar/excluir exige a revisão atual, impedindo sobrescrever uma edição já confirmada em outra sessão.
- Rascunhos ainda não emitidos exigem cliente existente da empresa e atualizam a cópia do cadastro ao salvar.
- A primeira saída de Rascunho fixa `issued_at` e os dados históricos do cliente. Voltar a Rascunho não apaga a emissão nem libera trocar de cliente.
- Propostas emitidas preservam o cliente histórico mesmo após editar/excluir seu cadastro. Para trocar de cliente, duplique a proposta e escolha um cadastro existente.
- Duplicar cria novo UUID, novo número, revisão 1 e estado Rascunho. Não há arquivo de todas as versões anteriores de uma proposta editada.
- A cópia do nome do emitente também é preservada desde a criação da proposta.
- A expiração visual de Enviado usa a data em `America/Sao_Paulo`, com validade inclusiva. Marcar manualmente Vencido exige validade anterior ao dia atual também no banco.

A lista é paginada no adaptador para superar o limite de resposta do PostgREST. Falhas não carregam dados locais como alternativa. Reload, botão Atualizar lista e retorno à aba recarregam os dados; não há Realtime nesta etapa.

## Estrutura e autorização

A migration `20261104000100_quotes.sql` cria:

- `public.quotes`: proposta, itens em JSONB, valores inteiros, revisão e snapshots, gravados na mesma transação.
- `private.quote_counters`: contador protegido por empresa, sem acesso pelos papéis da API.
- Helpers privados de validação/autorização e captura do cliente.
- RPCs `create_quote`, `update_quote` e `remove_quote`, com `SECURITY DEFINER` e `search_path` vazio.
- RLS e índices de consulta/unicidade. Não altera tabelas, políticas ou migrations anteriores.

| Papel na empresa | Ler/PDF | Criar/editar/duplicar | Excluir |
| --- | --- | --- | --- |
| Proprietário/Administrador | Sim | Sim | Sim |
| Membro | Sim | Sim | Não |
| Leitor | Sim | Não | Não |
| Sem vínculo, anônimo ou e-mail não confirmado | Não | Não | Não |

`authenticated` possui somente SELECT direto na tabela. Toda escrita passa pelas RPCs: os clientes não podem atribuir empresa, número, revisão, snapshots, autoria ou timestamps diretamente. As RPCs derivam o ator de `auth.uid()` e bloqueiam o vínculo durante a operação; alterações/revogação de papel são serializadas com essas gravações. Um usuário com vínculos em várias empresas pode ler pela API as empresas em que possui acesso; a seleção ativa é verificada adicionalmente pela aplicação, sem ser tratada como prova de autorização.

O contador é alocado com INSERT/ON CONFLICT na própria transação. A constraint única `(company_id, number)` é uma defesa adicional. A linha da proposta é bloqueada em edição/exclusão antes de conferir a revisão. O cliente do rascunho é consultado e bloqueado por UUID **e** empresa, para não capturar um cadastro de outra empresa ou perder o cliente durante a gravação.

`client_id` é um UUID histórico deliberadamente sem FK para `clients`: uma FK com exclusão em cascata apagaria propostas e uma FK RESTRICT impediria excluir clientes já usados, contrariando o comportamento existente. A criação/edição não emitida é autorizada e validada pela RPC; não existe escrita direta concedida para burlar esse vínculo. `company_id` possui FK RESTRICT, impedindo excluir administrativamente uma empresa enquanto tiver propostas. A futura exclusão administrativa do autor pode tornar `created_by` nulo, sem apagar a proposta.

A validação SQL independente do navegador exige de 1 a 100 itens, IDs de itens únicos, datas reais, textos com limites e valores inteiros. Quantidade usa milésimos, preço usa centavos e percentual usa pontos-base. O banco calcula com `numeric` exato e arredondamento de metade para cima por item e por desconto percentual; subtotal máximo de 1 trilhão de centavos. Valores derivados e snapshots enviados pelo navegador não são aceitos como autoridade. O adaptador confere novamente se os totais recebidos correspondem aos itens antes de exibi-los.

## Inspeção prévia — somente leitura

### Ordem operacional para o Supabase hospedado (revisão de 04/11/2026)

Execute cada arquivo em uma consulta separada no **SQL Editor**, no projeto correto, como administrador. Os arquivos de auditoria são SELECTs sobre catálogos: não chamam RPCs de negócio, não criam cadastros e não alteram dados. Não cole scripts de testes Node/PGlite no SQL Editor.

1. **Antes de qualquer DDL**, execute o conteúdo completo de [`preflight-orcamentos.sql`](preflight-orcamentos.sql). Ele inventaria dependências e todos os nomes novos, incluindo sobrecargas de funções, índices e conflitos de tipos.
   - `CANDIDATA A PRIMEIRA APLICAÇÃO`: nenhum objeto novo existe. Isso permite prosseguir com a revisão; não certifica sozinho que as dependências têm as definições corretas.
   - `OBJETOS PRESENTES`: **não execute a migration**. Pule para a auditoria de Orçamentos, passo 4. A presença de nomes não comprova uma instalação íntegra.
   - `ESTADO PARCIAL/CONFLITO` ou dependência ausente: **pare**. Guarde o resultado e inspecione as definições. Não use DROP, RESET, IF NOT EXISTS ou reaplicação para corrigir automaticamente.
2. Confirme que as três migrations anteriores foram aplicadas e preservadas. Execute o conteúdo completo de [`auditoria-clientes.sql`](auditoria-clientes.sql) para conferir o contrato de Clientes e as permissões reutilizadas. As duas migrations iniciais devem continuar fornecendo empresas, vínculos UUID, preferências, enum e helpers descritos abaixo. Qualquer `REVISAR` exige análise: diferenças de apresentação entre versões do PostgreSQL não justificam recriar objetos. Os resultados manuais anteriores são evidência histórica, não uma leitura atual do projeto hospedado.
3. **Somente se for primeira aplicação, as dependências estiverem corretas e houver autorização para alterar o banco:** execute o conteúdo **integral e sem modificações** de [`20261104000100_quotes.sql`](../supabase/migrations/20261104000100_quotes.sql), de `begin;` até `commit;`, uma única vez. Não execute as três migrations anteriores. Não execute apenas o trecho selecionado no editor. A confirmação esperada é sucesso sem linhas retornadas; ela sozinha não comprova a configuração final.
4. Execute o conteúdo completo de [`auditoria-orcamentos.sql`](auditoria-orcamentos.sql). São **13 linhas**, todas devem resultar `OK`: tabelas/RLS, colunas/defaults, constraints/FKs, índices, políticas, sete funções/corpos, trigger, privilégios de tabela/coluna/EXECUTE/PUBLIC, proprietários/bypass e schema/helper de timestamp. `REVISAR` significa inspecionar antes de ativar; não significa reaplicar. A comparação de definições é conservadora e diferenças de formatação, versão ou search_path da sessão podem pedir revisão manual. NOT NULL do PostgreSQL 18 é conferido pelas colunas, sem confundir suas constraints adicionais com objetos inesperados.
5. Guarde os resultados e identifique o projeto, data e migration aplicada. Aplicação pelo SQL Editor pode **não** inserir uma linha em `supabase_migrations.schema_migrations`. A ausência nesse histórico não autoriza reaplicar. **O inventário de objetos mais a auditoria integral** identificam o estado instalado. Não use `supabase db push` para reconciliar automaticamente este histórico manual.
6. Depois dos resultados aprovados, a ativação na interface exige uma versão da aplicação que contenha a integração de Orçamentos. Estas alterações permanecem no workspace; commit, push e publicação ficam fora desta preparação. Após autorização e publicação, testar com contas comuns pelo domínio público: CRUD, logout/login, outro dispositivo, troca de empresa, cada papel, cliente de outra empresa, revisão obsoleta e PDFs. Não considerar produção validada pelo SQL Editor administrativo, que pode ignorar RLS.

Se houver erro na migration, guarde a mensagem e execute novamente **o preflight**, não a migration. O arquivo é transacional; no caminho normal um erro impede o commit. Se a sessão permanecer em transação abortada, use `ROLLBACK;` para encerrar essa transação falha antes da inspeção; isso não desfaz um commit já concluído. Execução parcial/selecionada ou uma instalação preexistente exige diagnóstico específico. Se houver espera por locks, não mate sessões nem modifique tabelas para forçar a instalação.

### Resultado da revisão técnica

Arquivo revisado sem alteração nesta preparação: `supabase/migrations/20261104000100_quotes.sql`. SHA-256: `324756765f6c5783ca1828bd56a7e55f166af3431e25a2091e9c6721a907c746`. Se o conteúdo mudar, refaça a revisão e o contrato da auditoria antes de aplicar.

| Item | Resultado |
| --- | --- |
| `20261030000100_identity_and_companies.sql` | Compatível: fornece `private`, `company_role`, empresas/vínculos, `auth.uid()` do Supabase e `private.touch_updated_at()`. `company_id` referencia a PK UUID existente. A migration nova não redefine esses objetos. |
| `20261030000200_company_operations.sql` | Compatível: preserva seleção de empresa, criação do proprietário, administração de vínculos e proteção do último proprietário. O bloqueio `FOR SHARE` do vínculo nas RPCs novas serializa mudanças de papel/revogação com gravações. |
| `20261103000100_clients.sql` | Compatível: captura somente as colunas existentes de clientes, filtradas por UUID do cliente **e da empresa**, com bloqueio da linha durante captura. Não altera suas políticas, grants, índices ou dados. |
| Dependências adicionais | PostgreSQL/Supabase fornece `auth.users`, `auth.uid()`, `gen_random_uuid()`, JSONB, PL/pgSQL e papéis `anon`/`authenticated`. `authenticated` precisa do USAGE em `private` concedido na migration inicial. Execute como administrador/dono confiável, consistente com os helpers anteriores. |
| Índices | PK UUID; unicidade `(company_id,number)`; índices `(company_id,date,id)` e `(company_id,client_id)`; PK do contador por empresa. Os índices de vínculos e clientes anteriores continuam disponíveis para autorização/captura. |
| Constraints | Tipos e NOT NULL, limites inteiros seguros, subtotal/desconto/total coerentes, status, validade, JSONB e snapshots. A validação semântica de itens é adicionalmente obrigatória nas RPCs, único caminho de escrita da API. |
| FKs e histórico | Propostas → empresas `RESTRICT`; autor → `auth.users` `SET NULL`; contador → empresas `CASCADE`. Essa cascata só afeta o contador **novo** em eventual exclusão administrativa futura; não é executada pela migration. Cliente não tem FK deliberadamente para preservar o snapshot após excluir cadastro; RPCs impedem usar cliente de outra empresa. |
| Funções e trigger | Sete funções novas: quatro privadas e três RPCs públicas. Quatro SECURITY DEFINER, todos com search_path vazio; três helpers internos INVOKER sem EXECUTE para API. Um novo trigger BEFORE UPDATE FOR EACH ROW reutiliza o helper de timestamp, sem substituí-lo. Numeração/valores/snapshots são gerados no banco; edição/exclusão exigem revisão atual. |
| RLS e grants | Quatro políticas de propostas; contador com RLS sem políticas e sem grants API. `authenticated` tem apenas SELECT direto em propostas, e EXECUTE nas três RPCs e helper RLS. Sem INSERT/UPDATE/DELETE direto; sem acesso de anon/PUBLIC. Auditoria verifica também privilégios efetivos herdados e por coluna. |
| Ausência de operações destrutivas na aplicação | Sem DROP/TRUNCATE, sem substituição de função anterior, sem UPDATE/DELETE de dados existentes, sem importação e sem alteração de tabelas/RLS de identidade, empresas ou Clientes. Os INSERT/UPDATE/DELETE no corpo das funções são **definições**, executadas futuramente apenas ao chamar as RPCs autorizadas sobre os objetos novos. FKs criam metadados/triggers referenciais e podem adquirir locks breves nas tabelas referenciadas. |

**Limite preciso da empresa ativa:** no servidor `requireCompany()` valida a sessão com `auth.getUser()`, e-mail confirmado, preferências e vínculo atual; cada Server Action compara o UUID recebido com a empresa ativa; o adaptador sempre filtra por esse UUID. **No banco a fronteira é vínculo + papel, não `user_preferences.active_company_id`.** Uma conta vinculada a A e B pode usar diretamente SELECT/RPC para A ou B conforme seu papel, mesmo estando com B selecionada na interface. Isso não libera dados de empresas sem vínculo. A troca da preferência não é atomicamente vinculada à transação da RPC. Se a exigência for bloquear no próprio banco toda empresa não selecionada (inclusive para contas com dois vínculos), será necessária uma decisão e alteração adicional antes da aplicação; a migration atual não promete esse bloqueio. Não alteramos essa política nesta revisão.

Matriz: owner/admin leem, criam, editam e excluem; member lê/cria/edita; viewer apenas lê; anônimo, e-mail não confirmado e usuário sem vínculo não têm acesso. O SQL Editor administrativo não representa esses papéis. Credenciais administrativas não são utilizadas pelo módulo nem incluídas nos scripts.

### Validação desta preparação

A auditoria normaliza exclusivamente quebras de linha CRLF para LF nos corpos das funções antes da comparação integral. O diagnóstico recebido do SQL Editor apresentou os sete tamanhos e hashes idênticos aos corpos locais convertidos para CRLF; esse caso é uma diferença de representação, sem mudança no código SQL. Outros espaços, comandos e atributos continuam sendo comparados. Não é necessário recriar funções ou reaplicar a migration por esse motivo.

`node scripts/test-quotes-audit.cjs` executa exclusivamente em PostgreSQL PGlite temporário: valida preflight antes/depois da instalação e com sobrecarga conflitante; exige 13 OK na instalação íntegra; comprova detecção de RLS desativada, política extra, grant de coluna, grant PUBLIC, EXECUTE interno liberado, corpo de RPC alterado, FK removida, trigger desativado, índice removido e objetos ausentes. O teste compara também o contrato do arquivo SQL com as migrations locais. `--generate` é somente para manutenção local deliberada do contrato, nunca para uso no SQL Editor.

Essas verificações estruturais complementam os 94 testes locais anteriores. Não certificam o schema hospedado nem login/GoTrue, cache do PostgREST ou concorrência entre várias conexões no Supabase real. Se após a instalação aprovada a API informar RPC ausente, confira o projeto e o estado do cache do PostgREST antes de tentar reaplicar DDL; nenhum comando de recarga é executado por estes scripts.

## Testes executáveis e limites

- `npm run test:quotes:supabase`: funções SQL reais, autorização/RLS, snapshots, numeração, rollback, arredondamento, revisões, tentativas de escrita direta, isolamento, revogação, novas instâncias do adaptador e paginação em PostgreSQL temporário PGlite. O transporte SDK e a identidade são simulados, sem testar GoTrue/PostgREST hospedados. PGlite serializa uma única conexão; a prova de concorrência em várias conexões exige validação adicional no projeto de testes.
- `npm run test:quotes:actions`: Server Actions reais com dependências simuladas, conta ausente/expirada, empresa ativa alterada, mensagens seguras e falha de cache após gravação confirmada.
- `npm run test:workspace:browser`: componentes reais com Auth/transporte temporários locais. Inclui Orçamentos remoto, clientes reais da fixture, CRUD, duplicação, confirmação de edição emitida, snapshots após excluir cliente, PDF comercial, permissões visuais, recarga, outro contexto de navegador e 320/390 px. A fixture nunca é uma rota publicada.
- Regressões: `test:clients`, `test:clients:supabase`, `test:clients:actions`, `test:quotes`, `test:services`, `test:supabase`, `test:supabase:config`, `test:auth-boundaries`, `test:supabase:browser`, `test:quotes:browser` e `test:services:browser`.
- `npm run typecheck` e `npm run build`.

Nenhuma migration ou alteração de dados remota deve ser executada sem autorização. Orçamentos não deve ser considerado concluído no deploy antes da revisão/aplicação autorizada da migration e da validação do CRUD, persistência, RPCs e isolamento reais.

## Preparação da publicação — 04/11/2026

Escopo revisado: integração de Orçamentos, tipagem/RPCs, apresentação remota/PDF, testes, auditoria CRLF/LF e documentação. O ajuste no teste SQL de Clientes limita o bootstrap às migrations anteriores à de Clientes; não muda o módulo de Clientes. A mensagem da área de conta e a rota do painel passam a reconhecer Orçamentos remoto. CSS, marcas, fontes, autenticação base, repositórios locais e módulos de Serviços não foram alterados.

Git: branch local `work`, HEAD `fc1ec0ed14b83975713e7040ca9308329fd12d39`; `origin/main` aponta para esse mesmo commit no snapshot local. Não foi consultado o estado remoto atual nesta preparação. O índice está vazio, sem commit/push. Após autorização, atualizar referências remotas, revisar eventuais avanços em main e integrar pelo fluxo seguro, sem force push nem descarte de mudanças de terceiros. A migration de Orçamentos já aplicada manualmente será incluída no histórico Git com seu conteúdo/hash preservado; build e deploy não a executam.

Configuração necessária em Vercel → projeto orvelium → Settings → Environment Variables → **Production**:

| Variável | Conferência esperada |
| --- | --- |
| `NEXTPUBLICSUPABASEURL` | Origem HTTPS do projeto Supabase hospedado informado: `https://inzsswvnifecnnyekoei.supabase.co`. |
| `NEXTPUBLICSUPABASEPUBLISHABLEKEY` | Chave pública publishable (ou anon legada) do mesmo projeto. Nunca service_role/sb_secret. Não copiar valores para relatórios. |
| `NEXTPUBLICSITEURL` | Origem pública estável `https://orvelium.vercel.app`, sem caminho; não usar URL de deployment antigo. |

Não há variável nova para Orçamentos. Next valida as três antes de disponibilizar somente esses valores públicos ao navegador. O SDK do servidor usa cookies do próprio usuário, não chave administrativa. As três variáveis e credenciais de acesso à Vercel estão ausentes no runtime local; não há conector/CLI autorizado do projeto disponível. Logo, a presença/escopo/valores efetivos em Production **não foram confirmados no painel da Vercel**. O build local sem configuração valida compilação e comportamento fechado para conta indisponível; não prova conectividade ao Supabase hospedado. Conferir também se os redirects Supabase já usados pela autenticação correspondem ao domínio estável, sem alterar essa configuração automaticamente.

Riscos/limites remanescentes: autorização do banco é por vínculo e papel; empresa ativa é conferida adicionalmente no servidor (veja limite descrito acima). Listagem usa paginação do adaptador e recarga ao retornar à aba, sem Realtime. Não há arquivo integral de revisões, envio/aceite externo ou conversão de propostas remotas para Serviços locais. Testes PGlite/fixtures não validam GoTrue/PostgREST hospedados nem concorrência em conexões reais. Nenhum teste remoto ou alteração de dados reais foi realizado nesta preparação.

Validação após autorização de publicação:

1. Confirmar no GitHub o hash e os arquivos do commit aprovado em `main`.
2. Conferir na Vercel deployment **Ready**, origem `main`, hash correspondente e domínio Production `orvelium.vercel.app` associado a essa versão. Conferir logs de build/runtime sem registrar tokens ou dados pessoais.
3. Abrir o domínio estável em janela anônima: login exigido para `/painel?modulo=orcamentos`, `/demo` independente e identificado. Não usar links imutáveis de deployments antigos como prova da versão atual.
4. Com conta e dados de teste autorizados, validar criação/consulta/edição/duplicação/exclusão, numeração, cálculo, PDF e revisão obsoleta. Usar cliente real cadastrado na empresa de teste, sem importar dados demonstrativos.
5. Logout/login, recarga e outro dispositivo devem conservar propostas. Trocar entre duas empresas UUID e conferir ausência de mistura, inclusive nomes iguais. Exercitar owner/admin/member/viewer e tentativas de acessar IDs de empresa sem vínculo. Validar sessão expirada e aba antiga após troca de empresa.
6. Só concluir aceitação após esses resultados reais. Esta preparação não autoriza gravações no banco hospedado: operações CRUD de teste e eventual limpeza precisam de autorização específica. Não reaplicar migrations durante publicação ou diagnóstico.
