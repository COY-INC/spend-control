# Antecipar parcela de cartão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar manualmente uma parcela de cartão como antecipada, refletindo o adiantamento (data efetiva → ciclo aberto) em faturas, compromissos e gastos.

**Architecture:** Uma flag durável por identidade da parcela (tabela `AnticipatedInstallment`) e um helper puro `applyAnticipations` que sobrescreve a data (`date → at`) na leitura — sem tocar na coluna `date` do banco (preserva o dedup do sync). O override é aplicado em `GET /transactions`, no controller de `cards` e no de `commitments`. A marcação é uma ação no `TransactionTimelineModal`.

**Tech Stack:** Node/Express/TypeScript, Prisma/PostgreSQL, React/Vite. Testes no estilo do repo: `assert` + `npx tsx <arquivo>` (sem framework).

## Global Constraints

- Workflow: branch + PR, nunca push direto no master. Trabalhar na branch `feat/antecipar-parcela` (já existe, com o spec).
- Identidade da parcela: `key = accountId | baseLabel(descrição sem N/M) | "N/M" | valor.toFixed(2)`.
- `baseLabel` é o do backend (`notes.ts`) — NÃO alterar (mudaria as keys de notas existentes).
- Override na leitura só; a coluna `date` no banco nunca muda.
- Endpoint de marcação é um POST toggle (`{ anticipated: boolean }`) — sem helper DELETE novo no front.
- Migração sobe sozinha no deploy (`prisma migrate deploy` no build do backend).

---

### Task 1: Tabela `AnticipatedInstallment` (schema + migração)

**Files:**
- Modify: `backend/prisma/schema.prisma` (após o model `TransactionNote`, ~linha 94)
- Create: `backend/prisma/migrations/20260901120000_add_anticipated_installment/migration.sql`

**Interfaces:**
- Produces: model Prisma `AnticipatedInstallment { id, key @unique, at }` e `prisma.anticipatedInstallment` no client.

- [ ] **Step 1: Adicionar o model ao schema**

Em `backend/prisma/schema.prisma`, logo após o fechamento do model `TransactionNote`:

```prisma
// Parcela de cartão marcada MANUALMENTE como antecipada. O app trata a data efetiva da
// parcela como `at` (momento da antecipação), jogando-a no ciclo aberto. Ancorada na
// IDENTIDADE da parcela (não na linha volátil), pra sobreviver ao churn da MeuPluggy.
model AnticipatedInstallment {
  id  String   @id @default(cuid())
  key String   @unique // accountId | base | "N/M" | valor
  at  DateTime @default(now())
}
```

- [ ] **Step 2: Gerar a migração (usar DATABASE_URL de DEV, não prod)**

Run: `cd backend && npx prisma migrate dev --name add_anticipated_installment`
Expected: cria a pasta de migração, aplica no banco de dev e regenera o client. O SQL gerado deve ser equivalente a:

```sql
-- CreateTable
CREATE TABLE "AnticipatedInstallment" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnticipatedInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnticipatedInstallment_key_key" ON "AnticipatedInstallment"("key");
```

Se não houver banco de dev à mão, criar a pasta/arquivo `migration.sql` acima manualmente e rodar `npx prisma generate` (o `migrate deploy` do build aplica no deploy).

- [ ] **Step 3: Verificar que o client compila com o novo model**

Run: `cd backend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: tabela AnticipatedInstallment (parcela antecipada)"
```

---

### Task 2: Módulo `anticipation.ts` (identidade + override) + teste

**Files:**
- Create: `backend/src/modules/transactions/anticipation.ts`
- Create: `backend/src/modules/transactions/anticipation.test.ts`

**Interfaces:**
- Consumes: `baseLabel` de `./notes`.
- Produces:
  - `anticipationKey(tx: { accountId: string; description: string; amount: unknown }): string | null`
  - `applyAnticipations<T extends { accountId: string; description: string; amount: unknown; date: Date }>(txs: T[], flags: Map<string, Date>): T[]`

- [ ] **Step 1: Escrever o teste que falha**

Create `backend/src/modules/transactions/anticipation.test.ts`:

