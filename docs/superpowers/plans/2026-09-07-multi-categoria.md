# Múltiplas categorias por transação + filtro múltiplo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir registrar N "Minha categoria" por transação (1ª = principal) e filtrar por múltiplas categorias (OU).

**Architecture:** `Transaction.userCategory: String?` vira `userCategories: String[]` (array escalar nativo do Postgres). `effectiveCategory` = `userCategories[0]` mantém as agregações single-count intactas; nova `effectiveCategories` alimenta exibição e filtro. UI com disclosure nativo (`<details>`), sem dependência nova.

**Tech Stack:** Node + Express + Prisma 5 (Postgres) · React 19 + Tailwind 4 + Vite · testes `node:assert` via `npx tsx`.

## Global Constraints

- Comentários em PT-BR explicando o *porquê* (regra de negócio/gotcha).
- Sem framework de teste: `node:assert` self-executing, rodado com `npx tsx <arquivo>`.
- Nunca `fetch` cru fora de `api.ts`; componentes leem estado de `useDashboard()`.
- Categoria mora na linha da transação e propaga pro grupo de parcelas via `updateMany` (padrão atual — **não** é tabela de identidade).
- Branch + PR, nunca push direto no `master`. Branch já criada: `feat/multi-categoria`.

---

### Task 1: Schema + migração `userCategories`

**Files:**
- Modify: `backend/prisma/schema.prisma:80`
- Create: `backend/prisma/migrations/<timestamp>_user_categories/migration.sql`

**Interfaces:**
- Produces: coluna `Transaction.userCategories TEXT[] NOT NULL DEFAULT '{}'`; coluna `userCategory` removida.

- [ ] **Step 1: Editar o schema**

Em `backend/prisma/schema.prisma`, na model `Transaction`, trocar a linha:

```prisma
  userCategory        String? // categoria definida pelo usuário; se null, herda a da Pluggy
```

por:

```prisma
  userCategories      String[] // categorias do usuário; ordem importa ([0]=principal); [] herda a Pluggy
```

- [ ] **Step 2: Scaffold da migração sem aplicar**

Run (na pasta `backend/`): `npx prisma migrate dev --name user_categories --create-only`
Expected: cria a pasta `migrations/<timestamp>_user_categories/` com um `migration.sql`.

- [ ] **Step 3: Substituir o SQL gerado por um que PRESERVA os dados**

O SQL padrão do Prisma dropa a coluna antiga e perde os dados. Substituir o conteúdo de `migration.sql` por:

```sql
-- Categoria do usuário passa a ser lista. Preserva o valor único existente como 1ª (principal).
ALTER TABLE "Transaction" ADD COLUMN "userCategories" TEXT[] NOT NULL DEFAULT '{}';
UPDATE "Transaction" SET "userCategories" = ARRAY["userCategory"] WHERE "userCategory" IS NOT NULL;
ALTER TABLE "Transaction" DROP COLUMN "userCategory";
```

- [ ] **Step 4: Aplicar a migração localmente**

Run (na pasta `backend/`): `npx prisma migrate dev`
Expected: `Applying migration ...user_categories`, sem erro; `prisma generate` roda em seguida.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): userCategory vira userCategories (array), migracao preserva dados"
```

---

### Task 2: Backend — `PATCH /transactions/:id` aceita `userCategories`

**Files:**
- Modify: `backend/src/modules/transactions/transaction.controller.ts:50-79`

**Interfaces:**
- Consumes: `Transaction.userCategories` (Task 1), `sameGroup` (já existe em `./notes`).
- Produces: endpoint aceita body `{ userCategories?: string[]; description?: string }`; propaga `userCategories` pro grupo via `updateMany`.

- [ ] **Step 1: Reescrever o handler PATCH**

Substituir o bloco atual (linhas 48-79) por:

```ts
// Edita uma transação — userCategories (categorias do usuário) e/ou description.
// userCategories vazio ([]) volta a herdar a categoria da Pluggy.
transactionsRouter.patch("/transactions/:id", async (req, res) => {
  const { userCategories, description } = req.body ?? {};
  const data: { userCategories?: string[]; description?: string } = {};
  if (Array.isArray(userCategories)) {
    // trim, descarta vazios e dedupe preservando a ordem (1ª = principal). [] = herda Pluggy.
    data.userCategories = [...new Set(userCategories.map((c) => String(c).trim()).filter(Boolean))];
  }
  if (typeof description === "string" && description.trim()) data.description = description;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Envie userCategories e/ou description." });
  }
  try {
    const tx = await prisma.transaction.update({ where: { id: req.params.id }, data });
    // Categoria(s) do usuário valem pra compra toda: propaga pras parcelas do grupo (mesma
    // tolerância do modal). As parcelas futuras já existem como linhas, então updateMany
    // alcança o parcelamento inteiro.
    if (data.userCategories !== undefined) {
      const cands = await prisma.transaction.findMany({
        where: { accountId: tx.accountId },
        select: { id: true, accountId: true, description: true, amount: true },
      });
      const ids = cands.filter((c) => sameGroup(c, tx)).map((c) => c.id);
      if (ids.length) {
        await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { userCategories: data.userCategories } });
      }
    }
    res.json(tx);
  } catch {
    res.status(404).json({ error: "Transação não encontrada." });
  }
});
```

- [ ] **Step 2: Verificar build do backend**

Run (na pasta `backend/`): `npm run build`
Expected: `tsc` compila sem erro.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/transactions/transaction.controller.ts
git commit -m "feat(api): PATCH transaction aceita userCategories[] e propaga pro grupo"
```

