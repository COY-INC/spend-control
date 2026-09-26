// Sinal do valor conforme o tipo de conta (mesma convenção de api.ts/expenseValue):
// cartão (CREDIT): despesa (compra) = positivo, receita (estorno/pagamento) = negativo.
// conta (BANK/outros): despesa (saída) = negativo, receita (entrada) = positivo.
export function signedAmount(accountType: string, kind: "despesa" | "receita", value: number): number {
  const isCredit = accountType === "CREDIT";
  if (kind === "despesa") return isCredit ? value : -value;
  return isCredit ? -value : value;
}
