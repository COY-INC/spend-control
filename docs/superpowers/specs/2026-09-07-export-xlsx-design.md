# Export XLSX — Design

**Data:** 2026-09-07
**Status:** Aprovado (aguardando plano de implementação)

## Objetivo

Exportar os dados da aplicação para um arquivo `.xlsx` único, com **uma folha por
página** do dashboard. O arquivo reflete exatamente o que está na tela (WYSIWYG):
mês selecionado, escopo (Meu/Casal) e filtro de banco ativos.

## Decisões

- **Onde roda:** cliente (navegador). Zero trabalho no backend, zero duplicação da
  lógica de derivação que já vive em `frontend/src/api.ts`.
- **Formato:** `.xlsx` multi-folha via **SheetJS (`xlsx`)** — nova dependência.
  Montar um workbook real à mão não é "algumas linhas"; SheetJS resolve com uma
  chamada por folha (`XLSX.utils.json_to_sheet`).
- **Escopo/período:** WYSIWYG. Cada folha espelha o filtro da sua própria página:
  - Transações → `filter` completo (inclui tipo/categoria locais da página).
  - Resumo / Gastos / Patrimônio / Investimentos → `overviewFilter` (só banco +
    internos), igual aos componentes.
- **Fatura "atual" do cartão (ponto #3 do usuário):** já resolvido em
  `backend/src/modules/cards/openInvoice.ts`. A folha Cartões usa
  `closedInvoice ?? openInvoice` por cartão (fechada-não-vencida tem precedência
  sobre a aberta).
- **Números ficam numéricos** (não string `brl`), pra o Excel tratar como valor
  somável. Sem estilização de célula.

## Arquitetura

Novo módulo `frontend/src/lib/export.ts`:

- `buildSheets(data): Record<SheetName, Row[]>` — **puro e testável**. Reusa
  `expenseValue`, `incomeValue`, `effectiveCategory`, `signedBalance`,
  `applyTxFilters`, `overviewFilter` de `api.ts`. Não toca em `XLSX` nem no DOM.
- `exportWorkbook(data): void` — wrapper fino: `json_to_sheet` por folha →
  `XLSX.writeFile` com nome `financas-YYYY-MM[-meu|-casal].xlsx`.

Botão **"Exportar"** em `GlobalHeader`, junto dos controles de período/escopo. O
handler junta o que `DashboardContext` já tem (`accounts, investments,
transactions, filter, scope, userId, ym`) e busca o restante com o **mesmo escopo
das páginas** (`scope === "my" ? userId : undefined`): `cards, commitments,
reserved, budgets, subscriptions`.

`data` passado a `buildSheets` é um objeto com todos esses conjuntos já resolvidos
+ `filter`, `scope`, `ym`.

## As 6 folhas

1. **Resumo** — linhas rotuladas (KPI): Patrimônio líquido; Fluxo do mês
   (entradas, saídas, líquido); Faturas em aberto; Comprometido em parcelas;
   Gasto vs orçamento (gasto, limite, %). Depois, breakdown por banco (banco, valor).
2. **Patrimônio** — total; linhas por usuário; uma linha por conta (banco, conta,
   tipo, saldo assinado); reservas ("caixinhas": banco, nome, valor).
3. **Investimentos** — uma linha por posição (instituição, nome, tipo, saldo,
   titular).
4. **Cartões** — por cartão: linha de cabeçalho (banco, cartão, **fatura atual**,
   vencimento) seguida das linhas de item (data, descrição, valor, categoria,
   nota, antecipada); linha em branco entre cartões.
5. **Gastos** — uma linha por categoria (categoria, valor, % do total); totais de
   entrada/saída; depois assinaturas (label, valor mensal, ocorrências, banco).
6. **Transações** — lista plana: data, banco, conta, descrição, valor, categoria
   efetiva, nota, tipo (entrada/saída/interna).

## Teste

Um teste assert sobre `buildSheets` (função pura):

- Cartões escolhe `closedInvoice` quando existe, senão `openInvoice`.
- Transações tem o sinal correto do valor.
- Gastos: soma das categorias == total de saídas.

## Fora de escopo (adicionar quando surgir a necessidade)

- Endpoint no backend / URL compartilhável / export agendado (cron).
- Estilização, cores, branding das células.
- Folhas de histórico/futuro completo do cartão (a folha Cartões mostra só a fatura atual).
