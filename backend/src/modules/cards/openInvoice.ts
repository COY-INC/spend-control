// Cálculo das faturas de um cartão de crédito: a aberta (ciclo corrente), a fechada
// ainda a vencer e o histórico das já vencidas.
//
// Convenção de sinal (cartão CREDIT): compra = amount POSITIVO; estorno, desconto e
// pagamento = amount NEGATIVO.
//
// O "net" de um ciclo é: compras − descontos/estornos − pagamentos ANTECIPADOS, SEM
// subtrair a quitação de uma fatura FECHADA (identificada pela igualdade do |valor| com
// o total de alguma fatura fechada), que também cai na janela.
//
// Ex.: Nubank — compras 696,82; −0,42/−0,19 desconto; −12,91 pgto antecipado; −680,69
// que quita a fatura fechada de 680,69 (excluído) → 683,30.
//
// A MeuPluggy ATRASA a emissão da fatura recém-fechada: no dia 30/08 a fatura que fechou
// 27/08 ainda não virou um Bill. Por isso o ciclo é projetado pelo DIA de fechamento da
// última fatura real, e não pela existência do Bill. Quando a Pluggy enfim emite o Bill,
// `curClose == lastClosing` e voltamos a usar o total real dela.
//
// Dedup por conteúdo: a MeuPluggy reatribui pluggyTransactionId em transações recentes/
// pendentes entre syncs, então o dedup por id não pega e pagamentos aparecem 2×.

type Tx = {
  id?: string;
  amount: unknown;
  date: Date;
  description?: string | null;
  category?: string | null;
  cardNumber?: string | null;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  billId?: string | null; // id da fatura na Pluggy (creditCardMetadata.billId); vínculo direto, sem depender de data
  status?: string | null; // POSTED | PENDING (Pluggy)
};
type Bill = { pluggyBillId?: string | null; closingDate: Date | null; dueDate: Date; totalAmount: unknown };

// `id` = uma transação representativa do item (o dedup colapsa churn/parcelas equivalentes);
// serve para a ação de antecipar (a chave é por conteúdo, qualquer id do grupo vale).
export type LineItem = {
  id: string;
  date: Date;
  description: string;
  amount: number;
  category: string;
  cardNumber: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
};
export type FutureInvoice = { closingDate: Date; dueDate: Date; amount: number; items: LineItem[] };

export type Invoices = {
  open: { amount: number; since: Date | null; items: LineItem[] };
  closed: { amount: number; closingDate: Date; dueDate: Date; items: LineItem[] } | null;
  future: FutureInvoice[]; // preenchido na Task 2; nesta task pode ser []
  history: { closingDate: Date | null; dueDate: Date; totalAmount: number; items: LineItem[] }[];
};

// Soma de meses "date-only" em UTC, preservando o dia (fechamento em dia > 28 pode
// transbordar mês — aceitável: dias de fechamento de cartão são ≤ 28 na prática).
function addMonthsUTC(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCMonth(r.getUTCMonth() + n);
  return r;
}
const startOfDayUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

// Brasil não observa horário de verão desde 2019 — UTC-3 fixo o ano todo.
const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;

// Dia calendário da transação em horário de Brasília, não em UTC. `closingDate`/`dueDate`
// da fatura são datas PURAS (a Pluggy reporta à meia-noite UTC como convenção, sem
// significado de fuso — ver startOfDayUTC), mas `date` de uma transação é um instante real:
// convertida ingenuamente por dia UTC, uma compra feita à noite no Brasil (ex.: 21h) vira
// meia-noite UTC do dia SEGUINTE — um dia inteiro adiantada. Confirmado com dado real: a
// parcela Bradesco 13/08 00:41 UTC é 12/08 21:41 em Brasília — um dia ANTES do fechamento
// (13), batendo com a fatura certa; em UTC puro pareceria "no mesmo dia do fechamento".
const localDayUTC = (d: Date) => startOfDayUTC(new Date(d.getTime() - BRAZIL_OFFSET_MS));

