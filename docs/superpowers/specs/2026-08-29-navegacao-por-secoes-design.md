# Redesign de navegação: dashboard em seções

**Data:** 2026-08-29
**Status:** aprovado (design), pendente de plano de implementação

## Problema

Hoje o app tem duas views (`Finanças do Casal`, `Minhas Finanças`) selecionadas
por uma sidebar, e cada view é **uma rolagem vertical longa** com ~10 blocos de
cards empilhados, terminando numa tabela de transações. Tudo compete por atenção
na mesma tela; não há hierarquia nem fluxo de navegação. O usuário quer uma
organização com sequência lógica entre telas, com UX natural.

## Decisões (definidas no brainstorming)

1. **Eixo de navegação:** seções por assunto viram a navegação principal.
   `Casal / Minhas` deixa de ser o topo e vira um **escopo global** (filtro
   presente em todas as telas).
2. **Seções (6):** Resumo · Patrimônio · Investimentos · Cartões · Gastos ·
   Transações.
3. **Mobile:** bottom tab bar estilo app (não o drawer atual).
4. **Faseamento:** Fase 1 = estrutura de navegação + tela Resumo. Fase 2 =
   polimento visual (skill `frontend-design`). Este spec cobre a Fase 1.

## Arquitetura

### Roteamento

Usar `react-router-dom` (já instalado; `App.tsx` já usa `useNavigate`). Cada
seção é uma rota real:

- `/resumo` (default / landing)
- `/patrimonio`
- `/investimentos`
- `/cartoes`
- `/gastos`
- `/transacoes`

Benefício: URL compartilhável, botão voltar do navegador funciona, deep-link.

O `login` continua fora do shell autenticado.

### Shell de layout

Um componente de layout (`AppShell`) que envolve as rotas e contém:

- **Desktop (`md+`):** sidebar lateral com as 6 seções (reaproveita o padrão
  visual do `Sidebar.tsx` atual, trocando os 2 itens pelas 6 seções + rotas).
- **Mobile (`<md`):** bottom tab bar fixa com 5 alvos:
  `Resumo · Cartões · Gastos · Transações · Mais`. "Mais" abre um menu/sheet com
  `Patrimônio` e `Investimentos` (as duas seções que não cabem na barra).
- **Header global** (topo do conteúdo, todas as telas): seletor de escopo
  `Casal ▾ / Minhas`, seletor de mês (`MonthYearPicker`), filtro de banco
  (`TransactionFilters` ou parte dele), e `ThemeToggle`. `DueRemindersBanner`
  aparece no topo do conteúdo (ou só no Resumo — ver "Questões em aberto").

### Estado global (escopo, mês, banco)

Hoje esse estado vive dentro de `CoupleFinances`/`MyFinances` e é duplicado. Com
o header global, ele precisa ser compartilhado entre o header e as seções.

- Escopo `Casal | Minhas` + `userId` (quando Minhas): elevado para o shell.
- Mês (`ym`) e filtro (`TxFilter`, incluindo banco): elevados para o shell, via
  Context ou props drilling a partir do `AppShell`.
- Persistência: manter o padrão `usePersistedState` já existente (chaves
  `fin-dash-filter-*`). Uma chave por escopo para não misturar filtros
  Casal/Minhas.

**Abordagem recomendada:** um `DashboardContext` (React Context) exposto pelo
`AppShell` com `{ scope, userId, ym, filter, setters, banks }`. As seções
consomem via hook `useDashboard()`. Evita prop drilling por 6 telas e mantém as
seções focadas em render.

### Seções (reagrupamento — componentes já existem)

Nenhum componente novo de dado; é realocação. Componentes atuais por seção:

