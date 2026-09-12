# Antecipar parcela de cartão — design

## Contexto e problema

Quando o usuário **antecipa parcelas** no Nubank (paga parcelas futuras adiantado, para a
fatura aberta atual), o feed do Open Finance (via MeuPluggy) **não re-data nem remove** as
parcelas antecipadas: elas continuam datadas no mês original (ex.: `TAP AIR 8/8` em 02/10,
`Mp *Aliexpress 4/4` em 18/10), e só aparece um pequeno `Desconto Antecipação` (−0,27 / −0,32)
no ciclo atual.

Como `computeInvoices` (`openInvoice.ts`) e `buildCommitments` (`commitments.ts`) distribuem
transações **por data**, essas parcelas caem — corretamente para o dado recebido — nas faturas
**futuras** e em **compromissos**, e não na **fatura aberta**. O usuário, que sabe que já as
pagou, não as vê onde esperava.

Investigação (banco de prod, 2026-09-01): 2 syncs frescos + refresh manual no dashboard do
MeuPluggy não trouxeram mudança — o feed está estável no snapshot de 30/08. O app reflete
fielmente um dado que não muda. Conclusão: para refletir a antecipação de forma confiável, o
app precisa de uma **marcação manual** (o usuário sabe o que antecipou; inferir a partir do
desconto de centavos é ambíguo e frágil).

Decisão de escopo (aprovada): o adiantamento reflete **em todas as telas** (faturas,
compromissos, Gastos do mês, Transações), não só nas faturas.

## Solução

Marcar uma parcela futura como **antecipada** faz o app tratar a **data efetiva** dela como o
momento da antecipação (dentro do ciclo aberto). Um único override de data resolve as três
superfícies de uma vez, porque todas binam por data:

- entra na **fatura aberta** (o `Desconto Antecipação` já está no feed → líquido bate);
- sai da **fatura futura** do mês original;
- sai de **compromissos** (uma parcela a menos a vencer).

### 1. Persistência — tabela `AnticipatedInstallment`

Flag durável por **identidade da parcela**, no mesmo espírito do `TransactionNote` (sobrevive
ao churn de `pluggyTransactionId` da MeuPluggy):

```prisma
model AnticipatedInstallment {
  id  String   @id @default(cuid())
  key String   @unique
  at  DateTime @default(now()) // momento da antecipação = data efetiva da parcela
}
```

- `key = accountId | base(sem N/M) | "N/M" | valor.toFixed(2)`
  - `base` sem o sufixo `N/M` (mesmo `baseLabel` do backend);
  - `"N/M"` (ex.: `"8/8"`) identifica **a parcela específica** dentro da compra;
  - `valor` separa duas compras concorrentes de mesmo estabelecimento e mesmo M
    (ex.: dois AliExpress `/4`, 32,22 vs 30,77). O valor de uma parcela específica é estável
    entre syncs (o drift que existe é *entre* parcelas distintas, não na mesma linha).
- `at` = quando o usuário marcou ≈ quando antecipou. É a data efetiva aplicada no override.

### 2. Override na leitura — `applyAnticipations(txs)`

Helper puro que, dado o conjunto de flags, devolve as transações com `date → at` para as
parcelas marcadas (demais intactas). A **coluna `date` no banco não muda** — só a leitura é
sobrescrita. Isso preserva a de-duplicação do sync por conteúdo (que casa por
`accountId + descrição + dia + valor`), evitando duplicação no próximo sync.

`anticipationKey(tx)` deriva a mesma `key` a partir de uma transação; se a descrição não tem
`N/M`, a transação não é parcela antecipável e nunca casa.

Aplicado nos pontos de leitura:
- `GET /transactions` (cobre Gastos/Resumo/Transações/orçamento — que derivam dessa lista);
- controller de `cards` (antes de `computeInvoices`);
- controller de `commitments` (antes de `buildCommitments`).

`subscriptions` já exclui parcelamentos (`PARCEL_RE`), então é no-op lá.

### 3. Marcação — no `TransactionTimelineModal`

Cada parcela **futura** do grupo ganha a ação **"Antecipei esta parcela"**:
- marcar → `POST /transactions/:id/anticipate` (busca a tx por id, calcula `key`, upsert da flag com `at = now`);
- desfazer → `DELETE /transactions/:id/anticipate` (remove a flag).

Depois do reload, a parcela vem datada no mês da antecipação → cai naturalmente em **paga** no
Total/Pago/Falta (a lógica por data existente cuida disso, sem código especial). Parcela
antecipada recebe um selo visual "antecipada".

`tx.id` é o cuid estável nosso (não o id churn da Pluggy), então o endpoint por id é seguro.

### 4. Double-count — ceiling

- O `Desconto Antecipação` já está contado no ciclo aberto → o líquido fecha (37,94 − 0,27).
- Se o feed um dia re-datar a parcela para o ciclo aberto: é a **mesma linha**; o override só
  reforça a data de antecipação → sem dobra.
- Risco residual: o feed criar uma **cobrança nova de reforço** no ciclo aberto (não observado
  em prod). Mitigação parcial: o dedup por `dia|valor|descrição` de `itemsInWindow` tende a
  colapsar linhas idênticas no mesmo dia. Marcar como `ponytail:` e subir só se aparecer.

### 5. Reversibilidade / re-check do feed (em paralelo)

O feed continua sendo re-checado. Se o Nubank eventualmente expuser a antecipação corretamente,
a flag manual e o override permanecem coerentes (mesma linha, mesmo ciclo). Desmarcar remove a
flag e a parcela volta à data real do feed.

## Componentes

| Camada | Arquivo | Mudança |
|---|---|---|
| Schema | `backend/prisma/schema.prisma` + migração | tabela `AnticipatedInstallment` |
| Identidade | `backend/src/modules/transactions/notes.ts` (ou módulo irmão) | `anticipationKey(tx)` reusa `baseLabel` |
| Override | novo helper `applyAnticipations(txs, flags)` | puro, testável |
| Endpoints | `transaction.controller.ts` | `POST`/`DELETE /transactions/:id/anticipate` |
| Leituras | `transaction.controller` (list), `cards` controller, `commitments` controller | chamam `applyAnticipations` |
| Frontend | `api.ts`, `TransactionTimelineModal.tsx` | métodos + ação "Antecipei" + selo |

## Testes

Self-check no estilo do repo (assert + `npx tsx`):
- `anticipationKey`: `8/8` distinta de `7/8`; duas compras `/4` separadas por valor; descrição
  sem `N/M` → sem key.
- `applyAnticipations`: parcela marcada assume `at`; não-marcada intacta; tx sem `N/M` intacta.

## Fora de escopo (YAGNI)

- Inferência automática a partir do `Desconto Antecipação` (ambígua, frágil).
- Tolerância de centavos na `key` (o valor de uma parcela específica é estável; não precisa).
- Deleção de transações sumidas do feed no sync (assunto separado).