---

### Task 3: Frontend `api.ts` — tipos, regras e filtro (com teste)

**Files:**
- Modify: `frontend/src/api.ts:16-29`, `:105-137`, `:332-333`
- Test: `frontend/src/applyTxFilters.test.ts`

**Interfaces:**
- Produces: `Transaction.userCategories: string[]`; `effectiveCategory(t): string`; `effectiveCategories(t): string[]`; `TxFilter.categorias: string[]`; `applyTxFilters` com interseção OU; `api.updateTransaction(id, { userCategories?: string[]; description?: string })`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao fim de `frontend/src/applyTxFilters.test.ts` (antes do `console.log`), e importar `effectiveCategory, effectiveCategories` do `./api`:

```ts
import { applyTxFilters, EMPTY_FILTER, effectiveCategory, effectiveCategories, type Transaction } from "./api";
```

```ts
// --- Categorias múltiplas ---
const semUser = tx({ amount: "-10", type: "BANK", category: "Outros" });
const comUser = { ...tx({ amount: "-10", type: "BANK", category: "Outros" }), userCategories: ["Uber", "Viagem"] };

// principal = 1ª do usuário; sem userCategories cai na Pluggy
assert.equal(effectiveCategory(comUser), "Uber", "principal = 1ª do usuário");
assert.equal(effectiveCategory(semUser), "Outros", "sem userCategories usa a Pluggy");
assert.deepEqual(effectiveCategories(comUser), ["Uber", "Viagem"], "lista completa do usuário");
assert.deepEqual(effectiveCategories(semUser), ["Outros"], "sem userCategories = [Pluggy]");

// filtro múltiplo = OU (interseção)
const semFiltro = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: [] });
assert.equal(semFiltro.length, 2, "sem categorias selecionadas passa tudo");
const soViagem = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Viagem"] });
assert.deepEqual(soViagem, [comUser], "Viagem casa por interseção");
const ouUber = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Uber", "Presente"] });
assert.deepEqual(ouUber, [comUser], "OU: casa se tiver PELO MENOS UMA");
const semMatch = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Presente"] });
assert.equal(semMatch.length, 0, "nenhuma tx intersecta -> filtrada");
```

Ajustar o helper `tx(...)` no topo do arquivo para incluir o campo novo (senão o type quebra):

```ts
const tx = (p: { amount: string; type: string; category?: string; description?: string }): Transaction => ({
  id: Math.random().toString(),
  amount: p.amount,
  date: "2026-08-15",
  description: p.description ?? "x",
  category: p.category ?? "Outros",
  userCategories: [],
  account: { id: "a", type: p.type, name: null, item: { institution: "Mercado Pago", userId: "u" } },
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run (na pasta `frontend/`): `npx tsx src/applyTxFilters.test.ts`
Expected: FALHA (type error em `effectiveCategories`/`userCategories`/`categorias` ainda não existem).

- [ ] **Step 3: Implementar em `api.ts`**

Trocar o campo do type `Transaction` (linha 22):

```ts
  userCategories: string[]; // definidas pelo usuário; ordem importa ([0]=principal); [] herda a Pluggy
```

Trocar `effectiveCategory` (linha 29) e adicionar `effectiveCategories`:

```ts
// Categoria efetiva PRINCIPAL: 1ª do usuário quando houver, senão a da Pluggy.
// Mantém as agregações (donut/orçamento/resumo) contando 1x por transação.
export const effectiveCategory = (t: Transaction) => t.userCategories[0] || t.category;
// Todas as categorias efetivas (exibição e filtro): as do usuário, ou [Pluggy] quando vazio.
export const effectiveCategories = (t: Transaction): string[] =>
  t.userCategories.length ? t.userCategories : [t.category];
