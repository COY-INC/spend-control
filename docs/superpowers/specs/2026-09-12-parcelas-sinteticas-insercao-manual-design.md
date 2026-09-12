# Projeção sintética + inserção manual de parcelas de cartão

Data: 2026-09-12

## Problema

Bancos como **Bradesco** e **Mercado Pago** (via MeuPluggy) só registram a parcela
que já entrou na fatura — não projetam as parcelas futuras como transações datadas
à frente. Por isso não aparecem em "Compromissos futuros" (que vive de
`Transaction.date > now` em contas CREDIT), mesmo tendo compras parceladas em
andamento. Nubank/Itaú projetam, então aparecem.

Confirmado no banco de prod (2026-09-12): Bradesco `futuras=0`, `parceladas=58`;
Mercado Pago `futuras=0`, `parceladas=13`; Nubank/Itaú com `parceladas_futuras > 0`.

## Objetivo

1. Gerar **sugestões** de parcelas futuras a partir dos dados reais, sem exibi-las
   automaticamente em Compromissos.
2. Uma UI de **inserção manual** onde as sugestões aparecem pré-preenchidas e o
   usuário pode **aceitar, recusar ou adaptar** antes de persistir.
3. Parcelas aceitas viram **linhas reais de `Transaction`** (decisão do usuário),
   integrando em Compromissos/lista/timeline como as dos outros bancos.

## Decisões (brainstorm)

- Projeção **não** entra em Compromissos sozinha; só via aceite.
- Escopo: **só parcelas futuras de cartão** (não transação genérica).
- Armazenamento: **linhas reais de `Transaction`** com flag `manual`.
- Detecção de sugestões **bank-agnostic** (não hardcoda Bradesco/MP).
- Recusar é **persistido** (não reaparece a cada scan).

## Data model (1 migration)

- `Transaction.manual Boolean @default(false)` — marca linhas criadas pelo usuário.
  `pluggyTransactionId` fica `null`. Demais colunas reusadas (`amount`, `date`,
  `description`, `installmentNumber`, `totalInstallments`, `cardNumber`, `accountId`).
- `DismissedSuggestion { id, key String @unique, at DateTime @default(now()) }` —
  espelha `AnticipatedInstallment`. `key` = identidade da compra.

Identidade da compra (`key`): `accountId | baseLabel | installmentAmount(2dp) | totalInstallments`.

## Suggestion engine — `GET /commitments/suggestions?userId=`

Varre compras parceladas reais em contas CREDIT. Agrupa por
`accountId | baseLabel | installmentAmount`, usando `parcelInfo` (metadata `N/M`
ou fallback texto). Para cada grupo:

- `remaining = M − maxObservedN`.
- Emite sugestão **só se**: `remaining > 0` **e** essas parcelas restantes ainda
  **não** existem como linhas futuras (reais ou manuais) **e** `key` não está em
  `DismissedSuggestion`.
- Schedule projetado: uma entrada por parcela restante, mesmo dia do mês da última
  postagem, `+1 mês` por parcela, mesmo valor.

Resposta: `{ key, accountId, bank, cardNumber, label, installmentAmount,
totalInstallments, nextInstallmentNumber, installments: [{ n, date, amount }] }`.

**ponytail (teto):** projeção linear — mesmo valor, cadência mensal. Não modela
juros/IOF/câmbio nem antecipação feita fora do app. É pra isso que existe "adaptar".

## Accept / manual insert — `POST /commitments/manual`

Body: `{ accountId, label, totalInstallments, installments: [{ n, date, amount }] }`.
Cria uma `Transaction` `manual: true` por entrada: datada no futuro,
`installmentNumber = n`, `totalInstallments`, `cardNumber` da conta,
`pluggyTransactionId = null`, `category` vazia/`""`, `userCategories = []`.

- **Recusar** — `POST /commitments/suggestions/dismiss { key }` → grava `DismissedSuggestion`.
- **Apagar parcela manual** — `DELETE /commitments/manual/:id` (só onde `manual = true`).

## Reconciliação (evita double-count)

Em `upsertTransactions`, após upsert das tx reais de um item: para cada linha
`manual` futura nas contas do item, apaga se já existe tx real (não-manual) com
identidade equivalente:

- Primário: mesmo `accountId` + `totalInstallments` + `installmentNumber`.
- Fallback (bancos que removem `N/M` do texto, ex. MP): mesmo `accountId` +
  `baseLabel` + valor + mesmo `YYYY-MM`.

**ponytail (teto):** sobreposição breve possível se a data projetada ≠ data real de
postagem dentro do mês; usuário pode apagar manualmente.

## Frontend

Estende a área de Compromissos (`FutureCommitmentsCard` / `Cartoes.tsx`):

- "Sugestões de parcelas": lista as sugestões agrupadas por compra, cada uma com
  **Aceitar / Recusar / Adaptar** (adaptar abre linha editável: valor, nº de parcelas,
  primeiro mês).
- Botão "Adicionar parcela manual" para entrada do zero.
- Linhas manuais em Compromissos ganham um selo "manual" pra distinguir.

## Testing (assert, convenção do projeto)

- Suggestion engine: cálculo de `remaining`, detecção de futuras faltando, filtro de
  dismissal.
- Reconciliação: linha manual removida quando identidade real chega; match fallback.
- Accept endpoint: shape das linhas criadas.

Sem framework.

## Fora de escopo (YAGNI)

- Entradas manuais recorrentes/não-parceladas.
- Editar linha aceita in-place (apagar + re-adicionar cobre).
