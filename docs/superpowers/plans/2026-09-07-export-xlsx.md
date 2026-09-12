# Export XLSX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A client-side "Exportar" button that downloads an `.xlsx` with one sheet per dashboard page, reflecting the current view (month + scope + bank filter).

**Architecture:** A pure `buildSheets(data)` builds plain row arrays per sheet, reusing the derivation helpers already in `frontend/src/api.ts`. A thin `exportWorkbook(data)` turns those into a workbook via SheetJS and triggers a download. A button in `GlobalHeader` fetches the per-page data the context doesn't hold, then calls `exportWorkbook`.

**Tech Stack:** React 19, TypeScript, SheetJS (`xlsx`), `tsx` for assert tests.

## Global Constraints

- Reuse existing helpers from `frontend/src/api.ts` — do NOT re-derive expense sign, effective category, or invoice cycles.
- WYSIWYG: each sheet mirrors its page's own filtering. Transações uses the full `filter`; Resumo/Gastos/Patrimônio/Investimentos use `overviewFilter(filter)` (bank + internos only).
- Card "current invoice" = `closedInvoice ?? openInvoice` per card.
- Numbers stay numeric (no `brl` strings). No cell styling.
- Frontend tests are plain `node:assert` files run with `npx tsx <file>` (see `frontend/src/applyTxFilters.test.ts`).
- Branch `feat/export-xlsx` already exists and holds the spec commit.

---

### Task 1: `buildSheets` pure function + tests

**Files:**
- Create: `frontend/src/lib/export.ts`
- Test: `frontend/src/lib/export.test.ts`

**Interfaces:**
- Consumes from `@/api`: `signedBalance`, `accountMatchesFilter`, `overviewFilter`, `applyTxFilters`, `incomeValue`, `expenseValue`, `effectiveCategory`, `isCard`, `isInternalMovement`, and types `TxFilter, AccountFull, Investment, Transaction, CreditCard, CommitmentPlan, ReservedEntry, Subscription, User`.
- Produces: `type ExportData` and `function buildSheets(data: ExportData): Record<string, Record<string, unknown>[]>`. Sheet keys, in order: `"Resumo"`, `"Patrimônio"`, `"Investimentos"`, `"Cartões"`, `"Gastos"`, `"Transações"`.

- [ ] **Step 1: Write `frontend/src/lib/export.ts` with `ExportData` + `buildSheets`**

