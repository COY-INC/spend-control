# Múltiplas categorias por transação + filtro múltiplo — Design

Data: 2026-09-07 · Branch: `feat/multi-categoria`

## Problema

Hoje cada transação tem uma única "Minha categoria" (`userCategory`). O usuário
quer:

1. Registrar **quantas categorias quiser** por transação (ex.: Uber **e** Viagem).
2. Filtrar por **múltiplas categorias** ao mesmo tempo.

A categoria automática da Pluggy (`category`) continua única e read-only.

## Decisões (resolvidas com o usuário)

- **Agregação:** a **1ª categoria da lista = principal**. Ela conta 100% do valor
  nas agregações (donut de gastos, `BudgetCard`, gasto por categoria no Resumo).
  As demais são tags só para exibir/filtrar. Não infla totais (single-count).
- **Filtro múltiplo:** semântica **OU** — a transação aparece se tiver **pelo menos
  uma** das categorias selecionadas.

## Modelo de dados

`backend/prisma/schema.prisma`:

```
- userCategory  String?
+ userCategories String[]   // ordem importa: [0] = principal; [] = herda a Pluggy
```

Array escalar nativo do Postgres (Prisma scalar list). Migração converte o valor
único existente:

```sql
ALTER TABLE "Transaction" ADD COLUMN "userCategories" TEXT[] NOT NULL DEFAULT '{}';
UPDATE "Transaction" SET "userCategories" = ARRAY["userCategory"] WHERE "userCategory" IS NOT NULL;
ALTER TABLE "Transaction" DROP COLUMN "userCategory";
```

Mantém a abordagem atual: categoria mora na própria linha da transação e propaga
pro grupo de parcelas via `updateMany` (não é tabela de identidade — igual hoje).

## Regras (`frontend/src/api.ts`)

- `Transaction.userCategory?: string | null` → `userCategories: string[]`.
- `effectiveCategory(t)` = `t.userCategories[0] || t.category` (principal — mantém
  as 3 agregações single-count, sem mudança nelas).
- **Nova** `effectiveCategories(t): string[]` = `t.userCategories.length ?
  t.userCategories : [t.category]` (lista completa — exibição e filtro).
- `TxFilter`: `categoria: string` → `categorias: string[]`. `EMPTY_FILTER` idem.
- `applyTxFilters`: se `f.categorias?.length`, mantém a tx quando
  `effectiveCategories(t)` **intersecta** `f.categorias` (OU). Leitura tolerante
  (`f.categorias ?? []`) para não quebrar com filtro persistido do shape antigo.
- `overviewFilter(f)` zera `categorias` (`[]`), como já faz com `categoria`.

## Persistência do filtro

Filtro é salvo em `localStorage` (`fin-dash-filter-couple` / `-my`) via
`usePersistedState`. Bump das duas chaves (sufixo `-v2`) para descartar o shape
antigo (`categoria: string`) sem código de migração.

## Backend (`PATCH /transactions/:id`)

- Aceita `userCategories: string[]` no body. Normaliza: `trim`, descarta vazios,
  dedupe preservando ordem. `[]` = herda Pluggy.
- Propaga pro grupo de parcelas via `updateMany` (mesma lógica/tolerância atual).
- `description` segue igual.
- `api.updateTransaction` passa `userCategories` no lugar de `userCategory`.

## UI — componente novo `CategoryMultiSelect`

`frontend/src/components/CategoryMultiSelect.tsx`. Disclosure nativo
(`<details>/<summary>`), sem dependência nova nem primitivo de popover:

- `<summary>`: chips das categorias selecionadas (a 1ª com selo "principal" quando
  `showPrimary`); placeholder quando vazio.
- Corpo: lista de checkboxes com as `CATEGORIES`. Marcar **anexa** ao fim; desmarcar
  remove — assim a ordem (e a principal) reflete a ordem de seleção.
- Props: `selected: string[]`, `onChange: (next: string[]) => void`,
  `showPrimary?: boolean`, `placeholder?: string`.

Reúso:

- **`TransactionsTable`** (coluna "Minha categoria"): `selected={t.userCategories}`,
  `showPrimary`, `onChange` → `onCategoryChange(t.id, next)` (assinatura passa a
  `(id, categories: string[])`). Otimista + persiste via `updateTransaction`.
- **`TransactionFilters`** (categoria): `selected={filter.categorias}`,
  `onChange` → `set({ categorias })`. Sem selo principal.

Escopo mantido: edição de categoria continua **desktop-only** (colunas já são
`hidden md:table-cell`); não há tela mobile de edição hoje.

## Teste

`frontend/src/applyTxFilters.test.ts` (node:assert, `npx tsx`):

- `effectiveCategory`: usa `userCategories[0]`; cai na Pluggy quando `[]`.
- `effectiveCategories`: retorna a lista; `[category]` quando `[]`.
- `applyTxFilters` com `categorias`: nenhuma selecionada (passa tudo), uma
  (interseção), várias (OU), e tx que não intersecta (filtrada).

## Arquivos tocados

Backend: `schema.prisma`, nova migration, `transaction.controller.ts`.
Frontend: `api.ts`, `CategoryMultiSelect.tsx` (novo), `TransactionsTable.tsx`,
`TransactionFilters.tsx`, `DashboardContext.tsx` (bump das chaves),
`applyTxFilters.test.ts`. Callers de `effectiveCategory` **não mudam**.
