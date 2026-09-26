import { signedAmount } from "./manualTransaction";

describe("signedAmount", () => {
  it("conta BANK: despesa é negativa, receita é positiva", () => {
    expect(signedAmount("BANK", "despesa", 50)).toBe(-50);
    expect(signedAmount("BANK", "receita", 50)).toBe(50);
  });

  it("conta CREDIT: despesa (compra) é positiva, receita (estorno) é negativa", () => {
    expect(signedAmount("CREDIT", "despesa", 50)).toBe(50);
    expect(signedAmount("CREDIT", "receita", 50)).toBe(-50);
  });
});