```ts
// frontend/src/lib/export.ts
// Monta os dados da aplicação em folhas (uma por página) para exportação .xlsx.
// buildSheets é PURA (dados -> linhas); o wrapper exportWorkbook (Task 2) faz o XLSX.
import {
  signedBalance,
  accountMatchesFilter,
  overviewFilter,
  applyTxFilters,
  incomeValue,
  expenseValue,
  effectiveCategory,
  isCard,
  isInternalMovement,
  type TxFilter,
  type AccountFull,
  type Investment,
  type Transaction,
  type CreditCard,
  type CommitmentPlan,
  type ReservedEntry,
  type Subscription,
  type User,
} from "@/api";

export type Scope = "couple" | "my";

export type ExportData = {
  scope: Scope;
  ym: string; // "YYYY-MM"
  filter: TxFilter;
  users: User[];
  userId: string;
  accounts: AccountFull[];
  investments: Investment[]; // já escopados (contexto)
  transactions: Transaction[];
  cards: CreditCard[];
  commitments: CommitmentPlan[];
  reserved: ReservedEntry[];
  budgets: Record<string, number>;
  subscriptions: Subscription[];
};

type Row = Record<string, unknown>;

const TYPE_LABEL: Record<string, string> = {
  CREDIT: "Cartão de crédito",
  BANK: "Conta",
  LOAN: "Empréstimo",
  INVESTMENT: "Investimento",
};

export function buildSheets(data: ExportData): Record<string, Row[]> {
  const { filter } = data;
  const gf = overviewFilter(filter);
  const inc = filter.incluirInternos;
  const byBank = filter.banco; // "" = todos

  // --- Resumo ---
  const accIn = data.accounts.filter((a) => accountMatchesFilter(a.institution, a.type, gf));
  const invIn = data.investments.filter((i) => accountMatchesFilter(i.institution, "INVESTMENT", gf));
  const bankMap = new Map<string, number>();
  for (const a of accIn) bankMap.set(a.institution, (bankMap.get(a.institution) ?? 0) + signedBalance(a));
  for (const i of invIn) bankMap.set(i.institution, (bankMap.get(i.institution) ?? 0) + i.balance);
  const netWorth = [...bankMap.values()].reduce((s, v) => s + v, 0);

  const flowTxs = applyTxFilters(data.transactions, gf);
  const flowInc = flowTxs.reduce((s, t) => s + incomeValue(t, inc), 0);
  const flowExp = flowTxs.reduce((s, t) => s + expenseValue(t, inc), 0);

  const cardsF = byBank ? data.cards.filter((c) => c.bank === byBank) : data.cards;
  const openInvoices = cardsF.reduce((s, c) => s + c.openInvoice.amount, 0);
  const commitmentsF = byBank ? data.commitments.filter((p) => p.bank === byBank) : data.commitments;
  const committed = commitmentsF.reduce((s, p) => s + p.remainingAmount, 0);

  // orçamento espelha o BudgetCard: gasto por categoria efetiva, sem filtro de banco.
  const spentByCat: Record<string, number> = {};
  for (const t of data.transactions) {
    const e = expenseValue(t);
    if (e > 0) spentByCat[effectiveCategory(t)] = (spentByCat[effectiveCategory(t)] ?? 0) + e;
  }
  const budgetLimit = Object.values(data.budgets).reduce((s, v) => s + v, 0);
  const budgetSpent = Object.keys(data.budgets).reduce((s, c) => s + (spentByCat[c] ?? 0), 0);

  const resumo: Row[] = [
    { Indicador: "Patrimônio líquido", Valor: netWorth },
    { Indicador: "Entradas do mês", Valor: flowInc },
    { Indicador: "Saídas do mês", Valor: flowExp },
    { Indicador: "Fluxo líquido", Valor: flowInc - flowExp },
    { Indicador: "Faturas em aberto", Valor: openInvoices },
    { Indicador: "Comprometido em parcelas", Valor: committed },
    { Indicador: "Orçamento — gasto", Valor: budgetSpent },
    { Indicador: "Orçamento — limite", Valor: budgetLimit },
    ...[...bankMap.entries()]
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
      .map(([bank, val]) => ({ Indicador: `Patrimônio · ${bank}`, Valor: val })),
  ];

  // --- Patrimônio ---
  const patrimonio: Row[] = [
    ...accIn.map((a) => ({
      Banco: a.institution,
      Conta: a.name ?? "",
      Tipo: TYPE_LABEL[a.type] ?? a.type,
      Saldo: signedBalance(a),
      Titular: a.userName,
    })),
    ...data.reserved
      .filter((r) => !byBank || r.bank === byBank)
      .map((r) => ({ Banco: r.bank, Conta: `Reserva: ${r.name}`, Tipo: "Reserva", Saldo: r.amount, Titular: "" })),
  ];

  // --- Investimentos ---
  const investimentos: Row[] = invIn.map((i) => ({
    Instituição: i.institution,
    Nome: i.name,
    Tipo: i.type,
    Saldo: i.balance,
    Titular: i.userName,
  }));

  // --- Cartões --- (fatura atual = fechada-não-vencida, senão aberta)
  const cartoes: Row[] = [];
  for (const c of cardsF) {
    const current = c.closedInvoice ?? c.openInvoice;
    const isClosed = c.closedInvoice != null;
    const venc = c.closedInvoice ? c.closedInvoice.dueDate : "";
    cartoes.push({
      Banco: c.bank,
      Cartão: c.cardName ?? "",
      Data: venc,
      Descrição: `TOTAL — Fatura atual (${isClosed ? "fechada" : "aberta"})`,
      Valor: current.amount,
      Categoria: "",
      Nota: "",
      Antecipada: "",
    });
    for (const it of current.items) {
      cartoes.push({
        Banco: c.bank,
        Cartão: c.cardName ?? "",
        Data: it.date,
        Descrição: it.description,
        Valor: it.amount,
        Categoria: it.category,
        Nota: it.note ?? "",
        Antecipada: it.anticipated ? "sim" : "",
      });
    }
    cartoes.push({}); // linha em branco entre cartões
  }

  // --- Gastos --- (categorias por categoria efetiva + totais + assinaturas)
  const gastosTxs = applyTxFilters(data.transactions, gf);
  const catMap = new Map<string, number>();
  let totalExp = 0;
  let totalInc = 0;
  for (const t of gastosTxs) {
    const e = expenseValue(t, inc);
    if (e > 0) {
      catMap.set(effectiveCategory(t), (catMap.get(effectiveCategory(t)) ?? 0) + e);
      totalExp += e;
    }
    totalInc += incomeValue(t, inc);
  }
  const gastos: Row[] = [
    ...[...catMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([cat, v]) => ({
        Item: cat,
        Valor: v,
        "% do total": totalExp > 0 ? Math.round((v / totalExp) * 1000) / 10 : 0,
      })),
    { Item: "TOTAL Saídas", Valor: totalExp, "% do total": "" },
    { Item: "TOTAL Entradas", Valor: totalInc, "% do total": "" },
    ...data.subscriptions
      .filter((s) => !byBank || s.bank === byBank)
      .map((s) => ({ Item: `Assinatura: ${s.label}`, Valor: s.monthlyAmount, "% do total": `${s.occurrences}x` })),
  ];

  // --- Transações --- (filtro completo da página)
  const txs = applyTxFilters(data.transactions, filter);
  const transacoes: Row[] = txs.map((t) => {
    const amt = Number(t.amount);
    const tipo = isInternalMovement(t)
      ? "interna"
      : isCard(t)
        ? "cartão"
        : amt >= 0
          ? "entrada"
          : "saída";
    return {
      Data: t.date,
      Banco: t.account.item.institution,
      Conta: t.account.name ?? "",
      Descrição: t.description,
      Valor: amt,
      Categoria: effectiveCategory(t),
      Nota: t.note ?? "",
      Tipo: tipo,
    };
  });

  return {
    Resumo: resumo,
    Patrimônio: patrimonio,
    Investimentos: investimentos,
    Cartões: cartoes,
    Gastos: gastos,
    Transações: transacoes,
  };
}
```

