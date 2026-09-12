# Faturas futuras + detalhamento de fatura

Data: 2026-08-30
Branch de origem: `feat/subs-recency-and-month-total`

## Problema

No card de cartões (`Cartões`) hoje só dá para ver a fatura **aberta** (ciclo
corrente), a **fechada a vencer** e o **histórico** das vencidas. Faltam duas
coisas:

1. **Faturas futuras.** As parcelas de compras parceladas já existem no banco
   como transações datadas no futuro (o Pluggy divide o parcelamento em uma
   transação por cobrança), mas não há como ver a fatura de um mês futuro com
   as parcelas que vão cair nele — nem filtrando meses futuros.
2. **Detalhamento.** Não é possível abrir uma fatura e ver, linha a linha, o
   que compõe o valor dela.

O detalhamento deve funcionar para os três tipos: fechadas, aberta e futuras.

## Insight central

Uma fatura de qualquer época é **as transações cuja data cai na janela do
ciclo `(fechamentoAnterior, fechamento]`**. Passado, presente e futuro seguem a
mesma regra. `openInvoice.ts` já faz esse fatiamento por janela (`netInWindow`);
falta apenas (a) expor os **itens** da janela, não só a soma, e (b) projetar as
janelas **futuras**.

A matéria-prima já está disponível no backend: o handler `/cards`
(`cards.controller.ts`) já carrega **todas** as transações de cada cartão e as
passa para `computeInvoices`. Não é preciso endpoint novo, round-trip extra,
nem mudança de schema.

## Decisões (definidas no brainstorming)

- **UI do detalhe:** modal/painel bottom-sheet, no padrão já usado
  (`FutureCommitmentsCard`, `TransactionTimelineModal`). Não é rota dedicada.
- **Horizonte futuro:** até a última parcela existente. Sem meses vazios — só
  ciclos futuros que de fato contêm parcela agendada.
- **Fonte dos itens (fechada/histórico):** os itens vêm das transações do ciclo,
  mas o valor "cabeça" da fatura continua sendo o **total oficial do Bill** da
  Pluggy. Se `totalOficial − soma(itens) ≠ 0`, o modal mostra uma linha
  **"encargos/ajuste"** com a diferença (juros/encargos que não viram transação).
- **Seletor de mês:** o card de faturas continua **independente** do seletor de
  mês (como hoje). As faturas futuras aparecem como linhas adicionais — isso já
  resolve o "não consigo ver mesmo filtrando meses futuros".

## Backend

### `openInvoice.ts`

Extrair um helper que devolve os **itens deduplicados** de uma janela
`(start, end]` — a mesma lógica de filtragem/dedup que `netInWindow` já usa
internamente. `netInWindow` passa a somar em cima desse helper (fonte única).

Tipo de item de linha:

```ts
type LineItem = { date: Date; description: string; amount: number; category: string };
```

Cada fatura no retorno ganha `items: LineItem[]`. A lógica de exclusão de
itens que hoje o `net` aplica (dedup por conteúdo; para a **aberta**, exclusão
da quitação de fatura fechada — `isSettlement`) vale igual para os `items`: o
que não entra na soma também não aparece na lista.

Novo campo no retorno: `future: FutureInvoice[]`.

```ts
type FutureInvoice = {
  closingDate: Date;   // fim da janela do ciclo futuro
  dueDate: Date;       // closingDate + mesmo offset de vencimento dos Bills reais
  amount: number;      // soma das parcelas do ciclo
  items: LineItem[];
};
```

Projeção das janelas futuras:

- A fatura **aberta** cobre `(curClose, curClose+1m]` e fecha em `curClose+1m`.
- Fatura futura 1 = `(curClose+1m, curClose+2m]`, futura 2 = `(curClose+2m,
  curClose+3m]`, e assim por diante.
- Gerar ciclos até a data da **última transação futura** do cartão. Pular
  ciclos sem nenhuma transação (sem meses vazios).
