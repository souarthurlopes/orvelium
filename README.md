# Orvelium One

Primeira interface demonstrativa de um SaaS de gestão empresarial, construída de forma independente com Next.js, TypeScript e Tailwind CSS. Trilha foi consultado exclusivamente como referência de linguagem visual (tons neutros, tipografia e organização em cartões), sem reutilização de código, navegação ou regras de negócio.

## Desenvolvimento

Requer Node.js 22 ou 24 e npm. Execute na raiz do repositório:

```sh
npm ci
npm run dev
```

Verificações: `npm run typecheck` e `npm run build`. Para executar o build: `npm start`.

## Escopo

- Dashboard inicial com indicadores, comparativo mensal, fluxo financeiro e distribuição de serviços.
- Busca e filtro de movimentações fictícias.
- Cadastro demonstrativo de empresas com validação de campos e troca de empresa na sessão.
- Login demonstrativo acessível pelo perfil na base da navegação, sem autenticação ou envio de credenciais.
- Navegação responsiva com Clientes funcional e Orçamentos integrado e módulos previstos de financeiro, estoque, serviços, funcionários e RDO.
- Componentes compartilhados de marca, indicadores e apresentação de módulos.
- Fontes Manrope e DM Sans servidas localmente, sem dependência do Google Fonts em execução.

Todos os nomes, valores e atividades são fictícios. O cadastro de empresas permanece apenas na memória da página e é descartado ao recarregar; os indicadores são exemplos fixos, inclusive ao trocar de empresa. Os módulos previstos não executam operações reais. Não há backend, pagamentos, IA ou integrações externas. Nenhuma senha é armazenada.

## Módulo Clientes

Cadastro PF/PJ, edição, detalhes e exclusão com confirmação. Pesquisa por nome (sem distinção de acentos), CPF/CNPJ ou telefone; filtros combinados de tipo e situação. Nome e documento são obrigatórios; contato, localização e observações são opcionais. A validação de CPF/CNPJ confere somente formato e quantidade de dígitos para permitir documentos fictícios, sem consulta cadastral.

Os registros usam `localStorage`, na chave versionada `orvelium.clients.v1:<nome-da-empresa-codificado>`, separados por empresa e mantidos após recarregar. Não são criptografados, autenticados ou enviados para um servidor. Use somente dados fictícios; a limpeza do navegador apaga os registros. Os indicadores do dashboard continuam independentes e demonstrativos. Mudanças de outras abas do mesmo navegador recarregam a lista; edições simultâneas do mesmo cliente usam a última gravação. Não há garantia transacional entre abas.

Arquitetura: `lib/clients/types.ts` define o contrato assíncrono `ClientRepository`; `local-repository.ts` implementa o adaptador local com validação, detecção de documentos duplicados e tratamento de erros. A interface recebe o repositório por dependência opcional. Uma futura implementação Supabase poderá substituir o adaptador sem acoplar o componente à API; autenticação, autorização, isolamento por ID de empresa, migração e regras no banco ainda deverão ser implementados.

Execute `npm run test:clients` para os testes do adaptador (CRUD, persistência, isolamento por empresa, duplicidade, validação, corrupção e armazenamento bloqueado/cheio). Não há dependências adicionais de teste. Para verificar o projeto: `npm run typecheck` e `npm run build`.

## Módulo Orçamentos

Lista, busca por número/nome histórico do cliente e filtros combinados por cliente, status e intervalo inclusivo da data da proposta. Cadastro com múltiplos itens, edição, duplicação como novo rascunho, detalhes e exclusão confirmada. A numeração é sequencial por empresa e não é reaproveitada após exclusões. Produtos/serviços são descrições livres, sem integração com estoque ou serviços nesta etapa.

