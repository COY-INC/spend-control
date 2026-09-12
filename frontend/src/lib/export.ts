// frontend/src/lib/export.ts
// Monta os dados da aplicação em folhas (uma por página) para exportação .xlsx.
// buildSheets é PURA (dados -> spec de linhas + metadados de formato); o wrapper
// exportWorkbook aplica máscaras (R$/%/data), totais, estilo e larguras via xlsx-js-style.
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

// Uma folha: linhas + quais colunas recebem máscara + a linha de total (já rotulada).
export type SheetSpec = {
  rows: Row[];
  money: string[]; // colunas em R$
  percent: string[]; // colunas em %  (valores guardados como fração: 0.123 = 12,3%)
  date: string[]; // colunas de data/hora (valores em ISO string; "" = vazio)
  total?: Row; // linha de total, destacada; omitida onde somar não faz sentido
};

const TYPE_LABEL: Record<string, string> = {
  CREDIT: "Cartão de crédito",
  BANK: "Conta",
  LOAN: "Empréstimo",
  INVESTMENT: "Investimento",
};

export function buildSheets(data: ExportData): Record<string, SheetSpec> {
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

  // Resumo: KPIs heterogêneos — somar a coluna não faz sentido, então sem linha de total.
  const resumo: SheetSpec = {
    rows: [
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
    ],
    money: ["Valor"],
    percent: [],
    date: [],
  };

  // --- Patrimônio ---
  const patRows: Row[] = [
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
  // Total só das contas: as reservas são parte do saldo da conta, somá-las duplicaria.
  const totalContas = accIn.reduce((s, a) => s + signedBalance(a), 0);
  const patrimonio: SheetSpec = {
    rows: patRows,
    money: ["Saldo"],
    percent: [],
    date: [],
    total: patRows.length
      ? { Banco: "TOTAL (contas)", Conta: "", Tipo: "", Saldo: totalContas, Titular: "" }
      : undefined,
  };

  // --- Investimentos ---
  const invRows: Row[] = invIn.map((i) => ({
    Instituição: i.institution,
    Nome: i.name,
    Tipo: i.type,
    Saldo: i.balance,
    Titular: i.userName,
  }));
  const investimentos: SheetSpec = {
    rows: invRows,
    money: ["Saldo"],
    percent: [],
    date: [],
    total: invRows.length
      ? { Instituição: "TOTAL", Nome: "", Tipo: "", Saldo: invIn.reduce((s, i) => s + i.balance, 0), Titular: "" }
      : undefined,
  };

  // --- Cartões --- (fatura atual = fechada-não-vencida, senão aberta)
  const cartRows: Row[] = [];
  for (const c of cardsF) {
    const current = c.closedInvoice ?? c.openInvoice;
    const isClosed = c.closedInvoice != null;
    const venc = c.closedInvoice ? c.closedInvoice.dueDate : "";
    cartRows.push({
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
      cartRows.push({
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
    cartRows.push({}); // linha em branco entre cartões
  }
  // Total geral = soma das faturas atuais (só os cabeçalhos), não a coluna crua (items dobrariam).
  const totalCartoes = cardsF.reduce((s, c) => s + (c.closedInvoice ?? c.openInvoice).amount, 0);
  const cartoes: SheetSpec = {
    rows: cartRows,
    money: ["Valor"],
    percent: [],
    date: ["Data"],
    total: cardsF.length
      ? { Banco: "TOTAL GERAL", Cartão: "", Data: "", Descrição: "", Valor: totalCartoes, Categoria: "", Nota: "", Antecipada: "" }
      : undefined,
  };

  // --- Gastos --- (categorias por categoria efetiva + totais próprios + assinaturas)
  const gastosTxs = applyTxFilters(data.transactions, gf);
  const catMap = new Map<string, number>();
  let totalExp = 0;
  let totalInc = 0;
  for (const t of gastosTxs) {
    const cat = effectiveCategory(t);
    const e = expenseValue(t, inc);
    if (e > 0) {
      catMap.set(cat, (catMap.get(cat) ?? 0) + e);
      totalExp += e;
    }
    totalInc += incomeValue(t, inc);
  }
  // Gastos já traz suas próprias linhas de total (Saídas/Entradas); sem linha extra.
  // % guardado como fração (0.123) para a máscara 0,0% do Excel.
  const gastos: SheetSpec = {
    rows: [
      ...[...catMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([cat, v]) => ({ Item: cat, Valor: v, "% do total": totalExp > 0 ? v / totalExp : 0 })),
      { Item: "TOTAL Saídas", Valor: totalExp, "% do total": "" },
      { Item: "TOTAL Entradas", Valor: totalInc, "% do total": "" },
      ...data.subscriptions
        .filter((s) => !byBank || s.bank === byBank)
        .map((s) => ({ Item: `Assinatura: ${s.label}`, Valor: s.monthlyAmount, "% do total": `${s.occurrences}x` })),
    ],
    money: ["Valor"],
    percent: ["% do total"],
    date: [],
  };

  // --- Transações --- (filtro completo da página)
  const txs = applyTxFilters(data.transactions, filter);
  const txRows: Row[] = txs.map((t) => {
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
  const transacoes: SheetSpec = {
    rows: txRows,
    money: ["Valor"],
    percent: [],
    date: ["Data"],
    total: txRows.length
      ? { Data: "", Banco: "", Conta: "", Descrição: "TOTAL", Valor: txs.reduce((s, t) => s + Number(t.amount), 0), Categoria: "", Nota: "", Tipo: "" }
      : undefined,
  };

  return {
    Resumo: resumo,
    Patrimônio: patrimonio,
    Investimentos: investimentos,
    Cartões: cartoes,
    Gastos: gastos,
    Transações: transacoes,
  };
}

// ---- Formatação/estilo (só o wrapper; buildSheets segue puro) ----
const FMT = { money: '"R$" #,##0.00', percent: "0.0%", datetime: "dd/mm/yyyy hh:mm" } as const;
const THIN = { style: "thin", color: { rgb: "D1D5DB" } };
const BORDER_ALL = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const HEADER_STYLE = {
  font: { bold: true, color: { rgb: "FFFFFF" } },
  fill: { fgColor: { rgb: "1F2937" } }, // slate-800
  alignment: { vertical: "center" },
  border: BORDER_ALL,
};
const TOTAL_FILL = { fgColor: { rgb: "E5E7EB" } }; // gray-200
// Verde p/ valor positivo, vermelho p/ negativo (0 fica sem cor).
const signColor = (v: number) => (v < 0 ? "C00000" : v > 0 ? "107C10" : undefined);

// CellObject dos types 0.18 não tem `s` (estilo do xlsx-js-style) — tipo local frouxo.
type Cell = { v?: unknown; t?: string; z?: string; w?: string; s?: unknown };

export async function exportWorkbook(data: ExportData): Promise<void> {
  // CJS interop: sob import() em Node os utils ficam em .default; no browser (Vite) já vêm nomeados.
  const mod = await import("xlsx-js-style");
  const XLSX = ((mod as { default?: unknown }).default ?? mod) as typeof import("xlsx-js-style");
  const sheets = buildSheets(data);
  const wb = XLSX.utils.book_new();

  for (const [name, spec] of Object.entries(sheets)) {
    const { rows, money, percent, date, total } = spec;
    // Ordem de colunas fixa pela 1ª linha não-vazia (linhas esparsas alinham nela).
    const header = Object.keys(rows.find((r) => Object.keys(r).length) ?? {});
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{}], header.length ? { header } : {});
    if (total) XLSX.utils.sheet_add_json(ws, [total], { header, skipHeader: true, origin: -1 });

    const wsr = ws as Record<string, Cell>;
    const range = XLSX.utils.decode_range(ws["!ref"]!);
    const col = (key: string) => header.indexOf(key);
    const totalRow = total ? range.e.r : -1;
    // Larguras: máximo entre o header e o conteúdo (com folga p/ "R$ " nas colunas de valor).
    const widths = header.map((k) => k.length);

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = 0; c <= range.e.c; c++) {
        const cell = wsr[XLSX.utils.encode_cell({ r, c })];
        if (!cell || cell.v == null) continue;
        widths[c] = Math.max(widths[c], String(cell.w ?? cell.v).length);
      }
    }

    // Máscaras + cor por sinal (linhas de dados; header/total são estilizados depois).
    for (let r = 1; r <= range.e.r; r++) {
      for (const key of money) {
        const cell = wsr[XLSX.utils.encode_cell({ r, c: col(key) })];
        if (cell && typeof cell.v === "number") {
          cell.z = FMT.money;
          const rgb = signColor(cell.v);
          if (rgb && r !== totalRow) cell.s = { font: { color: { rgb } } };
          widths[col(key)] = Math.max(widths[col(key)], 12); // "R$ " + dígitos
        }
      }
      for (const key of percent) {
        const cell = wsr[XLSX.utils.encode_cell({ r, c: col(key) })];
        if (cell && typeof cell.v === "number") cell.z = FMT.percent;
      }
      for (const key of date) {
        const cell = wsr[XLSX.utils.encode_cell({ r, c: col(key) })];
        if (cell && typeof cell.v === "string" && cell.v) {
          const d = new Date(cell.v);
          if (!isNaN(+d)) {
            cell.v = d;
            cell.t = "d";
            cell.z = FMT.datetime;
            widths[col(key)] = Math.max(widths[col(key)], 16);
          }
        }
      }
    }

    // Header (linha 0) em negrito/cor; cria a célula se faltar p/ o preenchimento cobrir tudo.
    for (let c = 0; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      wsr[addr] = { t: "s", v: header[c] ?? "", ...wsr[addr], s: HEADER_STYLE };
    }
    // Linha de total em negrito + fundo cinza (mantém a cor por sinal do valor).
    if (totalRow >= 0) {
      for (let c = 0; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r: totalRow, c });
        const cell: Cell = wsr[addr] ?? { t: "s", v: "" };
        const rgb = typeof cell.v === "number" ? signColor(cell.v) : undefined;
        cell.s = { font: { bold: true, ...(rgb ? { color: { rgb } } : {}) }, fill: TOTAL_FILL, border: BORDER_ALL };
        wsr[addr] = cell;
      }
    }

    ws["!cols"] = widths.map((w) => ({ wch: Math.min(Math.max(w + 2, 10), 60) }));
    if (header.length) {
      ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } }) };
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  }

  const suffix = data.scope === "my" ? "meu" : "casal";
  XLSX.writeFile(wb, `financas-${data.ym}-${suffix}.xlsx`);
}