// Dedup por conteúdo + mapeia pra LineItem. dropSettlements exclui a quitação de fatura
// fechada (só faz sentido na fatura ABERTA — ver comentário do módulo). Comum às duas
// estratégias de agrupamento (por billId ou por janela de data — ver itemsForBill/itemsInWindow).
function dedupAndBuild(txs: Tx[], billTotals: number[], dropSettlements: boolean): LineItem[] {
  const seen = new Set<string>();
  const isSettlement = (v: number) =>
    v < 0 && billTotals.some((bt) => Math.abs(bt - Math.abs(v)) <= 0.02);
  const out: LineItem[] = [];
  for (const t of txs) {
    const v = Number(t.amount);
    // Dedup pelo INSTANTE exato (não só o dia): duas compras reais idênticas no mesmo dia têm
    // timestamps diferentes e devem contar as duas; o churn da MeuPluggy repete o mesmo timestamp.
    const key = `${t.date.toISOString()}|${v}|${t.description ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (dropSettlements && isSettlement(v)) continue;
    out.push({
      id: t.id ?? "",
      date: t.date,
      description: t.description ?? "",
      amount: v,
      category: t.category ?? "",
      cardNumber: t.cardNumber ?? null,
      installmentNumber: t.installmentNumber ?? null,
      totalInstallments: t.totalInstallments ?? null,
    });
  }
  return out;
}

// Itens deduplicados da janela [start, end), POR DATA — usado quando não há billId real
// pra casar (ciclo ainda não fechado pela Pluggy: aberto, futuro, ou fatura "lagging"
// projetada) ou como fallback para transações antigas/sem o campo (ver itemsForBill).
//
// A fronteira é por DIA CALENDÁRIO EM HORÁRIO DE BRASÍLIA (ver localDayUTC), e o dia do
// FECHAMENTO fica de fora do ciclo que está fechando — regra do cartão: "fecha dia D" ⇒
// só compras até o dia D-1 entram nessa fatura; o próprio dia D já é a fatura seguinte.
// `start`/`end` são sempre `closingDate` de alguma fatura (datas puras, sem fuso).
function itemsInWindow(
  txs: Tx[],
  billTotals: number[],
  start: Date | null,
  end: Date | null,
  dropSettlements: boolean,
): LineItem[] {
  const inCycle = txs.filter(
    (t) =>
      (!start || localDayUTC(t.date) >= startOfDayUTC(start)) &&
      (!end || localDayUTC(t.date) < startOfDayUTC(end)),
  );
  return dedupAndBuild(inCycle, billTotals, dropSettlements);
}

// Itens de uma fatura REAL (já emitida pela Pluggy, com pluggyBillId): casa cada transação
// pelo billId (creditCardMetadata.billId) — vínculo direto do banco à fatura, sem depender
// de janela de data nenhuma. Confirmado 100% confiável em transações POSTED, nos 4 bancos
// testados (Bradesco, Itaú, Mercado Pago, Nubank) — elimina de vez qualquer ambiguidade de
// fronteira (fechamento em fim de semana/feriado, horário próximo à meia-noite, etc.).
// Fallback pra janela de data só nas transações SEM billId (sincronizadas antes desta
// migration, ou de um conector que não manda o campo).
function itemsForBill(
  txs: Tx[],
  billTotals: number[],
  pluggyBillId: string | null | undefined,
  windowStart: Date | null,
  windowEnd: Date,
  dropSettlements: boolean,
): LineItem[] {
  if (!pluggyBillId) return itemsInWindow(txs, billTotals, windowStart, windowEnd, dropSettlements);
  const matched = dedupAndBuild(
    txs.filter((t) => t.billId === pluggyBillId),
    billTotals,
    dropSettlements,
  );
  // Fallback só pra transações SEM billId que também não estão PENDING. A fronteira por
  // dia local (ver itemsInWindow/localDayUTC) já resolve isso na origem — o dia do
  // fechamento pertence ao ciclo SEGUINTE, então uma transação ainda pendente datada
  // exatamente nesse dia não deveria mais cair aqui por data. Esta checagem de `status`
  // fica como cinto-e-suspensório: uma fatura já fechada só pode ter itens POSTED, então
  // nunca custa garantir isso mesmo que a data engane por algum outro motivo (ver caso
  // real: parcela TAP AIR PORT 7/8). `status` ausente (dado antigo/conector sem o campo)
  // não é excluído — mantém compatibilidade.
  const fallback = itemsInWindow(
    txs.filter((t) => !t.billId && t.status !== "PENDING"),
    billTotals,
    windowStart,
    windowEnd,
    dropSettlements,
  );
  return [...matched, ...fallback];
}

function netInWindow(txs: Tx[], billTotals: number[], start: Date | null, end: Date | null): number {
  // net exclui a quitação de fatura fechada (dropSettlements=true), como antes.
  return itemsInWindow(txs, billTotals, start, end, true).reduce((s, i) => s + i.amount, 0);
}

// Portador do cartão: dependente se o número está entre os adicionais da conta; senão
// principal (inclui números antigos/reemitidos). null quando o cartão não tem adicional
// (nada a separar). Ver análise Bradesco: 1918=dependente, 1919/8749/1910=principal.
export function cardOwner(
  cardNumber: string | null,
  additionalCards: string[],
): "principal" | "dependente" | null {
  if (additionalCards.length === 0) return null;
  return cardNumber && additionalCards.includes(cardNumber) ? "dependente" : "principal";
}

export function computeInvoices(
  transactions: Tx[],
  bills: Bill[],
  balance: number,
  now: Date = new Date(),
): Invoices {
  const billTotals = bills.map((b) => Math.abs(Number(b.totalAmount)));
  const latest = bills.find((b) => b.closingDate) ?? null;
  const lastClosing = latest?.closingDate ?? null;

  // Transação com billId já foi atribuída pela Pluggy a UMA fatura específica (casada via
  // itemsForBill, em qualquer lugar do código) — nunca deve ser reconsiderada pelas janelas
  // de data abaixo (aberta/futura/fechada-projetada), senão o billId perde efeito e o item
  // pode acabar contado (ou exibido) duas vezes, numa fatura errada por coincidência de data.
  const noBillId = transactions.filter((t) => !t.billId);

  // Sem fatura fechada ainda: tudo é fatura aberta (soma do que houver), sem fechada/histórico.
  if (!latest || !lastClosing) {
    const items = itemsInWindow(noBillId, billTotals, null, null, true);
    const amount = Math.max(0, Math.min(items.reduce((s, i) => s + i.amount, 0), balance));
    return { open: { amount, since: null, items }, closed: null, future: [], history: [] };
  }

  // Rola o ciclo pelo dia do fechamento: fechamento mais recente que já ocorreu (<= hoje,
  // em horário de Brasília — `now` é um instante real, diferente de curClose que é data pura).
  let curClose = new Date(lastClosing);
  while (startOfDayUTC(addMonthsUTC(curClose, 1)) <= localDayUTC(now)) curClose = addMonthsUTC(curClose, 1);

  const openItems = itemsInWindow(noBillId, billTotals, curClose, addMonthsUTC(curClose, 1), true);
  const openAmount = Math.max(0, Math.min(openItems.reduce((s, i) => s + i.amount, 0), balance));

  const lagging = curClose > lastClosing; // ciclos fecharam além do último Bill da Pluggy
  let closed: Invoices["closed"] = null;

  if (lagging) {
    // Fatura recém-fechada que a Pluggy ainda não emitiu: net do ciclo (prevClose, curClose].
    // ponytail: total estimado pelas transações; a Pluggy pode ajustar juros/encargos —
    // corrige sozinho quando o Bill real chega (aí lagging=false e usamos o total dela).
    const dueOffsetMs = latest.dueDate.getTime() - lastClosing.getTime();
    const closedItems = itemsInWindow(noBillId, billTotals, addMonthsUTC(curClose, -1), curClose, true);
    const amount = Math.max(0, closedItems.reduce((s, i) => s + i.amount, 0));
    if (amount > 0) {
      closed = { amount, closingDate: curClose, dueDate: new Date(curClose.getTime() + dueOffsetMs), items: closedItems };
    }
  } else if (startOfDayUTC(latest.dueDate) >= localDayUTC(now) && Number(latest.totalAmount) > 0) {
    // Fatura fechada real, mostrada só enquanto NÃO vencida (item #3). Vencida → histórico.
    const closedItems = itemsForBill(transactions, billTotals, latest.pluggyBillId, addMonthsUTC(lastClosing, -1), lastClosing, false);
    closed = { amount: Number(latest.totalAmount), closingDate: lastClosing, dueDate: latest.dueDate, items: closedItems };
  }

  // Teto pelo devedor total: aberta + fechada não podem exceder o que se deve hoje (balance).
  // Motivo original (duplicação de datas do Mercado Pago, compras no limite do ciclo contadas
  // 2×) já foi corrigido na raiz por dois mecanismos independentes: fronteira por dia
  // calendário (itemsInWindow) e exclusão de transações com billId das janelas por data
  // (itemsForBill) — as duas juntas tornam essa duplicação especificamente impossível hoje.
  // Mantido como limite de sanidade genérico (encargos/juros sem transação correspondente,
  // pagamento parcial ainda não sincronizado, etc.) — nunca observado sendo acionado desde o
  // fix, mas sem evidência forte o suficiente pra remover com segurança.
  if (closed) {
    const capped = Math.min(closed.amount, Math.max(0, balance - openAmount));
    closed = capped > 0 ? { ...closed, amount: capped } : null;
  }

  // Histórico: todas as fechadas, menos a que está sendo exibida como "fechada a vencer".
  const shownReal = !lagging && closed ? latest : null;
  const history = bills
    .filter((b) => b !== shownReal)
    .map((b) => ({
      closingDate: b.closingDate,
      dueDate: b.dueDate,
      totalAmount: Number(b.totalAmount),
      items: b.closingDate
        ? itemsForBill(transactions, billTotals, b.pluggyBillId, addMonthsUTC(b.closingDate, -1), b.closingDate, false)
        : [],
    }));

  // Faturas futuras: uma por ciclo à frente do ciclo aberto que contenha parcela.
  // dueOffset = mesma distância fechamento→vencimento do último Bill real.
  const openEnd = addMonthsUTC(curClose, 1);
  const dueOffsetMs = latest.dueDate.getTime() - lastClosing.getTime();
  const lastFuture = noBillId.reduce<Date | null>(
    (max, t) => (localDayUTC(t.date) >= startOfDayUTC(openEnd) && (!max || t.date > max) ? t.date : max),
    null,
  );
  const future: FutureInvoice[] = [];
  if (lastFuture) {
    let start = openEnd;
    while (start < lastFuture) {
      const end = addMonthsUTC(start, 1);
      const items = itemsInWindow(noBillId, billTotals, start, end, false);
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

  return { open: { amount: openAmount, since: curClose, items: openItems }, closed, future, history };
}
