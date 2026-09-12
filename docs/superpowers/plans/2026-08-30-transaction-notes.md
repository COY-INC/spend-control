# Comentários de transação + pendências + filtro de assinaturas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir comentar transações (persistindo o comentário por identidade de compra entre parcelas/assinaturas/recorrências), sinalizar na tela inicial quantas despesas seguem sem comentário com um "dispensar", e filtrar o card de Assinaturas por banco.

**Architecture:** Comentário mora numa tabela própria (`TransactionNote`) chaveada pela identidade da compra (`accountId|descrição-base|valor`), não na linha volátil de `Transaction`. Pendência = despesa sem nota com `createdAt` posterior a uma marca d'água global (`AppState.pendingDismissedAt`). Backend só filtra "sem nota + pós-marca"; a classificação de "despesa relevante" fica no frontend (fonte única).

**Tech Stack:** Node/Express/TypeScript, Prisma + PostgreSQL (backend); React/Vite/TypeScript + Tailwind (frontend). Testes de lógica pura via self-check `tsx` (estilo `openInvoice.test.ts`); UI verificada com `tsc --noEmit` + checagem manual.

## Global Constraints

- Workflow git: branch + PR, nunca push direto no master. A branch desta feature é `feat/transaction-notes` (já criada; contém o commit do spec).
- Toda rota nova entra **depois** de `app.use(requireAuth)` no `index.ts` (exige JWT), exceto as já públicas.
- Datas "date-only" são UTC-meia-noite; formatação sempre com `timeZone: "UTC"`.
- Mensagens/erros de usuário em pt-BR, seguindo o estilo dos controllers atuais (`res.status(404).json({ error: "..." })`).
- Migração Prisma é **aditiva** (novas tabelas + coluna com default) — segura para `migrate deploy` em prod. Rodar `migrate dev` apenas contra um DATABASE_URL de desenvolvimento, **nunca** o de produção.
- Backend roda TS com `tsx`; self-checks são executados com `npx tsx <arquivo>`.

---

### Task 1: Schema Prisma — TransactionNote, AppState, Transaction.createdAt

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create (gerado): `backend/prisma/migrations/<timestamp>_add_transaction_notes/migration.sql`

**Interfaces:**
- Produces: modelos Prisma `TransactionNote { id, key @unique, note, updatedAt }`, `AppState { id @default("singleton"), pendingDismissedAt? }`, e campo `Transaction.createdAt DateTime @default(now())`.

- [ ] **Step 1: Adicionar os modelos e o campo no schema**

Em `backend/prisma/schema.prisma`, adicionar ao final do arquivo:

```prisma
// Comentário livre do usuário, ancorado na IDENTIDADE da compra (não na linha volátil de
// Transaction): "accountId|descrição-base|valor". Assim persiste entre parcelas/recorrências
// e sobrevive ao churn de pluggyTransactionId da MeuPluggy.
model TransactionNote {
  id        String   @id @default(cuid())
  key       String   @unique
  note      String
  updatedAt DateTime @updatedAt
}

// Estado global do app (linha única id="singleton"). Guarda a marca d'água do
// "dispensar tudo agora" das pendências.
model AppState {
  id                 String    @id @default("singleton")
  pendingDismissedAt DateTime?
}
```

E dentro do `model Transaction { ... }`, adicionar o campo (logo após `pluggyTransactionId`):

```prisma
  createdAt           DateTime @default(now()) // 1ª vez que a transação foi vista (no sync)
```

- [ ] **Step 2: Autorar a migração à mão (o `.env` local aponta para PROD — NÃO rodar `migrate dev`/`migrate deploy`)**

Criar `backend/prisma/migrations/20260830130000_add_transaction_notes/migration.sql` (mudança **aditiva**, aplicada em prod pelo `migrate deploy` no deploy):

```sql
-- CreateTable
CREATE TABLE "TransactionNote" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TransactionNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransactionNote_key_key" ON "TransactionNote"("key");

-- CreateTable
CREATE TABLE "AppState" (
    "id" TEXT NOT NULL,
    "pendingDismissedAt" TIMESTAMP(3),
    CONSTRAINT "AppState_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
```

- [ ] **Step 3: Regenerar o client (sem acessar o DB) e checar tipos**