```

Trocar `TxFilter` e `EMPTY_FILTER` (linhas 105-106):

```ts
export type TxFilter = { tipo: string; banco: string; categorias: string[]; incluirInternos: boolean };
export const EMPTY_FILTER: TxFilter = { tipo: "", banco: "", categorias: [], incluirInternos: false };
```

Trocar a linha de categoria em `applyTxFilters` (linha 121):

```ts
    // categorias = OU: mantém se a tx tiver PELO MENOS UMA das selecionadas.
    // `?? []` tolera filtro persistido do shape antigo.
    if ((f.categorias ?? []).length && !effectiveCategories(t).some((c) => f.categorias.includes(c)))
      return false;
```

Trocar `overviewFilter` (linha 137):

```ts
export const overviewFilter = (f: TxFilter): TxFilter => ({ ...f, tipo: "", categorias: [] });
```

Trocar o type do patch em `api.updateTransaction` (linha 332):

```ts
  updateTransaction: (id: string, patch: { userCategories?: string[]; description?: string }) =>
    patchReq<Transaction>(`/transactions/${id}`, patch),
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run (na pasta `frontend/`): `npx tsx src/applyTxFilters.test.ts`
Expected: PASSA, imprime `OK: applyTxFilters ...`.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/applyTxFilters.test.ts
git commit -m "feat(api): userCategories[], effectiveCategories e filtro por multiplas categorias (OU)"
```

---

### Task 4: Componente `CategoryMultiSelect`

**Files:**
- Create: `frontend/src/components/CategoryMultiSelect.tsx`

**Interfaces:**
- Consumes: `CATEGORIES` de `@/api`.
- Produces: `<CategoryMultiSelect selected={string[]} onChange={(next: string[]) => void} showPrimary? placeholder? />`.

- [ ] **Step 1: Criar o componente**

```tsx
import { CATEGORIES } from "@/api";