```ts
// Rode com: npx tsx src/modules/transactions/anticipation.test.ts
import assert from "node:assert";
import { anticipationKey, applyAnticipations } from "./anticipation";

const tx = (description: string, amount: number, accountId = "a1") => ({ accountId, description, amount });

// Chave: parcela específica (N/M) + valor; distingue 8/8 de 7/8 e compras concorrentes por valor.
assert.equal(anticipationKey(tx("Tap Air Port0018067078 8/8", 37.94)), "a1|TAP AIR PORT0018067078|8/8|37.94");
assert.notEqual(
  anticipationKey(tx("Tap Air Port 8/8", 37.94)),
  anticipationKey(tx("Tap Air Port 7/8", 37.94)),
  "8/8 difere de 7/8",
);
assert.notEqual(
  anticipationKey(tx("Mp *Aliexpress 4/4", 32.22)),
  anticipationKey(tx("Mp *Aliexpress 4/4", 30.77)),
  "compras concorrentes /4 separadas por valor",
);
assert.equal(anticipationKey(tx("Spotify", 21.9)), null, "sem N/M → sem chave");

// applyAnticipations: só a parcela marcada assume `at`; demais intactas.
const at = new Date("2026-09-01T12:00:00Z");
const oct = new Date("2026-10-02T00:00:00Z");
const rows = [
  { ...tx("Tap Air Port 8/8", 37.94), date: oct },
  { ...tx("Tap Air Port 7/8", 37.94), date: new Date("2026-08-27T00:00:00Z") },
  { ...tx("Spotify", 21.9), date: oct },
];
const flags = new Map([[anticipationKey(rows[0])!, at]]);
const out = applyAnticipations(rows, flags);
assert.equal(+out[0].date, +at, "8/8 marcada vira `at`");
assert.equal(+out[1].date, +new Date("2026-08-27T00:00:00Z"), "7/8 intacta");
assert.equal(+out[2].date, +oct, "sem N/M intacta");
assert.equal(applyAnticipations(rows, new Map()), rows, "sem flags devolve o mesmo array");

console.log("anticipation: todos os checks passaram ✓");
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `cd backend && npx tsx src/modules/transactions/anticipation.test.ts`
Expected: FAIL (`Cannot find module './anticipation'`).

- [ ] **Step 3: Implementar o módulo**

Create `backend/src/modules/transactions/anticipation.ts`:

```ts
import { baseLabel } from "./notes";

// "N/M" no fim da descrição (mesma regex de notes.ts/commitments.ts).
const PARCEL_RE = /(\d{1,2})\/(\d{1,2})\s*$/;

type TxIdent = { accountId: string; description: string; amount: unknown };

// Identidade da parcela ESPECÍFICA antecipada: conta | base | "N/M" | valor.
// null se a descrição não tem "N/M" (não é parcela antecipável).
export function anticipationKey(tx: TxIdent): string | null {
  const m = PARCEL_RE.exec(tx.description);
  if (!m) return null;
  return `${tx.accountId}|${baseLabel(tx.description)}|${m[1]}/${m[2]}|${Number(tx.amount).toFixed(2)}`;
}