Run: `cd backend && npx prisma generate && npx tsc --noEmit`
Expected: `prisma generate` regenera o client a partir do schema (não toca no DB) e `tsc` fica sem erros (o client expõe `transactionNote`, `appState`, e `createdAt`).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): TransactionNote, AppState e Transaction.createdAt"
```

---

### Task 2: Helper de identidade da compra (`annotationKey`) + self-check

**Files:**
- Create: `backend/src/modules/transactions/notes.ts`
- Create: `backend/src/modules/transactions/notes.test.ts`

**Interfaces:**
- Produces:
  - `baseLabel(description: string): string` — remove sufixo de parcela `N/M`, normaliza caixa/espaços.
  - `annotationKey(t: { accountId: string; description: string; amount: unknown }): string` — `"accountId|BASE|valor"`.

- [ ] **Step 1: Escrever o self-check (falha primeiro)**

Criar `backend/src/modules/transactions/notes.test.ts`:

```ts
// Rode com: npx tsx src/modules/transactions/notes.test.ts
import assert from "node:assert";
import { annotationKey, baseLabel } from "./notes";

// baseLabel remove "N/M" (com espaço e colado) e normaliza.
assert.equal(baseLabel("Mp*Aliexpress 1/7"), "MP*ALIEXPRESS");
assert.equal(baseLabel("CAETANOENX05/07"), "CAETANOENX");
assert.equal(baseLabel("  spotify  "), "SPOTIFY");

// As 7 parcelas (mesma base + mesmo valor + mesma conta) geram a MESMA key.
const p1 = annotationKey({ accountId: "acc1", description: "Mp*Aliexpress 1/7", amount: 42.9 });
const p7 = annotationKey({ accountId: "acc1", description: "Mp*Aliexpress 7/7", amount: 42.9 });
assert.equal(p1, p7);
assert.equal(p1, "acc1|MP*ALIEXPRESS|42.90");

// Valor diferente = compra distinta = key distinta.
const outro = annotationKey({ accountId: "acc1", description: "Mp*Aliexpress 1/3", amount: 99.9 });
assert.notEqual(p1, outro);

// Conta diferente = key distinta.
const outraConta = annotationKey({ accountId: "acc2", description: "Mp*Aliexpress 1/7", amount: 42.9 });
assert.notEqual(p1, outraConta);

console.log("notes: todos os checks passaram ✓");
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd backend && npx tsx src/modules/transactions/notes.test.ts`
Expected: FAIL (`Cannot find module './notes'`).

- [ ] **Step 3: Implementar o helper**

Criar `backend/src/modules/transactions/notes.ts`:

```ts
// Identidade da compra para ancorar o comentário: "accountId|descrição-base|valor".
// Mesma ideia de agrupamento do commitments.ts (base sem "N/M" + valor da parcela),
// aqui com o accountId incluso — o comentário vale para o grupo todo (parcelas/recorrências).

// "N/M" no fim (ex.: "FOZPANOS 5/12" ou colado "CAETANOENX05/07").
const PARCEL_RE = /(\d{1,2})\/(\d{1,2})\s*$/;

export function baseLabel(description: string): string {
  const stripped = description.replace(PARCEL_RE, "").trim() || description;
  return stripped.toUpperCase().replace(/\s+/g, " ").trim();
}

export function annotationKey(t: { accountId: string; description: string; amount: unknown }): string {
  return `${t.accountId}|${baseLabel(t.description)}|${Number(t.amount).toFixed(2)}`;
}
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `cd backend && npx tsx src/modules/transactions/notes.test.ts`
Expected: `notes: todos os checks passaram ✓`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/transactions/notes.ts backend/src/modules/transactions/notes.test.ts
git commit -m "feat: helper annotationKey (identidade da compra) + self-check"
```

---

### Task 3: Endpoint de nota + `note` no GET /transactions

**Files:**
- Modify: `backend/src/modules/transactions/transaction.controller.ts`

**Interfaces:**
- Consumes: `annotationKey` (Task 2), `prisma` (de `./transaction.repository`).
- Produces:
  - `PUT /transactions/:id/note` body `{ note: string }` → `{ key, note }` (nota vazia apaga).
  - `GET /transactions` passa a incluir `note: string | null` em cada item.

- [ ] **Step 1: Anexar `note` no GET /transactions**

Em `transaction.controller.ts`, substituir o corpo do handler `GET /transactions` (linhas ~18-26) para carregar as notas e injetar:

```ts
  const transactions = await prisma.transaction.findMany({
    where: {
      ...(userId ? { account: { item: { userId } } } : {}),
      ...(date ? { date } : {}),
    },
    orderBy: { date: "desc" },
    include: { account: { include: { item: { select: { institution: true, userId: true } } } } },
  });

  const notes = await prisma.transactionNote.findMany({ select: { key: true, note: true } });
  const noteMap = new Map(notes.map((n) => [n.key, n.note]));
  res.json(transactions.map((t) => ({ ...t, note: noteMap.get(annotationKey(t)) ?? null })));
