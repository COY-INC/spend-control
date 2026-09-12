// Rode com: npx tsx src/modules/subscriptions/subscriptions.test.ts
import assert from "node:assert";
import { detectSubscriptions } from "./subscriptions";

const now = new Date("2026-08-15T00:00:00Z");
const tx = (amount: number, iso: string, institution: string) => ({
  amount,
  date: new Date(iso),
  description: "Spotify",
  category: "Music streaming",
  accountType: "CREDIT",
  institution,
  accountId: "acc1",
});

// 3 meses distintos de cobrança fixa → detecta, e bank = instituição da cobrança mais recente.
const subs = detectSubscriptions(
  [tx(21.9, "2026-06-10", "Nubank"), tx(21.9, "2026-07-10", "Nubank"), tx(21.9, "2026-08-10", "Itaú")],
  now,
);
assert.equal(subs.length, 1, "esperava 1 assinatura");
assert.equal(subs[0].bank, "Itaú", `bank esperado Itaú, veio ${subs[0].bank}`);
// key = identidade (annotationKey) da cobrança mais recente → resolve o comentário no controller.
assert.equal(subs[0].key, "acc1|SPOTIFY|21.90", `key esperado acc1|SPOTIFY|21.90, veio ${subs[0].key}`);
// total gasto no mês selecionado (ago/2026 = 21.90).
assert.equal(subs[0].monthlyTotals["2026-08"], 21.9, `total de ago esperado 21.90, veio ${subs[0].monthlyTotals["2026-08"]}`);

// Recorrência sumida: 3 meses distintos na janela, mas última cobrança há >2 meses (mai, com now=ago) → não aparece.
const sumida = detectSubscriptions(
  [tx(10, "2026-03-10", "Nubank"), tx(10, "2026-04-10", "Nubank"), tx(10, "2026-05-10", "Nubank")],
  now,
);
assert.equal(sumida.length, 0, `recorrência sem cobrança nos últimos 2 meses não deve aparecer, veio ${sumida.length}`);

console.log("subscriptions: todos os checks passaram ✓");
