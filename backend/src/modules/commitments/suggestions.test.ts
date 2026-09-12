// Self-check das sugestões + reconciliação. Rode: npx tsx src/modules/commitments/suggestions.test.ts
import assert from "node:assert";
import { buildSuggestions, manualRowsToDelete, addMonthsUTC, purchaseKey } from "./suggestions";

const tx = (o: Partial<Parameters<typeof buildSuggestions>[0][number]> & { accountId?: string }) => ({
  accountId: "acc1",
  amount: 100,
  date: new Date("2026-09-08T00:00:00.000Z"),
  description: "LOJA",
  installmentNumber: null,
  totalInstallments: null,
  institution: "Bradesco",
  cardNumber: "1234",
  ...o,
});

// 1) Bradesco: parcelas 1..8 de 12 postadas (metadata N/M), nenhuma futura → sugere 9..12.
{
  const rows = Array.from({ length: 8 }, (_, i) =>
    tx({ description: "AMAZON PRIME BR", amount: 13.9, installmentNumber: i + 1, totalInstallments: 12, date: addMonthsUTC(new Date("2026-02-08T00:00:00.000Z"), i) }),
  );
  const [s] = buildSuggestions(rows);
  assert(s, "deveria gerar 1 sugestão");
  assert.equal(s.installments.length, 4, `esperado 4 parcelas faltando, veio ${s.installments.length}`);
  assert.equal(s.existing.length, 8, `esperado 8 parcelas já no banco, veio ${s.existing.length}`);
  assert.equal(s.existing[0].n, 1, "1ª existente deve ser a parcela 1");
  assert.equal(s.existing[7].n, 8, "última existente deve ser a parcela 8");
  assert.equal(s.nextInstallmentNumber, 9, `próxima parcela esperada 9, veio ${s.nextInstallmentNumber}`);
  assert.equal(s.totalInstallments, 12);
  assert.equal(s.installments[0].n, 9);
  // última postada 8/12 em set/26 → 9/12 em out/26.
  assert.equal(s.installments[0].date.slice(0, 7), "2026-10", `9/12 deveria cair em out/26, veio ${s.installments[0].date}`);
  assert.equal(s.installments[3].date.slice(0, 7), "2027-01", `12/12 deveria cair em jan/27, veio ${s.installments[3].date}`);
}

// 2) Nubank: já projeta — parcelas 1..12 existem como linhas (algumas futuras) → maxN=12 → nada.
{
  const rows = Array.from({ length: 12 }, (_, i) =>
    tx({ description: "TAP AIR", amount: 50, installmentNumber: i + 1, totalInstallments: 12, institution: "Nubank" }),
  );
  assert.equal(buildSuggestions(rows).length, 0, "banco que projeta tudo não deve gerar sugestão");
}

// 3) Dismissal: a chave da compra recusada não reaparece.
{
  const rows = [tx({ description: "SHOPEE", amount: 20, installmentNumber: 2, totalInstallments: 5 })];
  const key = purchaseKey(rows[0])!;
  assert.equal(buildSuggestions(rows, new Set([key])).length, 0, "sugestão recusada não deve reaparecer");
  assert.equal(buildSuggestions(rows).length, 1, "sem dismissal, sugere");
}

// 4) Drift de centavos: 7@13.90 + 8@13.94 são a MESMA compra (não split) → maxN=8, faltam 4.
{
  const rows = [
    tx({ description: "AMAZON", amount: 13.9, installmentNumber: 7, totalInstallments: 12 }),
    tx({ description: "AMAZON", amount: 13.94, installmentNumber: 8, totalInstallments: 12 }),
  ];
  const s = buildSuggestions(rows);
  assert.equal(s.length, 1, `drift não deve virar 2 grupos, veio ${s.length}`);
  assert.equal(s[0].installments.length, 4, `faltam 4, veio ${s[0].installments.length}`);
}

// 5) Transação sem N/M (nem metadata) é ignorada.
{
  const rows = [tx({ description: "UBER TRIP", amount: 15 })];
  assert.equal(buildSuggestions(rows).length, 0, "não-parcela não gera sugestão");
}

// 6) Reconcile primário: manual 9/12 + real 9/12 na mesma conta → apaga a manual.
{
  const manual = [tx({ id: "m1", description: "AMAZON", amount: 13.9, installmentNumber: 9, totalInstallments: 12, manual: true, date: new Date("2026-10-08") })];
  const real = [tx({ id: "r1", description: "AMAZON PRIME BR", amount: 13.9, installmentNumber: 9, totalInstallments: 12, date: new Date("2026-10-05") })];
  assert.deepEqual(manualRowsToDelete(manual, real), ["m1"], "manual 9/12 deve sair quando a real 9/12 chega");
}

// 7) Reconcile fallback: real do Mercado Pago sem N/M estruturado (installment null), casa por
//    base+valor+mês.
{
  const manual = [tx({ id: "m2", description: "MERCADOLIVRE", amount: 30, installmentNumber: 4, totalInstallments: 6, manual: true, date: new Date("2026-11-10") })];
  const real = [tx({ id: "r2", description: "MERCADOLIVRE", amount: 30, installmentNumber: null, totalInstallments: null, date: new Date("2026-11-02") })];
  assert.deepEqual(manualRowsToDelete(manual, real), ["m2"], "fallback por base+valor+mês deve casar MP");
}

// 8) Reconcile: sem correspondente real → mantém a manual.
{
  const manual = [tx({ id: "m3", description: "AMAZON", amount: 13.9, installmentNumber: 11, totalInstallments: 12, manual: true, date: new Date("2026-12-08") })];
  const real = [tx({ id: "r3", description: "AMAZON", amount: 13.9, installmentNumber: 9, totalInstallments: 12, date: new Date("2026-10-08") })];
  assert.deepEqual(manualRowsToDelete(manual, real), [], "sem a real correspondente, a manual fica");
}

// 9) Portador: cardOwner separa principal/dependente pela lista de additionalCards da conta.
{
  const deps = ["9999"];
  const dep = buildSuggestions([tx({ description: "LOJA A", amount: 10, installmentNumber: 2, totalInstallments: 4, cardNumber: "9999", additionalCards: deps })]);
  const pri = buildSuggestions([tx({ description: "LOJA B", amount: 10, installmentNumber: 2, totalInstallments: 4, cardNumber: "1111", additionalCards: deps })]);
  assert.equal(dep[0].cardOwner, "dependente", "cartão na lista de adicionais → dependente");
  assert.equal(pri[0].cardOwner, "principal", "cartão fora da lista → principal");
  const semDep = buildSuggestions([tx({ description: "LOJA C", amount: 10, installmentNumber: 2, totalInstallments: 4, cardNumber: "1111" })]);
  assert.equal(semDep[0].cardOwner, null, "sem adicionais cadastrados → null");
}

console.log("suggestions: todos os checks passaram ✓");