Valores monetários são inteiros em centavos; quantidades são inteiros em milésimos e descontos percentuais usam pontos-base. O cálculo usa BigInt para arredondar cada subtotal e o desconto percentual pelo método de metade para cima. Campos de valores aceitam vírgula ou ponto decimal, sem separador de milhar. Até 100 itens, 3 casas de quantidade e 2 casas para preço/percentual. Subtotal máximo de 1 trilhão de centavos.

`lib/quotes/types.ts` contém contratos e cálculos; `local-repository.ts` implementa `QuoteRepository`. O adaptador consulta o repositório existente de Clientes, guarda o identificador original e uma cópia dos dados essenciais, sem criar novos clientes. Uma proposta é considerada emitida ao sair pela primeira vez de Rascunho. A partir daí, os dados históricos do cliente e seu vínculo ficam preservados mesmo que o cadastro seja alterado/excluído ou o status volte a Rascunho. Em rascunhos não emitidos, salvar atualiza a cópia a partir do cadastro atual e exige um cliente existente. Duplicar exige escolher um cliente existente se o original foi excluído. Editar uma proposta já emitida exige confirmação; não há arquivo de revisões.

Status são registros manuais: Rascunho, Enviado, Aprovado, Recusado e Vencido. Enviados cuja validade já passou aparecem automaticamente como Vencido, usando o dia em America/Sao_Paulo. A validade inclui o próprio dia. Aprovados/Recusados não vencem automaticamente. Nada é enviado ou aprovado por terceiros.

Dados locais usam `orvelium.quotes.v1:<empresa-codificada>` com versão, contador e revisão. Há detecção de edições obsoletas e, em navegadores com Web Locks, serialização das gravações entre abas. Sem Web Locks, gravações concorrentes podem se sobrepor: esta versão não substitui transações de banco. A chave de empresa ainda usa o nome demonstrativo, sem autenticação, RLS ou sincronização remota. Uma futura integração Supabase precisará de IDs estáveis de empresa, permissões, constraints e transações. Limpar o armazenamento remove cadastros e propostas. Dados inválidos são preservados e bloqueiam gravações.

`lib/quotes/pdf.ts` gera um PDF A4 real, paginado, com logo vetorial, fontes Manrope incorporadas, itens, totais, cliente histórico, nome da empresa e os demais campos disponíveis. As TTF em `public/fonts` foram instanciadas em pesos 400/700 a partir da fonte Manrope local; a licença OFL está incluída. O cadastro demonstrativo de empresas só retém seu nome, portanto CNPJ/endereço do emitente não são inventados. PDF de rascunho é identificado como tal. Arquivos são gerados no navegador com jsPDF/AutoTable, sem serviço externo.

O botão WhatsApp abre `wa.me` com um resumo de texto para revisão. Não envia automaticamente, não anexa arquivo e não inventa link público para dados locais. Baixe e anexe manualmente o PDF se desejar compartilhar. Não existe aceite eletrônico, cobrança, autenticação ou armazenamento do PDF no servidor.

### Testes de Orçamentos

- `npm run test:quotes`: 12 testes de regras, centavos/arredondamento, CRUD, duplicação, numeração, validade, persistência, isolamento por empresa, snapshots, exclusão do cliente, revisões, armazenamento inválido/cheio e mensagem WhatsApp.
- `npm run test:clients`: regressão do repositório de Clientes.
- `npm run typecheck` e `npm run build`.
- Após o build, `npm run test:quotes:browser`: testes reais no Chromium de formulários, integração com Clientes, filtros, confirmações, persistência, telas 320/390 px, download e conteúdo de PDFs A4 curtos e longos (70 itens). Requer Chromium (`npx playwright install chromium` ou `CHROMIUM_PATH`) e utilitários Poppler `pdfinfo`, `pdftotext`, `pdffonts`. Usa um contexto de navegador novo e dados fictícios. `QUOTE_TEST_PORT` muda a porta 3003; `QUOTE_TEST_OUTPUT` muda a pasta de artefatos (padrão: diretório temporário `orvelium-quotes-qa`).
