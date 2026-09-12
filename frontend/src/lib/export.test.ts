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

describe("buildSheets", () => {
  it("cartões: fatura atual = fechada quando existe, senão aberta", () => {
    const withClosed = card({
      closedInvoice: { amount: 555, closingDate: "2026-09-01", dueDate: "2026-09-15", items: [] },
    });
    const openOnly = card({ openInvoice: { amount: 222, since: null, items: [] } });
    const sClosed = buildSheets({ ...base, cards: [withClosed] })["Cartões"];
    expect(sClosed.rows[0].Valor).toBe(555);
    const sOpen = buildSheets({ ...base, cards: [openOnly] })["Cartões"];
    expect(sOpen.rows[0].Valor).toBe(222);
  });

  it("transações: sinal preservado; tipo correto", () => {
    const sTx = buildSheets({
      ...base,
      transactions: [tx({ amount: "-50", description: "Pix enviado" }), tx({ amount: "728.44", description: "Pix recebido" })],
    })["Transações"];
    expect(sTx.rows.find((r) => r.Descrição === "Pix enviado")!.Valor).toBe(-50);
    expect(sTx.rows.find((r) => r.Descrição === "Pix enviado")!.Tipo).toBe("saída");
    expect(sTx.rows.find((r) => r.Descrição === "Pix recebido")!.Tipo).toBe("entrada");
  });

  it("gastos: soma das categorias == TOTAL Saídas; % guardado como fração", () => {
    const sG = buildSheets({
      ...base,
      transactions: [
        tx({ amount: "-30", category: "Mercado" }),
        tx({ amount: "-20", category: "Uber" }),
        tx({ amount: "100", description: "Salário" }),
      ],
    })["Gastos"];
    const catRows = sG.rows.filter((r) => typeof r["% do total"] === "number");
    const catSum = catRows.reduce((s, r) => s + (r.Valor as number), 0);
    const totalSaidas = sG.rows.find((r) => r.Item === "TOTAL Saídas")!.Valor as number;
    expect(catSum).toBe(totalSaidas);
    expect(totalSaidas).toBe(50);
    const mercado = sG.rows.find((r) => r.Item === "Mercado")!;
    expect(mercado["% do total"]).toBe(30 / 50);
  });

  it("linha de total: soma da coluna de valor, presente e rotulada", () => {
    const sTx = buildSheets({
      ...base,
      transactions: [tx({ amount: "-50", description: "Pix enviado" }), tx({ amount: "728.44", description: "Pix recebido" })],
    })["Transações"];
    expect(sTx.total!.Valor).toBe(678.44);
    expect(sTx.total!.Descrição).toBe("TOTAL");

    const sInv = buildSheets({
      ...base,
      investments: [
        { institution: "XP", name: "CDB", type: "FIXED_INCOME", balance: 1000, userName: "Ana" },
        { institution: "XP", name: "Tesouro", type: "FIXED_INCOME", balance: 500, userName: "Ana" },
      ],
    })["Investimentos"];
    expect(sInv.total!.Saldo).toBe(1500);

    // Cartões: total geral = soma das faturas atuais, sem dobrar itens.
    const withClosed = card({
      closedInvoice: { amount: 555, closingDate: "2026-09-01", dueDate: "2026-09-15", items: [] },
    });
    expect(buildSheets({ ...base, cards: [withClosed] })["Cartões"].total!.Valor).toBe(555);

    // Resumo não tem linha de total (KPIs heterogêneos).
    expect(buildSheets(base)["Resumo"].total).toBeUndefined();
  });
});