```

E adicionar o import no topo:

```ts
import { annotationKey } from "./notes";
```

- [ ] **Step 2: Adicionar o endpoint PUT /transactions/:id/note**

No mesmo arquivo, após o handler `patch("/transactions/:id", ...)`, adicionar:

```ts
// Comentário do usuário — ancorado na identidade da compra (vale pro grupo todo:
// parcelas/assinaturas/recorrências). note vazio ("") apaga o comentário do grupo.
transactionsRouter.put("/transactions/:id/note", async (req, res) => {
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const tx = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    select: { accountId: true, description: true, amount: true },
  });
  if (!tx) return res.status(404).json({ error: "Transação não encontrada." });
  const key = annotationKey(tx);
  if (!note) {
    await prisma.transactionNote.deleteMany({ where: { key } });
    return res.json({ key, note: "" });
  }
  const saved = await prisma.transactionNote.upsert({
    where: { key },
    update: { note },
    create: { key, note },
  });
  res.json({ key, note: saved.note });
});
```

- [ ] **Step 3: Verificar compilação**

Run: `cd backend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Checagem manual (servidor local)**

Run (com o backend rodando, `npm run dev`, e um JWT válido em `$T`):
```bash
curl -s -X PUT localhost:3333/transactions/<ID>/note -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d '{"note":"Carregador e cabo"}'
```
Expected: `{"key":"...","note":"Carregador e cabo"}`; e `GET /transactions` passa a trazer `"note":"Carregador e cabo"` em todas as transações do mesmo grupo.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/transactions/transaction.controller.ts
git commit -m "feat: PUT /transactions/:id/note e note no GET /transactions"
```

---

### Task 4: Pendências — GET /transactions/pending e POST /transactions/pending/dismiss

**Files:**
- Modify: `backend/src/modules/transactions/transaction.controller.ts`

**Interfaces:**
- Consumes: `annotationKey` (Task 2), `prisma`.
- Produces:
  - `GET /transactions/pending` → `Transaction[]` (mesma forma do GET /transactions, com `note`), filtrado a candidatas: `createdAt >` marca d'água **e** sem nota.
  - `POST /transactions/pending/dismiss` → `{ pendingDismissedAt: string }`.

- [ ] **Step 1: Adicionar GET /transactions/pending**

Em `transaction.controller.ts`, após o handler de note, adicionar:

```ts
// Candidatas a "não sinalizadas": transações vistas depois da última marca de dispensa
// e ainda sem comentário. O frontend decide o que é "despesa relevante" (expenseValue/
// isInternalMovement) e agrupa por banco — classificação mora lá (fonte única).
transactionsRouter.get("/transactions/pending", async (_req, res) => {
  const state = await prisma.appState.findUnique({ where: { id: "singleton" } });
  const since = state?.pendingDismissedAt ?? new Date(0);
  const transactions = await prisma.transaction.findMany({
    where: { createdAt: { gt: since } },
    orderBy: { date: "desc" },
    include: { account: { include: { item: { select: { institution: true, userId: true } } } } },
  });
  const notes = await prisma.transactionNote.findMany({ select: { key: true } });
  const noted = new Set(notes.map((n) => n.key));
  res.json(
    transactions
      .filter((t) => !noted.has(annotationKey(t)))
      .map((t) => ({ ...t, note: null })),
  );
});
```

- [ ] **Step 2: Adicionar POST /transactions/pending/dismiss**

Em seguida:

```ts
// "Dispensar tudo agora": marca d'água = agora. Zera a contagem atual; transações vistas
// depois (createdAt > marca) voltam a aparecer.
transactionsRouter.post("/transactions/pending/dismiss", async (_req, res) => {
  const now = new Date();
  const state = await prisma.appState.upsert({
    where: { id: "singleton" },
    update: { pendingDismissedAt: now },
    create: { id: "singleton", pendingDismissedAt: now },
  });
  res.json({ pendingDismissedAt: state.pendingDismissedAt });
});
```

- [ ] **Step 3: Verificar compilação**

Run: `cd backend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Checagem manual**