// Sobrescreve a data das parcelas marcadas (date -> at). Puro; NÃO altera o banco.
export function applyAnticipations<T extends TxIdent & { date: Date }>(
  txs: T[],
  flags: Map<string, Date>,
): T[] {
  if (flags.size === 0) return txs;
  return txs.map((t) => {
    const k = anticipationKey(t);
    const at = k ? flags.get(k) : undefined;
    return at ? { ...t, date: at } : t;
  });
}
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `cd backend && npx tsx src/modules/transactions/anticipation.test.ts`
Expected: `anticipation: todos os checks passaram ✓`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/transactions/anticipation.ts backend/src/modules/transactions/anticipation.test.ts
git commit -m "feat: anticipationKey + applyAnticipations (override de data por identidade)"
```

---

### Task 3: Endpoint de marcação + override no `GET /transactions`

**Files:**
- Modify: `backend/src/modules/transactions/transaction.controller.ts`

**Interfaces:**
- Consumes: `anticipationKey`, `applyAnticipations` de `./anticipation`; `findNote` de `./notes`.
- Produces:
  - `POST /transactions/:id/anticipate` body `{ anticipated: boolean }` → `{ key, anticipated }`.
  - `GET /transactions` passa a devolver cada transação com `date` sobrescrita e um campo `anticipated: boolean`.

- [ ] **Step 1: Importar o módulo de antecipação**

Em `transaction.controller.ts`, adicionar ao import existente de `./notes` um import novo:

```ts
import { anticipationKey, applyAnticipations } from "./anticipation";
```

- [ ] **Step 2: Reescrever o handler `GET /transactions` (override + recorte por mês em memória)**

O recorte por mês precisa ser pela data JÁ sobrescrita — senão uma parcela antecipada (data real
em outubro, efetiva em setembro) apareceria em outubro e sumiria de setembro. Então: buscar sem
filtro de data no banco, sobrescrever, e filtrar/ordenar em memória. Substituir o handler inteiro
(atual `transactionsRouter.get("/transactions", …)`, ~linhas 9-31) por:

```ts
transactionsRouter.get("/transactions", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const month = Number(req.query.month); // 1-12
  const year = Number(req.query.year);
  const period = month >= 1 && month <= 12 && year > 0;

  // Sem filtro de data no banco: a antecipação sobrescreve a data efetiva, e o recorte por mês
  // é feito depois, pela data já sobrescrita. (ponytail: carrega tudo do usuário por request —
  // ok para o volume pessoal; paginar/estreitar só se crescer muito.)
  const transactions = await prisma.transaction.findMany({
    where: { ...(userId ? { account: { item: { userId } } } : {}) },
    include: { account: { include: { item: { select: { institution: true, userId: true } } } } },
  });

  const notes = await prisma.transactionNote.findMany({ select: { key: true, note: true } });
  const flags = new Map(
    (await prisma.anticipatedInstallment.findMany({ select: { key: true, at: true } })).map(
      (f) => [f.key, f.at] as const,
    ),
  );

  // Sobrescreve a data das parcelas antecipadas; recorta por mês (UTC) pela data efetiva; ordena.
  const withDates = applyAnticipations(transactions, flags);
  const start = period ? new Date(Date.UTC(year, month - 1, 1)) : null;
  const end = period ? new Date(Date.UTC(year, month, 1)) : null;
  const rows = (start && end ? withDates.filter((t) => t.date >= start && t.date < end) : withDates)
    .sort((a, b) => +b.date - +a.date);

  // Nota casa por tolerância (±10¢); `anticipated` = a parcela está marcada (independe da data).
  res.json(
    rows.map((t) => ({
      ...t,
      note: findNote(notes, t),
      anticipated: flags.has(anticipationKey(t) ?? ""),
    })),
  );
});
```

- [ ] **Step 3: Adicionar o endpoint de marcação (toggle)**

No fim de `transaction.controller.ts` (antes de nada, pode ser após o handler de `/note`):

```ts
// Marca/desmarca uma parcela como antecipada (paga adiantado, para o ciclo aberto).
// anticipated=false remove a marca. Ancora na IDENTIDADE da parcela (sobrevive ao churn).
transactionsRouter.post("/transactions/:id/anticipate", async (req, res) => {
  const anticipated = req.body?.anticipated === true;
  const tx = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    select: { accountId: true, description: true, amount: true },
  });
  if (!tx) return res.status(404).json({ error: "Transação não encontrada." });
  const key = anticipationKey(tx);
  if (!key) return res.status(400).json({ error: "Transação não é uma parcela (sem N/M)." });
  if (!anticipated) {
    await prisma.anticipatedInstallment.deleteMany({ where: { key } });
    return res.json({ key, anticipated: false });
  }
  await prisma.anticipatedInstallment.upsert({ where: { key }, update: {}, create: { key } });
  res.json({ key, anticipated: true });
});
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/transactions/transaction.controller.ts
git commit -m "feat: endpoint /anticipate + override de data no GET /transactions"
```

---

### Task 4: Override em `cards` e `commitments`

**Files:**
- Modify: `backend/src/modules/cards/cards.controller.ts`
- Modify: `backend/src/modules/commitments/commitments.controller.ts`

**Interfaces:**
- Consumes: `applyAnticipations` de `../transactions/anticipation`.

- [ ] **Step 1: cards — carregar flags e sobrescrever antes de `computeInvoices`**

Em `cards.controller.ts`, adicionar o import:

```ts
import { applyAnticipations } from "../transactions/anticipation";
```

Depois do `findMany` de `accounts` e antes do `perBank`, carregar as flags:

```ts
  const flags = new Map(
    (await prisma.anticipatedInstallment.findMany({ select: { key: true, at: true } })).map(
      (f) => [f.key, f.at] as const,
    ),
  );
```

Trocar a chamada de `computeInvoices` para usar as transações com data sobrescrita (as
transações do card não trazem `accountId` no select — injetar `a.id`):

```ts
    const txs = applyAnticipations(
      a.transactions.map((t) => ({ ...t, accountId: a.id })),
      flags,
    );
    const { open, closed, future, history } = computeInvoices(txs, a.bills, Number(a.balance));
```

- [ ] **Step 2: commitments — sobrescrever antes de `buildCommitments`**

Em `commitments.controller.ts`, adicionar o import:

```ts
import { applyAnticipations } from "../transactions/anticipation";
```

Trocar a construção de `plans`:

```ts
  const flags = new Map(
    (await prisma.anticipatedInstallment.findMany({ select: { key: true, at: true } })).map(
      (f) => [f.key, f.at] as const,
    ),
  );
  const mapped = future.map((t) => ({
    amount: t.amount,
    date: t.date,
    description: t.description,
    accountId: t.accountId,
    institution: t.account.item.institution,
  }));
  const plans = buildCommitments(applyAnticipations(mapped, flags));
  res.json(plans);