- [ ] **Step 2: Write the failing test `frontend/src/lib/export.test.ts`**

```ts
// Rode com: npx tsx src/lib/export.test.ts
import assert from "node:assert";
import { buildSheets, type ExportData } from "./export";
import { EMPTY_FILTER, type CreditCard, type Transaction } from "@/api";

const acct = (over: Partial<Transaction["account"]> = {}) => ({
  id: "a",
  type: "BANK",
  name: null,
  item: { institution: "Nubank", userId: "u" },
  ...over,
});

const tx = (p: { amount: string; type?: string; description?: string; category?: string }): Transaction => ({
  id: Math.random().toString(),
  amount: p.amount,
  date: "2026-09-10",
  description: p.description ?? "x",
  category: p.category ?? "Mercado",
  userCategories: [],
  account: acct({ type: p.type ?? "BANK" }) as Transaction["account"],
});

const card = (over: Partial<CreditCard>): CreditCard => ({
  accountId: "c",
  bank: "Nubank",
  brand: null,
  cardName: null,
  openInvoice: { amount: 100, since: null, items: [] },
  closedInvoice: null,
  future: [],
  history: [],
  ...over,
});

const base: ExportData = {
  scope: "couple",
  ym: "2026-09",
  filter: { ...EMPTY_FILTER },
  users: [],
  userId: "",
  accounts: [],
  investments: [],
  transactions: [],
  cards: [],
  commitments: [],
  reserved: [],
  budgets: {},
  subscriptions: [],
};

// 1) Cartões: fatura atual = fechada quando existe, senão aberta.
const withClosed = card({
  closedInvoice: { amount: 555, closingDate: "2026-09-01", dueDate: "2026-09-15", items: [] },
});
const openOnly = card({ openInvoice: { amount: 222, since: null, items: [] } });
const sClosed = buildSheets({ ...base, cards: [withClosed] })["Cartões"];
assert.equal(sClosed[0].Valor, 555, "fatura atual usa a fechada-não-vencida");
const sOpen = buildSheets({ ...base, cards: [openOnly] })["Cartões"];
assert.equal(sOpen[0].Valor, 222, "sem fechada, usa a aberta");

// 2) Transações: sinal preservado; tipo correto.
const sTx = buildSheets({
  ...base,
  transactions: [tx({ amount: "-50", description: "Pix enviado" }), tx({ amount: "728.44", description: "Pix recebido" })],
})["Transações"];
assert.equal(sTx.find((r) => r.Descrição === "Pix enviado")!.Valor, -50, "valor negativo preservado");
assert.equal(sTx.find((r) => r.Descrição === "Pix enviado")!.Tipo, "saída", "saída rotulada");
assert.equal(sTx.find((r) => r.Descrição === "Pix recebido")!.Tipo, "entrada", "entrada rotulada");

// 3) Gastos: soma das categorias == TOTAL Saídas.
const sG = buildSheets({
  ...base,
  transactions: [
    tx({ amount: "-30", category: "Mercado" }),
    tx({ amount: "-20", category: "Uber" }),
    tx({ amount: "100", description: "Salário" }),
  ],
})["Gastos"];
const catSum = sG.filter((r) => typeof r["% do total"] === "number").reduce((s, r) => s + (r.Valor as number), 0);
const totalSaidas = sG.find((r) => r.Item === "TOTAL Saídas")!.Valor as number;
assert.equal(catSum, totalSaidas, "categorias somam o total de saídas");
assert.equal(totalSaidas, 50, "duas saídas somam 50");

console.log("OK: buildSheets (cartões/transações/gastos)");
```