```bash
curl -s localhost:3333/transactions/pending -H "Authorization: Bearer $T" | head -c 300
curl -s -X POST localhost:3333/transactions/pending/dismiss -H "Authorization: Bearer $T"
```
Expected: a 1ª lista candidatas; o POST devolve `{"pendingDismissedAt":"<ISO>"}` e depois dele o `GET /transactions/pending` volta vazio (até chegar transação nova).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/transactions/transaction.controller.ts
git commit -m "feat: GET /transactions/pending e POST dismiss (snapshot por marca d'agua)"
```

---

### Task 5: Frontend api.ts — tipos e métodos

**Files:**
- Modify: `frontend/src/api.ts`

**Interfaces:**
- Consumes: endpoints das Tasks 3-4.
- Produces:
  - `Transaction.note?: string | null`
  - `Subscription.bank: string`
  - `type PendingSummary = { total: number; banks: { institution: string; count: number }[] }`
  - `api.setTransactionNote(id, note)`, `api.pending()`, `api.dismissPending()`

- [ ] **Step 1: Adicionar `note` ao tipo Transaction**

Em `api.ts`, no `export type Transaction = {...}`, adicionar o campo (após `userCategory`):

```ts
  note?: string | null; // comentário livre do usuário (compartilhado pela identidade da compra)
```

- [ ] **Step 2: Adicionar `bank` ao tipo Subscription**

No `export type Subscription = {...}`, adicionar:

```ts
  bank: string; // instituição da cobrança mais recente do grupo
```

- [ ] **Step 3: Adicionar o tipo PendingSummary**

Logo após o tipo `Subscription`:

```ts
// Resumo das transações ainda sem comentário (montado no cliente a partir de /transactions/pending).
export type PendingSummary = { total: number; banks: { institution: string; count: number }[] };
```

- [ ] **Step 4: Adicionar os métodos no objeto `api`**

No objeto `api` (junto de `subscriptions`, `investments`, etc.), adicionar:

```ts
  setTransactionNote: (id: string, note: string) =>
    putReq<{ key: string; note: string }>(`/transactions/${id}/note`, { note }),
  pending: async (): Promise<PendingSummary> => {
    const txs = await get<Transaction[]>("/transactions/pending");
    const relevant = txs.filter((t) => expenseValue(t) > 0 && !isInternalMovement(t) && !t.note);
    const map = new Map<string, number>();
    for (const t of relevant) {
      const inst = t.account.item.institution;
      map.set(inst, (map.get(inst) ?? 0) + 1);
    }
    return {
      total: relevant.length,
      banks: [...map.entries()]
        .map(([institution, count]) => ({ institution, count }))
        .sort((a, b) => b.count - a.count),
    };
  },
  dismissPending: () => post<{ pendingDismissedAt: string }>("/transactions/pending/dismiss", {}),
```

> Nota: os helpers `get`, `putReq` e `post` já existem no `api.ts` (linhas ~237-243). `expenseValue` e `isInternalMovement` já são exportados no mesmo arquivo — usar diretamente, sem import.

- [ ] **Step 5: Verificar compilação**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api.ts
git commit -m "feat(front): tipos e metodos de nota/pendencias/bank de assinatura"
```

---

### Task 6: UI do comentário — modal de detalhe + preview na tabela

**Files:**
- Modify: `frontend/src/components/TransactionTimelineModal.tsx`
- Modify: `frontend/src/components/TransactionsTable.tsx`

**Interfaces:**
- Consumes: `api.setTransactionNote` (Task 5), `Transaction.note` (Task 5).

- [ ] **Step 1: Campo de comentário no modal**

Em `TransactionTimelineModal.tsx`, adicionar estado e handler dentro do componente (após os `useMemo` existentes):

```ts
  const [note, setNote] = useState(origin.note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const saveNote = async () => {
    setSavingNote(true);
    try {
      await api.setTransactionNote(origin.id, note.trim());
    } catch (e) {
      console.error(e);
    } finally {
      setSavingNote(false);
    }
  };
```

E logo abaixo do `<header>` (antes do bloco `{/* Corpo ... */}`), inserir o editor:

```tsx
        {/* Comentário desta compra (vale para todas as parcelas/recorrências do grupo). */}
        <div className="border-b border-border px-5 py-3">
          <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Comentário desta compra
          </label>
          <div className="flex gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={saveNote}
              placeholder="Ex.: Carregador e cabo"
              className="min-h-10 flex-1 rounded-md border border-border/50 bg-card px-3 py-1.5 text-sm"
            />
            <button
              onClick={saveNote}
              disabled={savingNote}
              className="min-h-10 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {savingNote ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </div>
```

