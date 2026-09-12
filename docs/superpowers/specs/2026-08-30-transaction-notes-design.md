# Comentários de transação + pendências + filtro de assinaturas

**Data:** 2026-08-30
**Status:** aprovado (design)

## Contexto e objetivo

Quatro melhorias no fin-dash, giradas em torno de anotar transações com um comentário livre:

1. Cada transação pode receber um **comentário** livre (ex.: "Mp*Aliexpress" → "Carregador e cabo"; "Pix enviado para fulano" → "Pagamento da faxina").
2. O comentário **persiste entre parcelas, assinaturas e recorrências** da mesma compra.
3. A **tela inicial** indica quantas transações ainda não têm comentário e de quais bancos, com um botão para **dispensar** a contagem atual.
4. O card **"Assinaturas e Recorrências"** ganha filtro por banco.

## Decisões (do brainstorming)

- **Agrupamento do comentário:** por **identidade da compra** = `conta + descrição-base + valor`. Mesmo critério do `commitments.ts`. As parcelas de uma compra (mesma base+valor) e as cobranças de uma recorrência de valor fixo compartilham o comentário; uma compra distinta no mesmo estabelecimento com valor diferente tem comentário próprio.
- **Escopo das "não sinalizadas":** só **despesas relevantes** — saídas de conta + compras de cartão, excluindo movimentações internas (transferências entre contas próprias, investimentos, pagamento de fatura, reservas). Reaproveita `expenseValue`/`isInternalMovement` do frontend.
- **Dispensar:** **snapshot** ("dispensar tudo agora"). Zera a contagem atual; transações futuras (inclusive novas do mesmo lugar) voltam a aparecer.
- **UI do comentário:** no **modal de detalhe** da transação. Na tabela, preview sutil quando há nota e ícone "sem comentário" quando é despesa pendente.
- **Identidade inclui `accountId`** (espelha `commitments`): recorrência cobrada em contas diferentes não compartilha comentário — caso raro, aceito.
- **Pendências são globais (casal)**, não por perfil logado, na v1.

## Arquitetura

O comentário **não** mora na linha da `Transaction` (que sofre churn de `pluggyTransactionId` a cada sync da MeuPluggy e é recriada/atualizada por conteúdo). Mora numa tabela própria indexada pela **identidade da compra**, de modo que:

- sobrevive ao churn de id (a chave é derivada da descrição + valor, não do id volátil);
- alcança automaticamente parcelas/cobranças **futuras** que ainda nem sincronizaram;
- um único registro serve às N transações do grupo.

### Identidade da compra (annotation key)

```
key = `${accountId}|${baseLabel(description)}|${amount.toFixed(2)}`
```

- `baseLabel(description)`: remove o sufixo de parcela `N/M` (`/(\d{1,2})\/(\d{1,2})\s*$/`), faz `toUpperCase()`, colapsa espaços e `trim()`. Mesma normalização-base do `commitments.ts` (a ser extraída para um helper compartilhado no backend).
- `amount`: valor da transação (a parcela, no caso de parcelamento — todas têm o mesmo valor).

Helper único no backend (`transaction.repository` ou um `notes` util) reutilizado pelo endpoint de nota e pelo join do `GET /transactions`.

## Modelo de dados (Prisma)

```prisma
model TransactionNote {
  id        String   @id @default(cuid())
  key       String   @unique   // identidade da compra: "accountId|BASE|valor"
  note      String
  updatedAt DateTime @updatedAt
}

model AppState {                 // linha única (id fixo "singleton")
  id                 String    @id @default("singleton")
  pendingDismissedAt DateTime?  // marca d'água do "dispensar tudo agora"
}

// Alteração em Transaction:
model Transaction {
  // ...campos atuais...
  createdAt DateTime @default(now())  // quando a transação foi vista pela 1ª vez (no sync)
}
```

### Por que `createdAt`

"Pendente" = despesa **sem nota** e com `createdAt > pendingDismissedAt`. Usar `createdAt` (hora do primeiro insert, no sync) em vez de `date` (data da compra) faz o snapshot funcionar mesmo com **sync atrasado**: uma compra antiga que só chega hoje entra com `createdAt` = agora (> marca) e aparece corretamente, em vez de nascer já dispensada.

- `@default(now())` preenche as linhas existentes no momento da migração; após o primeiro "dispensar", todas ficam antes da marca.
- `upsertTransactions` casa por conteúdo e **atualiza** a linha existente → `createdAt` preservado no re-sync. Linha nova (não casada) nasce com `createdAt` novo → reaparece (aceito).