| Seção | Componentes |
|-------|-------------|
| **Resumo** | novo: tiles-resumo (ver abaixo) + `DueRemindersBanner` |
| **Patrimônio** | cards de saldo por conta/pessoa (hoje inline em CoupleFinances/MyFinances), `ReservedBalanceCard`, `ConnectionsStatus` |
| **Investimentos** | `InvestmentsCard` |
| **Cartões** | `CreditCardInvoicesCard`, `FutureCommitmentsCard`, `PaymentMethodSplitCard` |
| **Gastos** | `MonthFlowCard`, `ExpensesDonut`, `IncomeExpenseBar`, `BudgetCard`, `SubscriptionsCard` |
| **Transações** | `TransactionsTable` + `TransactionFilters` (filtros detalhados) |

Os cards de saldo por conta/pessoa hoje são JSX inline dentro de
`CoupleFinances`/`MyFinances`; serão extraídos para um componente reutilizável
(`BalanceSummaryCards` ou similar) usado na seção Patrimônio.

### Tela Resumo (única tela genuinamente nova)

Curada: uma linha de alertas + tiles de KPI, cada tile clicável levando à seção
de origem. Dados já existem nos endpoints atuais; o Resumo apenas seleciona 1
número-chave de cada área.

Layout (grid responsivo, 1 col mobile / 2 col desktop):

- **Alertas** (topo, só renderiza se houver): `DueRemindersBanner` — faturas a
  vencer/vencidas.
- **Patrimônio líquido** → `/patrimonio` — saldo consolidado + investimentos.
- **Fluxo do mês** → `/gastos` — entradas − saídas (net) com micro-barra.
- **Faturas em aberto** → `/cartoes` — total aberto + nº de cartões.
- **Comprometido (parcelas)** → `/cartoes` — total de parcelas futuras.
- **Gasto vs orçamento** → `/gastos` — % do orçamento consumido no mês.

Cada tile: rótulo, número grande (`tabular-nums`), sub-linha de contexto, área
inteira clicável (`role="button"` + navegação). Reaproveita o padrão visual do
`Card`.

## Fluxo de dados

Sem mudança de API. As seções chamam os mesmos endpoints (`api.*`) que hoje. O
escopo/mês/banco do context definem os parâmetros (`userId`, período, filtro de
banco) — exatamente como `CoupleFinances`/`MyFinances` já fazem, só que a fonte
do estado passa a ser o context em vez de state local.

Os tiles do Resumo derivam de dados já carregados: patrimônio (accounts +
investments), fluxo (transactions do mês), faturas (`api.cards`), parcelas
(`api.commitments`), orçamento (`api.budgets` + transactions). Para evitar
recarregar tudo no Resumo, os fetches podem viver no context (accounts,
investments, transactions do mês) e ser compartilhados entre Resumo e seções.

## Tratamento de erro

Manter o padrão atual (`.catch(console.error)` nos fetches; wrapper `apiFetch`
já trata 401 → login). Estados de carregando/vazio por seção seguem o que os
componentes já fazem (ex.: cards que retornam `null` quando sem dados). Sem
mudança de estratégia nesta fase.

## Fora de escopo (Fase 2 — polimento visual)

- Tipografia, escala tipográfica, densidade e espaçamento.
- Hierarquia visual dos tiles do Resumo (tamanhos, cor, destaque do número
  principal).
- Micro-interações / transições entre rotas.
- Revisão de acessibilidade com `web-design-guidelines`.

## Fora de escopo (geral)

- Sem testes automatizados (pedido explícito do usuário).
- Sem mudança de backend / endpoints.
- Sem novas features de dado (só reorganização + tela Resumo derivada).

## Questões em aberto (resolver na implementação, default indicado)

1. **`DueRemindersBanner`:** só no Resumo, ou global no topo de todas as telas?
   *Default:* só no Resumo (evita repetir alerta em toda navegação).
2. **Filtro de banco no header global vs. só em Transações:** o filtro completo
   (`TransactionFilters` tem tipo/categoria/internos) é pesado pro header.
   *Default:* header global carrega só escopo + mês + banco; o filtro detalhado
   (categoria/tipo/internos) fica na seção Transações.
3. **"Mais" no mobile:** sheet/bottom-sheet vs. página-índice.
   *Default:* bottom-sheet com os 2 itens (Patrimônio, Investimentos).