// Multiselect de categorias com disclosure nativo (<details>). Ordem = ordem de marcação
// (a 1ª é a principal quando showPrimary). Sem dependência nova de popover.
export function CategoryMultiSelect({
  selected,
  onChange,
  showPrimary = false,
  placeholder = "Todas as categorias",
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  showPrimary?: boolean;
  placeholder?: string;
}) {
  const toggle = (c: string) =>
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);

  return (
    <details className="relative">
      <summary className="flex min-h-10 cursor-pointer list-none items-center rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm">
        {selected.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {selected.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-xs">
                {c}
                {showPrimary && i === 0 && <span className="text-[10px] text-muted-foreground">principal</span>}
              </span>
            ))}
          </span>
        )}
      </summary>
      <div className="absolute z-10 mt-1 max-h-64 w-56 overflow-auto rounded-md border border-border/50 bg-card p-1 shadow-md">
        {CATEGORIES.map((c) => (
          <label
            key={c}
            className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
          >
            <input
              type="checkbox"
              checked={selected.includes(c)}
              onChange={() => toggle(c)}
              className="h-3.5 w-3.5 rounded border-border/50"
            />
            {c}
          </label>
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run (na pasta `frontend/`): `npx tsc -b --noEmit`
Expected: sem erro (componente ainda não usado, mas type-check limpo).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/CategoryMultiSelect.tsx
git commit -m "feat(ui): CategoryMultiSelect (disclosure nativo, ordem = principal primeiro)"
```

---

### Task 5: Wiring da edição — `TransactionsTable` + `DashboardContext`

**Files:**
- Modify: `frontend/src/components/TransactionsTable.tsx:7-20`, `:79-93`
- Modify: `frontend/src/dashboard/DashboardContext.tsx:42`, `:113-128`

**Interfaces:**
- Consumes: `CategoryMultiSelect` (Task 4), `api.updateTransaction` com `userCategories` (Task 3).
- Produces: `onCategoryChange(id: string, categories: string[])`; `updateCategory(id, categories: string[])`.

- [ ] **Step 1: `DashboardContext` — assinatura e otimista**

Trocar o type (linha 42):

```ts
  updateCategory: (id: string, categories: string[]) => void;
```

Trocar o `useCallback` (linhas 113-128):

```ts
  const updateCategory = useCallback(
    (id: string, categories: string[]) => {
      // Categoria(s) valem pra compra toda: atualiza otimista as parcelas do grupo (mesma
      // tolerância do backend); o servidor propaga igual via updateMany.
      setTransactions((prev) => {
        const target = prev.find((t) => t.id === id);
        if (!target) return prev;
        return prev.map((t) => (sameChargeGroup(t, target) ? { ...t, userCategories: categories } : t));
      });
      api.updateTransaction(id, { userCategories: categories }).catch((e) => {
        console.error(e);
        reload();
      });
    },
    [reload],
  );
```

- [ ] **Step 2: `TransactionsTable` — usar o multiselect**

Trocar o import (topo) e o type da prop `onCategoryChange`:

```ts
import { brl, expenseValue, incomeValue } from "@/api";
import { CategoryMultiSelect } from "@/components/CategoryMultiSelect";
```

```ts
  // categories === [] limpa as categorias do usuário (volta a herdar a da Pluggy)
  onCategoryChange: (id: string, categories: string[]) => void;
```

(Remover `CATEGORIES` do import de `@/api` se ficar sem uso.)

Trocar a célula "Minha categoria" (o `<select>...</select>`, linhas 80-92) por:

```tsx
              <CategoryMultiSelect
                selected={t.userCategories}
                onChange={(next) => onCategoryChange(t.id, next)}
                showPrimary
                placeholder="— (usar Pluggy)"
              />
```

- [ ] **Step 3: Verificar build do frontend**

Run (na pasta `frontend/`): `npx tsc -b --noEmit`
Expected: sem erro.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TransactionsTable.tsx frontend/src/dashboard/DashboardContext.tsx
git commit -m "feat(ui): edicao de multiplas categorias na tabela de transacoes"
```

---

### Task 6: Wiring do filtro — `TransactionFilters` + bump da chave persistida

**Files:**
- Modify: `frontend/src/components/TransactionFilters.tsx:1`, `:22`, `:41-52`
- Modify: `frontend/src/dashboard/DashboardContext.tsx:61-62`

**Interfaces:**
- Consumes: `CategoryMultiSelect` (Task 4), `TxFilter.categorias` (Task 3).

- [ ] **Step 1: `TransactionFilters` — trocar o select único pelo multiselect**

Trocar o import (linha 1):

```ts
import { EMPTY_FILTER, type TxFilter } from "@/api";
import { CategoryMultiSelect } from "@/components/CategoryMultiSelect";
```

Trocar o cálculo de `active` (linha 22):

```ts
  const active = filter.tipo || filter.banco || filter.categorias.length || filter.incluirInternos;
```

Trocar o bloco do `<select>` de categoria (linhas 41-52) por:

```tsx
      <CategoryMultiSelect
        selected={filter.categorias}
        onChange={(categorias) => set({ categorias })}
      />
```

- [ ] **Step 2: `DashboardContext` — bump das chaves de localStorage**

Trocar as duas linhas (61-62) para descartar o filtro salvo no shape antigo:

```ts
  const [filterCouple, setFilterCouple] = usePersistedState<TxFilter>("fin-dash-filter-couple-v2", EMPTY_FILTER);
  const [filterMy, setFilterMy] = usePersistedState<TxFilter>("fin-dash-filter-my-v2", EMPTY_FILTER);
```

- [ ] **Step 3: Verificar build + lint + teste**

Run (na pasta `frontend/`): `npx tsc -b --noEmit && npm run lint && npx tsx src/applyTxFilters.test.ts`
Expected: build limpo, lint sem erro, teste `OK`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TransactionFilters.tsx frontend/src/dashboard/DashboardContext.tsx
git commit -m "feat(ui): filtro por multiplas categorias (OU) + bump da chave persistida"
```

---

## Self-Review

- **Cobertura da spec:** modelo (T1), regras `api.ts` (T3), backend PATCH (T2), persistência bump (T6), componente (T4), wiring tabela (T5) e filtro (T6), teste (T3). ✔
- **Agregações:** `effectiveCategory` continua devolvendo 1 categoria (a principal) → donut/BudgetCard/Resumo não mudam e não inflam. Callers de `effectiveCategory` não são tocados. ✔
- **Placeholders:** nenhum. **Consistência de tipos:** `userCategories: string[]`, `categorias: string[]`, `onCategoryChange(id, string[])`, `updateCategory(id, string[])`, `updateTransaction({ userCategories })` batem entre tasks. ✔
- **Verificação final** antes do PR: rodar a skill `run-checks` (backend + frontend).