## API (backend)

Todas sob `requireAuth`, como as demais.

- `PUT /transactions/:id/note` — body `{ note: string }`. Carrega a transação, calcula a `key`, faz upsert em `TransactionNote`. `note` vazio/`""` → apaga o registro. Resposta: `{ key, note }`. Afeta o grupo inteiro (todas as transações com a mesma identidade).
- `GET /transactions` (existente) — passa a anexar `note: string | null` a cada transação. Implementação: carrega todas as `TransactionNote` num `Map<key, note>`, calcula a `key` de cada transação e injeta a nota.
- `GET /transactions/pending` — devolve as **candidatas** a pendentes: transações **sem nota** e com `createdAt > pendingDismissedAt`, com campos mínimos (`id, description, amount, category, account.type, account.item.institution, createdAt`). O frontend aplica `expenseValue`/`isInternalMovement` e agrupa por banco.
- `POST /transactions/pending/dismiss` — seta `AppState.pendingDismissedAt = now()` (upsert do singleton). Resposta: `{ pendingDismissedAt }`.

> Classificação de "despesa/interna" vive no frontend (fonte única, inclui `VITE_INTERNAL_PARTY_PATTERN` e as regras de investimento/renda fixa). O backend só filtra por "sem nota + pós-marca"; o frontend decide o que é despesa relevante. O conjunto de candidatas é pequeno após o primeiro dispensar.

## Frontend

### api.ts
- `Transaction` ganha `note?: string | null`.
- Novos métodos: `api.setTransactionNote(id, note)`, `api.pending()`, `api.dismissPending()`.
- Tipo `PendingSummary = { total: number; banks: { institution: string; count: number }[] }`, montado no cliente a partir de `GET /transactions/pending` filtrando por `expenseValue(t) > 0 && !isInternalMovement(t)` e sem nota.

### Modal de detalhe (`TransactionTimelineModal`)
- Campo de texto (`textarea`/`input`) com o comentário atual do grupo; botão salvar (ou salvar no blur). Chama `setTransactionNote`. Ao salvar, atualiza o estado das transações do mesmo grupo (ou dá `reload`).

### Tabela (`TransactionsTable`)
- Sob a descrição: se `t.note`, mostra o comentário em texto pequeno/apagado. Se não há nota e a transação é despesa (`expenseValue(t) > 0 && !isInternalMovement(t)`), um ícone discreto de "sem comentário" (dica visual, sem ação inline — a edição é no modal). O ícone **não** depende da marca de dispensa (a marca afeta só a contagem da tela inicial).

### Tela inicial (`Resumo`)
- Card/badge "N transações sem comentário", com quebra por banco (ex.: "Nubank 12 · Itaú 5") e botão **"Dispensar por agora"** (chama `dismissPending` e recarrega o resumo). Escondido quando `total === 0`.

### Card de Assinaturas (requisito 4)
- `detectSubscriptions` passa a receber `institution` por transação e a expor `bank` em `Subscription` (instituição da cobrança mais recente do grupo).
- O componente de Assinaturas passa a respeitar o filtro global de banco (`filter.banco`), igual aos cards de cartão/investimento.

## Tratamento de erros

- `PUT .../note` e `POST .../dismiss`: 404 se a transação não existe; erros do Prisma → 500 com mensagem, como nos controllers atuais.
- Frontend: falha ao salvar nota → mantém o texto no campo e loga; falha no `pending` → badge simplesmente não aparece (não quebra o Resumo).

## Testes

- **Backend (self-check tsx, estilo `openInvoice.test.ts`):** `annotationKey` — parcelas `BASE 1/7`..`7/7` com mesmo valor geram a mesma key; valores diferentes geram keys diferentes; sufixo `N/M` colado e com espaço normalizam igual.
- **Backend:** `detectSubscriptions` continua passando e agora expõe `bank`.
- **Frontend:** montagem do `PendingSummary` exclui internas/entradas e itens com nota (checagem simples de `expenseValue`/`isInternalMovement` já cobertos pela lógica existente).

## Fora de escopo (YAGNI)

- Comentário por transação individual (a decisão foi por identidade de grupo).
- Dispensar por grupo/estabelecimento persistente (a decisão foi snapshot global).
- Pendências por perfil logado (global na v1).
- Histórico/edição multiusuário de quem comentou.