```

(Uma parcela antecipada assume `at` ≤ agora; `buildCommitments` filtra `date > now`, então ela sai de compromissos automaticamente.)

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/cards/cards.controller.ts backend/src/modules/commitments/commitments.controller.ts
git commit -m "feat: aplica antecipacao em faturas e compromissos"
```

---

### Task 5: Frontend — ação "Antecipei" no modal + selo

**Files:**
- Modify: `frontend/src/api.ts` (tipo `Transaction` ~linha 16; objeto `api` ~linha 314)
- Modify: `frontend/src/components/TransactionTimelineModal.tsx`

**Interfaces:**
- Consumes: `POST /transactions/:id/anticipate`.
- Produces: `api.setAnticipated(id, anticipated)`; campo `Transaction.anticipated`.

- [ ] **Step 1: Adicionar o campo ao tipo e o método na api**

Em `frontend/src/api.ts`, no tipo `Transaction`, após `note?`:

```ts
  anticipated?: boolean; // parcela marcada como antecipada (data efetiva movida p/ o ciclo aberto)
```

No objeto `api`, após `setTransactionNote`:

```ts
  setAnticipated: (id: string, anticipated: boolean) =>
    post<{ key: string; anticipated: boolean }>(`/transactions/${id}/anticipate`, { anticipated }),
```

- [ ] **Step 2: Handler + refetch no modal**

Em `TransactionTimelineModal.tsx`, dentro do componente, após `saveNote`:

```ts
  const [antBusy, setAntBusy] = useState<string | null>(null);
  const toggleAnticipated = async (t: Transaction) => {
    setAntBusy(t.id);
    try {
      await api.setAnticipated(t.id, !t.anticipated);
      const fresh = await api.transactions(userId);
      setAll(fresh);
      onSaved?.(); // atualiza a tabela/telas por baixo
    } catch (e) {
      console.error(e);
    } finally {
      setAntBusy(null);
    }
  };
```

- [ ] **Step 3: Renderizar a ação/selo nas parcelas**

Em `TransactionTimelineModal.tsx`, no corpo da timeline, dentro do bloco de conteúdo de cada
linha (logo após o `<div className="mt-0.5 text-xs text-muted-foreground">…</div>`), adicionar —
só no modo parcelamento (`parcela`) e para parcelas futuras ou já antecipadas:

```tsx
                        {parcela && (t.anticipated || new Date(t.date) > new Date()) && (
                          <button
                            onClick={() => toggleAnticipated(t)}
                            disabled={antBusy === t.id}
                            className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 ${
                              t.anticipated
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                : "border border-border/60 text-muted-foreground hover:bg-accent"
                            }`}
                          >
                            {antBusy === t.id
                              ? "…"
                              : t.anticipated
                                ? "✓ antecipada · desfazer"
                                : "Antecipei esta parcela"}
                          </button>
                        )}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/components/TransactionTimelineModal.tsx
git commit -m "feat: acao 'Antecipei esta parcela' + selo no modal"
```

---

### Task 6: Verificação manual (end-to-end)

**Files:** nenhum (verificação).

- [ ] **Step 1: Subir backend + frontend**

Run: `cd backend && npm run dev` (num terminal) e `cd frontend && npm run dev` (noutro).

- [ ] **Step 2: Fluxo**

Abrir uma parcela **futura** de cartão no modal (ex.: `TAP AIR 8/8` de outubro). Clicar
**"Antecipei esta parcela"**. Verificar:
- a parcela vira **paga** (Total/Pago/Falta ajusta) e ganha o selo "✓ antecipada";
- em **Cartões**, ela entra na **fatura aberta** e sai da fatura futura de outubro;
- em **Compromissos**, o parcelamento perde essa parcela;
- **desfazer** volta tudo ao estado anterior.

- [ ] **Step 3: Abrir PR**

```bash
git push -u origin feat/antecipar-parcela
gh pr create --base master --title "feat: antecipar parcela de cartao" --body-file <corpo>
```

---

## Notas de verificação do plano

- **Cobertura do spec:** tabela (T1) ✓; identidade+override (T2) ✓; endpoints+lista (T3) ✓; faturas+compromissos (T4) ✓; UI+selo (T5) ✓; teste do módulo puro (T2) ✓; double-count é ceiling documentado (sem tarefa — nada a fazer salvo observar).
- **Escopo "em tudo":** o override no `GET /transactions` cobre Gastos/Resumo/Transações/orçamento (todos derivam dessa lista no front); cards e commitments cobrem faturas e compromissos.
- **`baseLabel` inalterado** — as keys de `TransactionNote` existentes continuam válidas.