Garantir que `api` e `useState` estão importados (o arquivo já importa `useState` e `api`).

- [ ] **Step 2: Preview/ícone na tabela**

Em `TransactionsTable.tsx`, na `<TableCell>` da descrição (linha ~65), substituir por:

```tsx
            <TableCell className="break-words">
              <span className="block">{t.description}</span>
              {t.note ? (
                <span className="mt-0.5 block text-xs italic text-muted-foreground">💬 {t.note}</span>
              ) : (
                expenseValue(t, includeInternal) > 0 && (
                  <span className="mt-0.5 block text-xs text-muted-foreground/60" title="Sem comentário">
                    sem comentário
                  </span>
                )
              )}
            </TableCell>
```

`expenseValue` já está importado no arquivo.

- [ ] **Step 3: Verificar compilação**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Checagem manual**

Abrir uma transação de despesa na tabela → escrever um comentário no modal → salvar → fechar. A linha (e todas as parcelas do grupo) deve exibir "💬 <comentário>". Recarregar mantém.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TransactionTimelineModal.tsx frontend/src/components/TransactionsTable.tsx
git commit -m "feat(front): editar comentario no modal e preview na tabela"
```

---

### Task 7: Tela inicial — badge de pendências + dispensar

**Files:**
- Modify: `frontend/src/views/sections/Resumo.tsx`

**Interfaces:**
- Consumes: `api.pending`, `api.dismissPending`, `PendingSummary` (Task 5).

- [ ] **Step 1: Carregar o resumo de pendências**

Em `Resumo.tsx`, adicionar o import do tipo:

```ts
import { /* ...já existentes... */ type PendingSummary } from "@/api";
```

Dentro do componente `Resumo`, adicionar estado e carga (após os `useState` existentes e o `useEffect` de cards):

```ts
  const [pending, setPending] = useState<PendingSummary | null>(null);
  useEffect(() => {
    api.pending().then(setPending).catch(console.error);
  }, []);

  const dismissPending = async () => {
    try {
      await api.dismissPending();
      setPending({ total: 0, banks: [] });
    } catch (e) {
      console.error(e);
    }
  };
```

- [ ] **Step 2: Renderizar o card de pendências**

Logo após `<DueRemindersBanner />` (dentro do `return`, antes do card de Patrimônio), inserir:

```tsx
      {pending && pending.total > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {pending.total} transaç{pending.total === 1 ? "ão" : "ões"} sem comentário
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pending.banks.map((b) => `${b.institution} ${b.count}`).join(" · ")}
              </p>
            </div>
            <button
              onClick={dismissPending}
              className="min-h-9 shrink-0 rounded-md border border-border/50 px-3 text-sm text-muted-foreground hover:bg-accent"
            >
              Dispensar por agora
            </button>
          </CardContent>
        </Card>
      )}
```

- [ ] **Step 3: Verificar compilação**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Checagem manual**

Na tela inicial, o card mostra a contagem e a quebra por banco (ex.: "Nubank 12 · Itaú 5"). "Dispensar por agora" some com o card; recarregar mantém sumido (até chegar transação nova no próximo sync).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/views/sections/Resumo.tsx
git commit -m "feat(front): badge de transacoes sem comentario + dispensar no Resumo"
```

---

### Task 8: Filtro de banco em "Assinaturas e Recorrências"

**Files:**
- Modify: `backend/src/modules/subscriptions/subscriptions.ts`
- Modify: `backend/src/modules/subscriptions/subscriptions.controller.ts`
- Create: `backend/src/modules/subscriptions/subscriptions.test.ts`
- Modify: `frontend/src/components/SubscriptionsCard.tsx`
- Modify: `frontend/src/views/sections/Gastos.tsx`

**Interfaces:**
- Consumes: `filter.banco` (frontend, via `useDashboard`).
- Produces: `Subscription.bank` (backend + frontend), prop `bank?` no `SubscriptionsCard`.

- [ ] **Step 1: Escrever o self-check (falha primeiro)**

Criar `backend/src/modules/subscriptions/subscriptions.test.ts`:

