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
- Navegação responsiva com Clientes funcional e módulos previstos de financeiro, estoque, orçamentos, serviços, funcionários e RDO.
- Componentes compartilhados de marca, indicadores e apresentação de módulos.
- Fontes Manrope e DM Sans servidas localmente, sem dependência do Google Fonts em execução.

Todos os nomes, valores e atividades são fictícios. O cadastro de empresas permanece apenas na memória da página e é descartado ao recarregar; os indicadores são exemplos fixos, inclusive ao trocar de empresa. Os módulos previstos não executam operações reais. Não há backend, pagamentos, IA ou integrações externas. Nenhuma senha é armazenada.

## Módulo Clientes

Cadastro PF/PJ, edição, detalhes e exclusão com confirmação. Pesquisa por nome (sem distinção de acentos), CPF/CNPJ ou telefone; filtros combinados de tipo e situação. Nome e documento são obrigatórios; contato, localização e observações são opcionais. A validação de CPF/CNPJ confere somente formato e quantidade de dígitos para permitir documentos fictícios, sem consulta cadastral.

Os registros usam `localStorage`, na chave versionada `orvelium.clients.v1:<nome-da-empresa-codificado>`, separados por empresa e mantidos após recarregar. Não são criptografados, autenticados ou enviados para um servidor. Use somente dados fictícios; a limpeza do navegador apaga os registros. Os indicadores do dashboard continuam independentes e demonstrativos. Mudanças de outras abas do mesmo navegador recarregam a lista; edições simultâneas do mesmo cliente usam a última gravação. Não há garantia transacional entre abas.

Arquitetura: `lib/clients/types.ts` define o contrato assíncrono `ClientRepository`; `local-repository.ts` implementa o adaptador local com validação, detecção de documentos duplicados e tratamento de erros. A interface recebe o repositório por dependência opcional. Uma futura implementação Supabase poderá substituir o adaptador sem acoplar o componente à API; autenticação, autorização, isolamento por ID de empresa, migração e regras no banco ainda deverão ser implementados.

Execute `npm run test:clients` para os testes do adaptador (CRUD, persistência, isolamento por empresa, duplicidade, validação, corrupção e armazenamento bloqueado/cheio). Não há dependências adicionais de teste. Para verificar o projeto: `npm run typecheck` e `npm run build`.
