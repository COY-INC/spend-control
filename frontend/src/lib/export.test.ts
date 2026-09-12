// Rode com: npx tsx src/lib/export.test.ts
import assert from "node:assert";
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

// 1) Cartões: fatura atual = fechada quando existe, senão aberta.
const withClosed = card({
  closedInvoice: { amount: 555, closingDate: "2026-09-01", dueDate: "2026-09-15", items: [] },
});
const openOnly = card({ openInvoice: { amount: 222, since: null, items: [] } });
const sClosed = buildSheets({ ...base, cards: [withClosed] })["Cartões"];
assert.equal(sClosed.rows[0].Valor, 555, "fatura atual usa a fechada-não-vencida");
const sOpen = buildSheets({ ...base, cards: [openOnly] })["Cartões"];
assert.equal(sOpen.rows[0].Valor, 222, "sem fechada, usa a aberta");

// 2) Transações: sinal preservado; tipo correto.
const sTx = buildSheets({
  ...base,
  transactions: [tx({ amount: "-50", description: "Pix enviado" }), tx({ amount: "728.44", description: "Pix recebido" })],
})["Transações"];
assert.equal(sTx.rows.find((r) => r.Descrição === "Pix enviado")!.Valor, -50, "valor negativo preservado");
assert.equal(sTx.rows.find((r) => r.Descrição === "Pix enviado")!.Tipo, "saída", "saída rotulada");
assert.equal(sTx.rows.find((r) => r.Descrição === "Pix recebido")!.Tipo, "entrada", "entrada rotulada");

// 3) Gastos: soma das categorias == TOTAL Saídas; % guardado como fração.
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
assert.equal(catSum, totalSaidas, "categorias somam o total de saídas");
assert.equal(totalSaidas, 50, "duas saídas somam 50");
const mercado = sG.rows.find((r) => r.Item === "Mercado")!;
assert.equal(mercado["% do total"], 30 / 50, "% guardado como fração (0.6), não 60");

// 4) Linha de total: soma da coluna de valor, presente e rotulada.
assert.equal(sTx.total!.Valor, 678.44, "total de Transações = soma dos valores");
assert.equal(sTx.total!.Descrição, "TOTAL", "linha de total rotulada");
const sInv = buildSheets({
  ...base,
  investments: [
    { institution: "XP", name: "CDB", type: "FIXED_INCOME", balance: 1000, userName: "Ana" },
    { institution: "XP", name: "Tesouro", type: "FIXED_INCOME", balance: 500, userName: "Ana" },
  ],
})["Investimentos"];
assert.equal(sInv.total!.Saldo, 1500, "total de Investimentos = soma dos saldos");
// Cartões: total geral = soma das faturas atuais, sem dobrar itens.
assert.equal(buildSheets({ ...base, cards: [withClosed] })["Cartões"].total!.Valor, 555, "total geral do cartão");
// Resumo não tem linha de total (KPIs heterogêneos).
assert.equal(buildSheets(base)["Resumo"].total, undefined, "Resumo sem total");

console.log("OK: buildSheets (cartões/transações/gastos/totais/percentual)");
