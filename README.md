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
- Navegação responsiva com módulos previstos de financeiro, clientes, estoque, orçamentos, serviços, funcionários e RDO.
- Componentes compartilhados de marca, indicadores e apresentação de módulos.
- Fontes Manrope e DM Sans servidas localmente, sem dependência do Google Fonts em execução.

Todos os nomes, valores e atividades são fictícios. O cadastro permanece apenas na memória da página e é descartado ao recarregar; os indicadores são exemplos fixos, inclusive ao trocar de empresa. Os módulos previstos não executam operações reais. Não há backend, pagamentos, IA ou integrações externas. Nenhuma senha é armazenada.