- `dueOffset = latest.dueDate − latest.closingDate` (mesmo cálculo já usado no
  ramo `lagging`); `dueDate = closingDate + dueOffset`.
- `amount` das futuras = soma crua dos itens (sem o teto por `balance`, que só
  reflete a dívida atual).

Isso é independente do ramo `lagging` (Bill recém-fechado ainda não emitido):
as janelas futuras sempre começam em `curClose+1m`.

`Invoices` (retorno) passa a ser:

```ts
type Invoices = {
  open: { amount: number; since: Date | null; items: LineItem[] };
  closed: { amount: number; closingDate: Date; dueDate: Date; items: LineItem[] } | null;
  future: FutureInvoice[];
  history: { closingDate: Date | null; dueDate: Date; totalAmount: number; items: LineItem[] }[];
};
```

Itens de fechada/histórico: transações da janela `(closingDate−1m, closingDate]`
do respectivo Bill. Valor de cabeça = `totalAmount` oficial; a diferença para a
soma dos itens é a linha "encargos/ajuste" (calculada no frontend).

### `cards.controller.ts`

Repassar os novos campos (`items`, `future`) no JSON de cada cartão. A seleção
de transações já existe; só precisa incluir `category` no `select` (hoje é
`{ amount, date, description }`).

## Frontend

### Tipos (`api.ts`)

Espelhar `LineItem`, `FutureInvoice` e os novos campos `items`/`future` no tipo
`CreditCard`.

### `CreditCardInvoicesCard.tsx`

- Cada fatura (aberta, fechada, cada futura, cada histórico) vira **clicável**
  (`role="button"`, tabIndex, Enter/Espaço) e abre o `InvoiceDetailModal`.
- Faturas **futuras**: lista compacta abaixo da aberta — `mês/26 · R$ valor`,
  ordenadas por data, cada linha clicável. Só aparece a seção se houver futuras.

### `InvoiceDetailModal.tsx` (novo)

Bottom-sheet reaproveitando o padrão do `FutureCommitmentsCard` (overlay
`fixed inset-0`, `max-h-[85vh]`, fecha no backdrop/botão/Esc). Recebe uma
fatura já pronta (tipo, banco/cartão, datas, total, itens). Renderiza:

- Cabeçalho: banco + nome do cartão, "fechou/vence" (ou "fecha/vence" p/
  futuras; "aberta desde" p/ aberta), total.
- Lista de itens: data · descrição · valor (`category` como legenda opcional).
- Linha **"encargos/ajuste"** = `total − soma(itens)`, exibida só quando ≠ 0
  (arredondamento de centavos: tolerância de 0,02).

## Fora de escopo (proposital)

- `FutureCommitmentsCard` fica como está — é uma projeção cross-cartão por mês
  (lente diferente). Há sobreposição conceitual, mas removê-la é decisão à
  parte, não pedida.
- Sem endpoint novo, sem mudança de schema, sem alterar o seletor de mês.
- Sem testes unitários (por pedido do usuário). O `openInvoice.test.ts` existente
  não deve quebrar — os campos são aditivos.

## Riscos / bordas

- **Payload:** `/cards` passa a devolver as transações de cada cartão agrupadas
  por ciclo. São as mesmas já carregadas hoje, repassadas — leve (poucos
  cartões, dezenas/centenas de transações por cartão).
- **Dedup:** a MeuPluggy reatribui `pluggyTransactionId` entre syncs; o dedup
  por conteúdo já existente em `netInWindow` cobre isso e é reaproveitado nos
  itens.
- **Compat:** os campos são aditivos; o shape atual (`open`/`closed`/`history`)
  é preservado, então o card não quebra durante a implementação incremental.
- **Bill sem `closingDate`:** `closingDate` é opcional. Sem ele não há janela
  para fatiar os itens do histórico → `items = []` e todo o total cai na linha
  "encargos/ajuste". Aceitável (raro); o modal continua exibindo o total oficial.
