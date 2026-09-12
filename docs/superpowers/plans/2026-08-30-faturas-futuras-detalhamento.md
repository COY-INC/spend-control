# Faturas futuras + detalhamento de fatura — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar as faturas futuras dos cartões (com as parcelas que caem em cada ciclo) e permitir abrir qualquer fatura — aberta, fechada, futura ou do histórico — num modal com o detalhamento item a item.

**Architecture:** Reaproveita o fatiamento por janela de ciclo que já existe em `openInvoice.ts`: extrai um helper que devolve os *itens* deduplicados de uma janela `(start, end]` (hoje só devolve a soma), anexa esses itens a cada fatura e projeta as janelas futuras a partir das transações datadas no futuro (as parcelas já existem no banco). O `/cards` repassa tudo inline (sem endpoint novo). No frontend, cada fatura vira clicável e abre um bottom-sheet reutilizando o padrão de modal existente.

**Tech Stack:** TypeScript, Express + Prisma (backend), React + Vite + Tailwind (frontend). Testes: self-check com `node:assert` rodado via `npx tsx` (padrão do repo, sem framework).

## Global Constraints

- **Sem testes unitários novos exigidos pelo usuário**, MAS o self-check existente `backend/src/modules/cards/openInvoice.test.ts` deve continuar passando, e o novo comportamento de itens/futuras ganha checks nesse mesmo arquivo (é barato e é o padrão do repo).
- **Convenção de sinal (cartão CREDIT):** compra = `amount` POSITIVO; estorno/desconto/pagamento = NEGATIVO.
- **Datas date-only em UTC:** faturas usam meia-noite UTC; qualquer aritmética/format usa UTC (`addMonthsUTC`, `timeZone: "UTC"`).
- **Campos aditivos:** o shape atual (`open`/`closed`/`history`) é preservado; nada é removido.
- **Sem endpoint novo, sem mudança de schema, sem tocar no seletor de mês.**
- **`FutureCommitmentsCard` não é alterado.**
- Commits em português, no estilo do repo (`feat:` / `docs:`).

---

## File Structure

- `backend/src/modules/cards/openInvoice.ts` — **modificado.** Novo `LineItem`; helper `itemsInWindow`; `netInWindow` passa a somar sobre ele; `items` em cada fatura; nova lista `future`.
- `backend/src/modules/cards/openInvoice.test.ts` — **modificado.** Helper `tx` ganha `category`; novos checks de `items` e `future`.
- `backend/src/modules/cards/cards.controller.ts` — **modificado.** Inclui `category` no `select` das transações; repassa `future` e os `items` no JSON.
- `frontend/src/api.ts` — **modificado.** Tipos `InvoiceLineItem`, `FutureInvoice`; `items`/`future` em `CreditCard`.
- `frontend/src/components/InvoiceDetailModal.tsx` — **criado.** Bottom-sheet do detalhamento (itens + linha "encargos/ajuste").
- `frontend/src/components/CreditCardInvoicesCard.tsx` — **modificado.** Faturas clicáveis + seção de faturas futuras; controla o modal.

---

## Task 1: Backend — itens por fatura (`items`)