```ts
// Rode com: npx tsx src/modules/subscriptions/subscriptions.test.ts
import assert from "node:assert";
import { detectSubscriptions } from "./subscriptions";

const now = new Date("2026-08-15T00:00:00Z");
const tx = (amount: number, iso: string, institution: string) => ({
  amount,
  date: new Date(iso),
  description: "Spotify",
  category: "Music streaming",
  accountType: "CREDIT",
  institution,
});

// 3 meses distintos de cobrança fixa → detecta, e bank = instituição da cobrança mais recente.
const subs = detectSubscriptions(
  [tx(21.9, "2026-06-10", "Nubank"), tx(21.9, "2026-07-10", "Nubank"), tx(21.9, "2026-08-10", "Itaú")],
  now,
);
assert.equal(subs.length, 1, "esperava 1 assinatura");
assert.equal(subs[0].bank, "Itaú", `bank esperado Itaú, veio ${subs[0].bank}`);

console.log("subscriptions: todos os checks passaram ✓");
```

- [ ] **Step 2: Rodar e verificar que falha**

Run: `cd backend && npx tsx src/modules/subscriptions/subscriptions.test.ts`
Expected: FAIL (o tipo `Tx` ainda não tem `institution`; `subs[0].bank` é `undefined`).

- [ ] **Step 3: Threadar `institution` no detectSubscriptions**

Em `subscriptions.ts`:

1. No tipo `Tx`, adicionar `institution: string`:
```ts
type Tx = { amount: unknown; date: Date; description: string; category: string; accountType: string; institution: string };
```

2. No tipo `Subscription`, adicionar `bank: string;` (após `label`).

3. No agrupamento (o `groups.get(...).push(...)`), guardar a instituição:
```ts
    (groups.get(key) ?? groups.set(key, []).get(key)!).push({ amount: amt, date: t.date, desc: t.description, institution: t.institution });
```
E ajustar o tipo do array do `Map` para incluir `institution: string`:
```ts
  const groups = new Map<string, { amount: number; date: Date; desc: string; institution: string }[]>();
```

4. No push do resultado, setar `bank` a partir do item mais recente (`last`):
```ts
    subs.push({
      label: last.desc,
      bank: last.institution,
      monthlyAmount: median(inBand.map((i) => i.amount)),
      occurrences: months.length,
      lastDate: last.date.toISOString(),
      months,
    });
```

- [ ] **Step 4: Rodar e verificar que passa**

Run: `cd backend && npx tsx src/modules/subscriptions/subscriptions.test.ts`
Expected: `subscriptions: todos os checks passaram ✓`

- [ ] **Step 5: Passar `institution` no controller**

Em `subscriptions.controller.ts`, incluir a instituição no `select` e no map:

```ts
    select: {
      amount: true,
      date: true,
      description: true,
      category: true,
      account: { select: { type: true, item: { select: { institution: true } } } },
    },
  });
  const subs = detectSubscriptions(
    txs.map((t) => ({
      amount: t.amount,
      date: t.date,
      description: t.description,
      category: t.category,
      accountType: t.account.type,
      institution: t.account.item.institution,
    })),
    now,
  );
```

- [ ] **Step 6: Filtro de banco no SubscriptionsCard**

Em `SubscriptionsCard.tsx`:

1. Assinatura do componente aceita `bank`:
```tsx
export function SubscriptionsCard({ bank }: { bank?: string }) {
```
2. Filtrar antes do early-return:
```tsx
  const shown = bank ? items.filter((s) => s.bank === bank) : items;
  if (shown.length === 0) return null;
  const total = shown.reduce((s, x) => s + x.monthlyAmount, 0);
```
3. Trocar o `.map` de `items` por `shown`:
```tsx
          {shown.map((s, i) => (
```

- [ ] **Step 7: Passar o filtro no Gastos**

Em `frontend/src/views/sections/Gastos.tsx`, trocar `<SubscriptionsCard />` por:
```tsx
      <SubscriptionsCard bank={filter.banco} />
```
(`filter` já vem do `useDashboard` na linha 11.)

- [ ] **Step 8: Verificar compilação (backend + frontend)**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/subscriptions frontend/src/components/SubscriptionsCard.tsx frontend/src/views/sections/Gastos.tsx
git commit -m "feat: bank em Subscription + filtro de banco no card de Assinaturas"
```

---

## Encerramento

- [ ] **Rodar todos os self-checks do backend**

Run: `cd backend && npx tsx src/modules/transactions/notes.test.ts && npx tsx src/modules/subscriptions/subscriptions.test.ts && npx tsx src/modules/cards/openInvoice.test.ts`
Expected: todos "✓".

- [ ] **Typecheck final dos dois lados**

Run: `cd backend && npx tsc --noEmit && cd ../frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Abrir PR** de `feat/transaction-notes` → `master` (não mergear sem avaliação, conforme o padrão do usuário).