- [ ] **Step 3: Run the test to verify it passes**

Run: `cd frontend && npx tsx src/lib/export.test.ts`
Expected: `OK: buildSheets (cartões/transações/gastos)`

(Note: `@/api` alias resolves under `tsx` via the existing tsconfig `paths`, same as `applyTxFilters.test.ts` which imports from `./api`. If the alias fails to resolve under tsx, change the two `@/api` imports in `export.ts` and `export.test.ts` to the relative `../api` / `./` form used by the other tests.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/export.ts frontend/src/lib/export.test.ts
git commit -m "feat(export): buildSheets monta as 6 folhas (puro + teste)"
```

---

### Task 2: `exportWorkbook` wrapper + "Exportar" button

**Files:**
- Modify: `frontend/src/lib/export.ts` (append `exportWorkbook`)
- Modify: `frontend/src/components/GlobalHeader.tsx`
- Modify: `frontend/package.json` (add `xlsx` dependency)

**Interfaces:**
- Consumes: `buildSheets`, `ExportData` from Task 1.
- Produces: `function exportWorkbook(data: ExportData): void` — builds the workbook and triggers the browser download `financas-<ym>-<meu|casal>.xlsx`.

- [ ] **Step 1: Install SheetJS**

Run: `cd frontend && npm install xlsx`
Expected: `xlsx` added to `frontend/package.json` dependencies.

- [ ] **Step 2: Append `exportWorkbook` to `frontend/src/lib/export.ts`**

```ts
import * as XLSX from "xlsx";

// Wrapper: transforma as folhas em workbook e dispara o download. Sem estilização.
export function exportWorkbook(data: ExportData): void {
  const sheets = buildSheets(data);
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    // json_to_sheet com [] gera folha vazia sem colunas; usa [{}] pra ao menos criar a aba.
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const suffix = data.scope === "my" ? "meu" : "casal";
  XLSX.writeFile(wb, `financas-${data.ym}-${suffix}.xlsx`);
}
```

Add `import * as XLSX from "xlsx";` at the top of the file alongside the existing imports (or leave it above `exportWorkbook` as shown — both work).

- [ ] **Step 3: Add the "Exportar" button to `frontend/src/components/GlobalHeader.tsx`**

Replace the whole file with:

```tsx
import { useState } from "react";
import { useDashboard } from "@/dashboard/DashboardContext";
import { MonthYearPicker } from "@/components/MonthYearPicker";
import { api } from "@/api";
import { exportWorkbook } from "@/lib/export";

export function GlobalHeader() {
  const {
    scope,
    setScope,
    users,
    userId,
    setUserId,
    ym,
    setYm,
    filter,
    setFilter,
    banks,
    accounts,
    investments,
    transactions,
  } = useDashboard();
  const sel = "min-h-10 rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm";
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    setExporting(true);
    try {
      const u = scope === "my" ? userId : undefined;
      const [cards, commitments, reserved, budgets, subscriptions] = await Promise.all([
        api.cards(u),
        api.commitments(u),
        api.reserved(u),
        api.budgets(),
        api.subscriptions(),
      ]);
      exportWorkbook({
        scope,
        ym,
        filter,
        users,
        userId,
        accounts,
        investments,
        transactions,
        cards,
        commitments,
        reserved,
        budgets,
        subscriptions,
      });
    } catch (e) {
      console.error(e);
      alert("Falha ao exportar os dados.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Escopo Casal / Minhas */}
      <div className="inline-flex rounded-md border border-border/50 p-0.5">
        {(["couple", "my"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            aria-pressed={scope === s}
            className={`min-h-9 rounded px-3 text-sm transition-colors ${
              scope === s ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {s === "couple" ? "Casal" : "Minhas"}
          </button>
        ))}
      </div>

      {scope === "my" && (
        <select
          className={sel}
          aria-label="Usuário"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      )}

      <MonthYearPicker value={ym} onChange={setYm} />

      <select
        className={sel}
        aria-label="Banco"
        value={filter.banco}
        onChange={(e) => setFilter({ ...filter, banco: e.target.value })}
      >
        <option value="">Todos os bancos</option>
        {banks.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <button
        onClick={onExport}
        disabled={exporting}
        className="min-h-10 rounded-md border border-border/50 px-3 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50 sm:ml-auto"
      >
        {exporting ? "Exportando…" : "Exportar"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Verify the build and existing tests**

Run: `cd frontend && npx tsx src/lib/export.test.ts && npm run build`
Expected: test prints `OK: buildSheets ...` and the Vite/TS build finishes with no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/export.ts frontend/src/components/GlobalHeader.tsx
git commit -m "feat(export): botao Exportar gera .xlsx (uma folha por pagina)"
```

---

## Self-Review

- **Spec coverage:** client-side ✓ (Task 2), `.xlsx` multi-sheet via SheetJS ✓, WYSIWYG per-page filtering ✓ (`gf` vs `filter`), card current = `closedInvoice ?? openInvoice` ✓, 6 sheets with the specified columns ✓, numbers numeric ✓, assert test on `buildSheets` covering the three spec cases ✓, filename `financas-YYYY-MM[-meu|-casal]` ✓. Out-of-scope items (backend, styling, future/history sheets) correctly absent.
- **Placeholder scan:** none — every step has full code/commands.
- **Type consistency:** `ExportData`/`buildSheets` signatures match between Task 1 and Task 2; sheet keys used in the test (`"Cartões"`, `"Transações"`, `"Gastos"`) match `buildSheets`' returned keys; `exportWorkbook` consumes the same `ExportData` the button constructs.
```