**Files:**
- Modify: `backend/src/modules/cards/openInvoice.ts`
- Test: `backend/src/modules/cards/openInvoice.test.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `type LineItem = { date: Date; description: string; amount: number; category: string }`
  - `Tx` ganha `category?: string | null`.
  - `itemsInWindow(txs: Tx[], billTotals: number[], start: Date | null, end: Date | null, dropSettlements: boolean): LineItem[]` — transações deduplicadas da janela `(start, end]`; quando `dropSettlements`, exclui as quitações de fatura fechada (mesma regra `isSettlement`).
  - `Invoices` passa a ter `items` em `open`, `closed` e em cada entrada de `history` (tipo `LineItem[]`).

- [ ] **Step 1: Escrever os checks que falham**

Em `openInvoice.test.ts`, trocar o helper `tx` para carregar categoria e adicionar checks de itens ao final (antes do `console.log`):

```ts
// helper: adiciona category (default "") — os checks antigos ignoram
const tx = (amount: number, iso: string, description = "", category = "") => ({
  amount, date: new Date(iso), description, category,
});
```

```ts
// 5) Itens da fatura: a aberta lista as transações do ciclo que somam no net,
//    excluindo a quitação de fatura fechada; a fechada real lista os itens do
//    ciclo dela.
{
  const bills = [bill(1209.43, "2026-08-03", "2026-08-10")];
  const txs = [
    tx(53.19, "2026-08-04", "Shopee", "Compras"),
    tx(150, "2026-08-04", "Jim.com", "Serviços"),
    tx(-1209.43, "2026-08-09", "Pagamento recebido", "Pagamento"),
  ];
  const r = computeInvoices(txs, bills, 1462.76, new Date("2026-08-05"));
  assert(r.open.items.length === 2, `aberta: esperado 2 itens, veio ${r.open.items.length}`);
  assert(r.open.items.every((i) => i.amount > 0), "aberta: a quitação (-1209.43) não deve aparecer");
  assert(r.open.items.some((i) => i.description === "Shopee" && i.category === "Compras"), "item Shopee com categoria");
  assert(r.closed !== null && Array.isArray(r.closed.items), "fechada tem items[]");
  assert(r.history.every((h) => Array.isArray(h.items)), "cada histórico tem items[]");
}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend && npx tsx src/modules/cards/openInvoice.test.ts`
Expected: FAIL (ex.: `r.open.items` é `undefined` → `Cannot read properties of undefined`).

- [ ] **Step 3: Implementar `LineItem` + `itemsInWindow` e anexar `items`**

Em `openInvoice.ts`:

Adicionar o tipo e ampliar `Tx`:

```ts
type Tx = { amount: unknown; date: Date; description?: string | null; category?: string | null };
export type LineItem = { date: Date; description: string; amount: number; category: string };
```

Extrair o helper e reescrever `netInWindow` para somar sobre ele:

```ts
// Itens deduplicados da janela (start, end]. dropSettlements exclui a quitação de
// fatura fechada (só faz sentido na fatura ABERTA — ver comentário do módulo).
function itemsInWindow(
  txs: Tx[],
  billTotals: number[],
  start: Date | null,
  end: Date | null,
  dropSettlements: boolean,
): LineItem[] {
  const inCycle = txs.filter((t) => (!start || t.date > start) && (!end || t.date <= end));
  const seen = new Set<string>();
  const isSettlement = (v: number) =>
    v < 0 && billTotals.some((bt) => Math.abs(bt - Math.abs(v)) <= 0.02);
  const out: LineItem[] = [];
  for (const t of inCycle) {
    const v = Number(t.amount);
    const key = `${t.date.toISOString().slice(0, 10)}|${v}|${t.description ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (dropSettlements && isSettlement(v)) continue;
    out.push({ date: t.date, description: t.description ?? "", amount: v, category: t.category ?? "" });
  }
  return out;
}

function netInWindow(txs: Tx[], billTotals: number[], start: Date | null, end: Date | null): number {
  // net exclui a quitação de fatura fechada (dropSettlements=true), como antes.
  return itemsInWindow(txs, billTotals, start, end, true).reduce((s, i) => s + i.amount, 0);
}
```

Atualizar o tipo `Invoices` e anexar `items` em cada fatura. Para a **aberta** e o ramo **lagging (fechada projetada)**, `dropSettlements = true`. Para a **fechada real** e o **histórico**, `dropSettlements = false` (o total é o oficial do Bill; os itens são só informativos).

```ts
export type Invoices = {
  open: { amount: number; since: Date | null; items: LineItem[] };
  closed: { amount: number; closingDate: Date; dueDate: Date; items: LineItem[] } | null;
  future: FutureInvoice[]; // preenchido na Task 2; nesta task pode ser []
  history: { closingDate: Date | null; dueDate: Date; totalAmount: number; items: LineItem[] }[];
};
```

Dentro de `computeInvoices`:

- No retorno "sem fatura fechada": `open.items = itemsInWindow(transactions, billTotals, null, null, true)` e `future: []`.
- `open.items = itemsInWindow(transactions, billTotals, curClose, addMonthsUTC(curClose, 1), true)`.
- Ramo `lagging`: `closed.items = itemsInWindow(transactions, billTotals, addMonthsUTC(curClose, -1), curClose, true)`.
- Ramo fechada real: `closed.items = itemsInWindow(transactions, billTotals, addMonthsUTC(lastClosing, -1), lastClosing, false)`.
- Histórico: para cada bill `b`, `items: b.closingDate ? itemsInWindow(transactions, billTotals, addMonthsUTC(b.closingDate, -1), b.closingDate, false) : []`.
- `future: []` por enquanto (Task 2 preenche).

Definir um `FutureInvoice` placeholder no topo para o tipo compilar (Task 2 dá corpo):

```ts
export type FutureInvoice = { closingDate: Date; dueDate: Date; amount: number; items: LineItem[] };
```

- [ ] **Step 4: Rodar para ver passar**

Run: `cd backend && npx tsx src/modules/cards/openInvoice.test.ts`
Expected: PASS — `openInvoice: todos os checks passaram ✓` (os checks 1–5 passam).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/cards/openInvoice.ts backend/src/modules/cards/openInvoice.test.ts
git commit -m "feat: itens por fatura (detalhamento) no cálculo de faturas"
```

---

## Task 2: Backend — faturas futuras (`future[]`)

**Files:**
- Modify: `backend/src/modules/cards/openInvoice.ts`
- Test: `backend/src/modules/cards/openInvoice.test.ts`

**Interfaces:**
- Consumes: `itemsInWindow`, `LineItem`, `FutureInvoice`, `addMonthsUTC` (Task 1).
- Produces: `computeInvoices(...).future` preenchido — um `FutureInvoice` por ciclo futuro que contém parcela, até a última parcela existente, sem meses vazios.

- [ ] **Step 1: Escrever o check que falha**

Adicionar em `openInvoice.test.ts` (antes do `console.log`). Com `now=30/08`, `curClose=27/08`, o ciclo aberto é `(27/08, 27/09]`; as parcelas são datadas **após 27/09** para cair em faturas futuras. Ciclos sem parcela (out→nov) são pulados:

```ts
// 6) Faturas futuras: parcelas datadas além do fim do ciclo aberto viram faturas
//    futuras, uma por ciclo, com os itens daquele ciclo. Ciclos sem parcela são pulados.
{
  const bills = [bill(200, "2026-07-27", "2026-08-03")]; // fecha dia 27, vence dia 03 (offset 7d)
  const txs = [
    tx(90, "2026-08-29", "compra ciclo aberto", "Compras"), // ciclo aberto (27/08,27/09]
    tx(300, "2026-10-15", "Geladeira 3/10", "Casa"),        // futura 1: (27/09,27/10] fecha 27/10
    tx(300, "2026-12-15", "Geladeira 5/10", "Casa"),        // futura 2: (27/11,27/12] fecha 27/12 — ciclo nov pulado
  ];
  const r = computeInvoices(txs, bills, 5000, new Date("2026-08-30"));
  assert(r.future.length === 2, `esperado 2 faturas futuras, veio ${r.future.length}`);
  assert(near(r.future[0].amount, 300), `futura 1 esperada 300, veio ${r.future[0].amount}`);
  assert(r.future[0].closingDate.toISOString().slice(0, 10) === "2026-10-27", `futura 1 fecha 27/10, veio ${r.future[0].closingDate.toISOString().slice(0,10)}`);
  assert(r.future[0].dueDate.toISOString().slice(0, 10) === "2026-11-03", `futura 1 vence 03/11 (offset 7d), veio ${r.future[0].dueDate.toISOString().slice(0,10)}`);
  assert(r.future[0].items.length === 1 && r.future[0].items[0].description === "Geladeira 3/10", "futura 1 tem o item da parcela");
  assert(r.future[1].closingDate.toISOString().slice(0, 10) === "2026-12-27", `futura 2 fecha 27/12, veio ${r.future[1].closingDate.toISOString().slice(0,10)}`);
}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd backend && npx tsx src/modules/cards/openInvoice.test.ts`
Expected: FAIL (`r.future.length` é 0).

- [ ] **Step 3: Implementar a projeção das futuras**

Em `computeInvoices`, logo após calcular `openAmount` (o fim do ciclo aberto é `openEnd = addMonthsUTC(curClose, 1)`), montar as futuras antes do `return` principal:

```ts
// Faturas futuras: uma por ciclo à frente do ciclo aberto que contenha parcela.
// dueOffset = mesma distância fechamento→vencimento do último Bill real.
const openEnd = addMonthsUTC(curClose, 1);
const dueOffsetMs = latest.dueDate.getTime() - lastClosing.getTime();
const lastFuture = transactions.reduce<Date | null>(
  (max, t) => (t.date > openEnd && (!max || t.date > max) ? t.date : max),
  null,
);
const future: FutureInvoice[] = [];
if (lastFuture) {
  let start = openEnd;
  while (start < lastFuture) {
    const end = addMonthsUTC(start, 1);
    const items = itemsInWindow(transactions, billTotals, start, end, false);
    if (items.length > 0) {
      future.push({
        closingDate: end,
        dueDate: new Date(end.getTime() + dueOffsetMs),
        amount: items.reduce((s, i) => s + i.amount, 0),
        items,
      });
    }
    start = end;
  }
}
```

Incluir `future` no `return` principal. No retorno "sem fatura fechada ainda" (sem `latest`), manter `future: []` (sem Bill não há offset de vencimento nem ciclo de referência — aceitável; parcelas futuras nesse cenário raro caem só em Compromissos).

- [ ] **Step 4: Rodar para ver passar**

Run: `cd backend && npx tsx src/modules/cards/openInvoice.test.ts`
Expected: PASS — todos os checks (1–6).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/cards/openInvoice.ts backend/src/modules/cards/openInvoice.test.ts
git commit -m "feat: projeta faturas futuras com as parcelas de cada ciclo"
```

---

## Task 3: Backend — expor `items`/`future` no `/cards`

**Files:**
- Modify: `backend/src/modules/cards/cards.controller.ts`

**Interfaces:**
- Consumes: `computeInvoices(...)` retornando `open.items`, `closed.items`, `future[]`, `history[].items` (Tasks 1–2).
- Produces: JSON de cada cartão com `openInvoice.items`, `closedInvoice.items`, `future[]`, `history[].items` — consumido pelo frontend (Tasks 4–6).

- [ ] **Step 1: Incluir `category` no select e repassar os campos**

Em `cards.controller.ts`, no `include.transactions.select`, adicionar `category`:

```ts
transactions: { select: { amount: true, date: true, description: true, category: true } },
```

`computeInvoices` já retorna `open`/`closed`/`future`/`history` com `items`. O `res.json` monta o objeto do cartão explicitamente — repassar os novos campos:

```ts
const { open, closed, future, history } = computeInvoices(a.transactions, a.bills, Number(a.balance));

return {
  accountId: a.id,
  bank: a.item.institution,
  brand: a.brand,
  cardName: (perBank.get(a.item.institution) ?? 0) > 1 ? a.name : null,
  openInvoice: open,     // agora inclui .items
  closedInvoice: closed, // agora inclui .items
  future,                // novo
  history: history.slice(0, 6),
};
```

(`open`/`closed`/`history` já carregam `items` por serem os objetos retornados de `computeInvoices` — nenhum mapeamento manual a fazer.)

- [ ] **Step 2: Verificar que o backend sobe e o endpoint responde**

Run: `cd backend && npx tsc --noEmit`
Expected: sem erros de tipo.

Se houver um cartão em dev/prod acessível, um smoke rápido (opcional): subir o backend e `GET /cards` deve trazer `future: [...]` e `openInvoice.items: [...]`. Se não houver ambiente à mão, o `tsc` limpo basta.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/cards/cards.controller.ts
git commit -m "feat: /cards devolve itens por fatura e faturas futuras"
```

---

## Task 4: Frontend — tipos (`api.ts`)

**Files:**
- Modify: `frontend/src/api.ts:157-167`

**Interfaces:**
- Consumes: shape JSON do `/cards` (Task 3).
- Produces:
  - `type InvoiceLineItem = { date: string; description: string; amount: number; category: string }`
  - `type FutureInvoice = { closingDate: string; dueDate: string; amount: number; items: InvoiceLineItem[] }`
  - `CreditCard` com `items` em `openInvoice`/`closedInvoice`, `future: FutureInvoice[]`, e `items` em `history[]`.

- [ ] **Step 1: Atualizar os tipos**

Substituir o bloco `export type CreditCard = { ... }` (linhas 157–167) por:

```ts
// Uma linha do detalhamento de fatura (transação que compõe o valor).
export type InvoiceLineItem = {
  date: string;
  description: string;
  amount: number;
  category: string;
};

// Fatura de um ciclo futuro (parcelas agendadas que caem nele).
export type FutureInvoice = {
  closingDate: string;
  dueDate: string;
  amount: number;
  items: InvoiceLineItem[];
};

export type CreditCard = {
  accountId: string;
  bank: string;
  brand: string | null;
  cardName: string | null; // só vem preenchido se houver mais de um cartão no mesmo banco
  openInvoice: { amount: number; since: string | null; items: InvoiceLineItem[] };
  // Fatura fechada ainda a vencer (some quando vence → vai pro histórico). null = nenhuma.
  closedInvoice: { amount: number; closingDate: string; dueDate: string; items: InvoiceLineItem[] } | null;
  // Faturas de ciclos futuros (parcelas), da mais próxima à mais distante.
  future: FutureInvoice[];
  // Faturas já vencidas (histórico), mais recente primeiro.
  history: { closingDate: string | null; dueDate: string; totalAmount: number; items: InvoiceLineItem[] }[];
};
```

- [ ] **Step 2: Verificar tipos**

Run: `cd frontend && npx tsc --noEmit`
Expected: pode acusar erro em `CreditCardInvoicesCard.tsx` se algo referenciar campos removidos — não removemos nada, então deve passar limpo. Se passar, seguir.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat: tipos de itens e faturas futuras no CreditCard"
```

---

## Task 5: Frontend — `InvoiceDetailModal`

**Files:**
- Create: `frontend/src/components/InvoiceDetailModal.tsx`

**Interfaces:**
- Consumes: `InvoiceLineItem` e `brl` de `@/api`.
- Produces: componente `InvoiceDetailModal` exportado, com a prop:

```ts
type InvoiceDetailModalProps = {
  title: string;            // ex.: "Nubank" ou "Nubank · Cartão adicional"
  subtitle: string;         // ex.: "Fatura aberta desde 27/08" / "fechou 03/08 · vence 10/08"
  total: number;            // valor de cabeça (oficial p/ fechada; soma p/ aberta/futura)
  items: InvoiceLineItem[];
  onClose: () => void;
};
```

- [ ] **Step 1: Criar o componente**

```tsx
import { useEffect } from "react";
import { brl, type InvoiceLineItem } from "@/api";

const dm = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

type InvoiceDetailModalProps = {
  title: string;
  subtitle: string;
  total: number;
  items: InvoiceLineItem[];
  onClose: () => void;
};

// Detalhamento de uma fatura (aberta, fechada, futura ou do histórico): lista os itens
// que compõem o valor. Para faturas fechadas o `total` é o oficial do Bill — se ele diverge
// da soma dos itens (juros/encargos que não viram transação), mostra a linha "encargos/ajuste".
export function InvoiceDetailModal({ title, subtitle, total, items, onClose }: InvoiceDetailModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sum = items.reduce((s, i) => s + i.amount, 0);
  const adjustment = total - sum;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-6 shadow-xl sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <span className="ledger text-lg font-semibold text-rose-600 dark:text-rose-500">{brl(total)}</span>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">{subtitle}</p>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem itens para exibir nesta fatura.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{it.description || "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {dm(it.date)}
                    {it.category && ` · ${it.category}`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums font-medium text-foreground">{brl(it.amount)}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Diferença entre o total oficial e a soma dos itens (encargos/juros). Tolerância de centavos. */}
        {Math.abs(adjustment) > 0.02 && (
          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border/50 pt-3 text-sm">
            <span className="text-muted-foreground">Encargos/ajuste</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">{brl(adjustment)}</span>
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-6 min-h-11 w-full rounded-md border border-border px-3 py-2 text-sm text-foreground hover:bg-accent"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/InvoiceDetailModal.tsx
git commit -m "feat: modal de detalhamento de fatura"
```

---

## Task 6: Frontend — faturas clicáveis + seção de futuras no card

**Files:**
- Modify: `frontend/src/components/CreditCardInvoicesCard.tsx`

**Interfaces:**
- Consumes: `CreditCard` (com `items`/`future`), `InvoiceDetailModal` (Task 5).
- Produces: UI final — clicar em qualquer fatura abre o modal; faturas futuras listadas abaixo da aberta.

- [ ] **Step 1: Estado do modal e helpers**

No topo do componente `CreditCardInvoicesCard`, adicionar o import e um estado que guarda a fatura selecionada já normalizada para as props do modal:

```tsx
import { InvoiceDetailModal } from "@/components/InvoiceDetailModal";
```

```tsx
type Selected = { title: string; subtitle: string; total: number; items: InvoiceLineItem[] };
const [selected, setSelected] = useState<Selected | null>(null);
```

(Importar `InvoiceLineItem` e `FutureInvoice` de `@/api` junto do import existente.)

Helper de rótulo do cartão (usa banco + nome), dentro do `.map((c) => { ... })`:

```tsx
const cardTitle = c.cardName ? `${c.bank} · ${c.cardName}` : c.bank;
const monthLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" }).replace(".", "");
```

- [ ] **Step 2: Tornar aberta/fechada/histórico clicáveis**

Envolver cada bloco de fatura com `role="button"`, `tabIndex`, `onClick`/`onKeyDown` que chamam `setSelected(...)`. Exemplos (aplicar aos três blocos existentes):

Aberta:
```tsx
<div
  role="button"
  tabIndex={0}
  className="cursor-pointer rounded-md -mx-1 px-1 hover:bg-accent/50"
  onClick={() =>
    setSelected({
      title: cardTitle,
      subtitle: c.openInvoice.since ? `Fatura aberta desde ${dm(c.openInvoice.since)}` : "Fatura aberta",
      total: c.openInvoice.amount,
      items: c.openInvoice.items,
    })
  }
  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), setSelected({
    title: cardTitle,
    subtitle: c.openInvoice.since ? `Fatura aberta desde ${dm(c.openInvoice.since)}` : "Fatura aberta",
    total: c.openInvoice.amount,
    items: c.openInvoice.items,
  }))}
>
  {/* conteúdo atual da fatura atual (label + número grande) */}
</div>
```

Fechada (`closed`): mesmo padrão, com
```tsx
subtitle: `fechou ${dm(closed.closingDate)} · vence ${dm(closed.dueDate)}`,
total: closed.amount,
items: closed.items,
```

Histórico (cada `<li>` do `older.map`): tornar clicável com
```tsx
subtitle: `fechou ${dm(b.closingDate)} · venceu ${dm(b.dueDate)}`,
total: b.totalAmount,
items: b.items,
```

> Nota: `dm` já existe no arquivo e aceita `string | null`. Onde a data pode ser null (`closingDate` do histórico), o `dm` já trata (mostra "—").

- [ ] **Step 3: Seção de faturas futuras**

Depois do bloco da fatura fechada e antes do histórico, adicionar a lista de futuras (só quando houver):

```tsx
{c.future.length > 0 && (
  <div className="space-y-1">
    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
      Próximas faturas
    </span>
    <ul className="space-y-0.5 text-sm">
      {c.future.map((f, i) => (
        <li
          key={i}
          role="button"
          tabIndex={0}
          className="flex cursor-pointer justify-between rounded-md px-1 py-0.5 hover:bg-accent/50"
          onClick={() =>
            setSelected({
              title: cardTitle,
              subtitle: `fecha ${dm(f.closingDate)} · vence ${dm(f.dueDate)}`,
              total: f.amount,
              items: f.items,
            })
          }
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") &&
            (e.preventDefault(),
            setSelected({
              title: cardTitle,
              subtitle: `fecha ${dm(f.closingDate)} · vence ${dm(f.dueDate)}`,
              total: f.amount,
              items: f.items,
            }))
          }
        >
          <span className="capitalize text-muted-foreground">{monthLabel(f.closingDate)}</span>
          <span className="tabular-nums">{brl(f.amount)}</span>
        </li>
      ))}
    </ul>
  </div>
)}
```

- [ ] **Step 4: Renderizar o modal**

No fim do JSX do componente (após o `</Card>` de fechamento, dentro de um fragment que envolva tudo), adicionar:

```tsx
{selected && (
  <InvoiceDetailModal
    title={selected.title}
    subtitle={selected.subtitle}
    total={selected.total}
    items={selected.items}
    onClose={() => setSelected(null)}
  />
)}
```

(Envolver o `return` do componente em `<>...</>` se ainda não estiver, para caber o modal ao lado do `<Card>`.)

- [ ] **Step 5: Verificar tipos e build**

Run: `cd frontend && npx tsc --noEmit && npx vite build`
Expected: build sem erros.

- [ ] **Step 6: Smoke manual (opcional, se houver ambiente)**

Subir backend + frontend, ir em **Cartões**: cada fatura deve abrir o modal ao clicar; "Próximas faturas" deve listar os ciclos futuros com parcela; o modal de uma fechada com juros deve mostrar "Encargos/ajuste".

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/CreditCardInvoicesCard.tsx
git commit -m "feat: faturas clicáveis com detalhamento + próximas faturas no card"
```

---

## Self-Review

**Spec coverage:**
- Faturas futuras com parcelas → Task 2 (backend) + Task 6 (UI "Próximas faturas"). ✓
- Detalhamento ao clicar (modal) → Task 5 + Task 6. ✓
- Detalhe para fechadas/abertas/futuras → itens anexados em todas (Tasks 1–2); todas clicáveis (Task 6). ✓
- Total oficial do Bill + linha "encargos/ajuste" → Task 1 (fechada usa `totalAmount` oficial) + Task 5 (linha de ajuste). ✓
- Independente do seletor de mês → o card segue chamando `api.cards(userId)` (não alterado). ✓
- Sem endpoint/schema novos, `FutureCommitmentsCard` intocado → nenhuma task os altera. ✓
- Bill sem `closingDate` no histórico → `items: []` (Task 1, Step 3). ✓

**Placeholder scan:** sem TBD/TODO; todo passo tem código concreto.

**Type consistency:** `InvoiceLineItem` (frontend) espelha `LineItem` (backend, com `date` serializado como string). `FutureInvoice` idem. `Selected` no card usa exatamente as props de `InvoiceDetailModal`. `computeInvoices` retorna `open.items`/`closed.items`/`future`/`history[].items`, consumidos igual em Task 3. ✓
