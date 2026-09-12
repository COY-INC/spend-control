import { expenseValue, type Transaction } from "./api";

const tx = (p: Partial<Transaction> & { amount: string; account: { type: string } }): Transaction => ({
  id: "x",
  date: "2026-08-11",
  description: "",
  category: "",
  ...p,
  account: { id: "a", name: null, item: { institution: "b", userId: "u" }, ...p.account },
});

describe("expenseValue", () => {
  // Pagamento de fatura NÃO é despesa nova (regime de competência: a compra do cartão já contou).
  // Descrições/categorias reais de prod:

  it("Itaú débito automático deveria ser 0 (é pagamento de fatura)", () => {
    // Itaú: débito automático, categoria Pluggy "Credit card payment", sem a palavra "fatura".
    expect(
      expenseValue(
        tx({
          amount: "-1209.43",
          description: "Débito automático ITAU BLACK 3116-3697",
          category: "Credit card payment",
          account: { type: "BANK" },
        })
      )
    ).toBe(0);
  });

  it("MP pagamento de cartão deveria ser 0", () => {
    // Mercado Pago: "Pagamento Cartão de crédito", categoria só "Transfers".
    expect(
      expenseValue(
        tx({ amount: "-36.51", description: "Pagamento Cartão de crédito", category: "Transfers", account: { type: "BANK" } })
      )
    ).toBe(0);
  });

  it("Nubank já funcionava (descrição tem 'fatura') — não pode regredir", () => {
    expect(
      expenseValue(tx({ amount: "-799.46", description: "Pagamento de fatura", category: "Transfers", account: { type: "BANK" } }))
    ).toBe(0);
  });

  it("despesa real de conta continua contando", () => {
    expect(
      expenseValue(tx({ amount: "-44", description: "Pagamento com QR Pix TTRS", category: "Travel", account: { type: "BANK" } }))
    ).toBe(44);
  });

  it("compra no cartão (CREDIT positivo) continua contando", () => {
    expect(
      expenseValue(tx({ amount: "24.98", description: "MERCADOLIVRE*MERCADOLIVRE", category: "Shopping", account: { type: "CREDIT" } }))
    ).toBe(24.98);
  });
});
