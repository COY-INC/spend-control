// Rode com: npx tsx src/modules/transactions/manualTransaction.test.ts
import assert from "node:assert";
import { parseManualTransaction } from "./manualTransaction";

// Corpo válido completo: normaliza tipos e mantém os valores.
{
  const r = parseManualTransaction({
    accountId: "acc1",
    amount: "42.5",
    date: "2026-09-26",
    description: "  Dinheiro em espécie  ",
    category: "Mercado",
    userCategories: [" Mercado ", "mercado", "", "Casa"],
  });
  assert.ok("data" in r, "esperava sucesso");
  if ("data" in r) {
    assert.equal(r.data.accountId, "acc1");
    assert.equal(r.data.amount, 42.5);
    assert.equal(r.data.date.toISOString().slice(0, 10), "2026-09-26");
    assert.equal(r.data.description, "Dinheiro em espécie");
    assert.equal(r.data.category, "Mercado");
    // trim + dedupe (case-sensitive) + descarta vazio, preservando ordem.
    assert.deepEqual(r.data.userCategories, ["Mercado", "mercado", "Casa"]);
  }
}

// category/userCategories ausentes → default "" / [].
{
  const r = parseManualTransaction({
    accountId: "acc1",
    amount: 10,
    date: "2026-09-26",
    description: "Pix avulso",
  });
  assert.ok("data" in r);
  if ("data" in r) {
    assert.equal(r.data.category, "");
    assert.deepEqual(r.data.userCategories, []);
  }
}

// accountId ausente → erro.
assert.ok(
  "error" in parseManualTransaction({ amount: 10, date: "2026-09-26", description: "x" }),
  "accountId obrigatório",
);

// amount ausente/NaN → erro.
assert.ok(
  "error" in parseManualTransaction({ accountId: "acc1", date: "2026-09-26", description: "x" }),
  "amount obrigatório",
);
assert.ok(
  "error" in parseManualTransaction({ accountId: "acc1", amount: "abc", date: "2026-09-26", description: "x" }),
  "amount inválido",
);

// date ausente/inválida → erro.
assert.ok(
  "error" in parseManualTransaction({ accountId: "acc1", amount: 10, description: "x" }),
  "date obrigatória",
);
assert.ok(
  "error" in parseManualTransaction({ accountId: "acc1", amount: 10, date: "não é data", description: "x" }),
  "date inválida",
);

// description ausente/em branco → erro.
assert.ok(
  "error" in parseManualTransaction({ accountId: "acc1", amount: 10, date: "2026-09-26" }),
  "description obrigatória",
);
assert.ok(
  "error" in parseManualTransaction({ accountId: "acc1", amount: 10, date: "2026-09-26", description: "   " }),
  "description em branco",
);

// amount 0 é um valor válido (não é "ausente").
assert.ok(
  "data" in parseManualTransaction({ accountId: "acc1", amount: 0, date: "2026-09-26", description: "x" }),
  "amount 0 é válido",
);

console.log("manualTransaction: todos os checks passaram ✓");
