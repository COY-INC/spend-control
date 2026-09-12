// Rode com: npx tsx src/expenseValue.test.ts
import assert from "node:assert";
import { expenseValue, type Transaction } from "./api";

const tx = (p: Partial<Transaction> & { amount: string; account: { type: string } }): Transaction => ({
  id: "x",
  date: "2026-08-11",
  description: "",
  category: "",
  ...p,
  account: { id: "a", name: null, item: { institution: "b", userId: "u" }, ...p.account },
});

// Pagamento de fatura NÃO é despesa nova (regime de competência: a compra do cartão já contou).
// Descrições/categorias reais de prod:

// Itaú: débito automático, categoria Pluggy "Credit card payment", sem a palavra "fatura".
assert.equal(
  expenseValue(tx({ amount: "-1209.43", description: "Débito automático ITAU BLACK 3116-3697", category: "Credit card payment", account: { type: "BANK" } })),
  0,
  "Itaú débito automático deveria ser 0 (é pagamento de fatura)",
);

// Mercado Pago: "Pagamento Cartão de crédito", categoria só "Transfers".
assert.equal(
  expenseValue(tx({ amount: "-36.51", description: "Pagamento Cartão de crédito", category: "Transfers", account: { type: "BANK" } })),
  0,
  "MP pagamento de cartão deveria ser 0",
);

// Nubank: já funcionava (descrição tem "fatura") — não pode regredir.
assert.equal(
  expenseValue(tx({ amount: "-799.46", description: "Pagamento de fatura", category: "Transfers", account: { type: "BANK" } })),
  0,
);

// Despesa real de conta continua contando.
assert.equal(
  expenseValue(tx({ amount: "-44", description: "Pagamento com QR Pix TTRS", category: "Travel", account: { type: "BANK" } })),
  44,
);

// Compra no cartão (CREDIT positivo) continua contando.
assert.equal(
  expenseValue(tx({ amount: "24.98", description: "MERCADOLIVRE*MERCADOLIVRE", category: "Shopping", account: { type: "CREDIT" } })),
  24.98,
);

console.log("OK: expenseValue");
