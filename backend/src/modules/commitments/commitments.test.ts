import assert from "node:assert";
import { buildCommitments } from "./commitments";

// Caso real de prod: duas compras "Mp *Aliexpress" distintas (/4 cada) no mesmo cartão,
// separadas só pelo valor da parcela. Antes do fix o baseLabel fundia as duas → "faltam 5 de 4".
const now = new Date("2026-08-29T00:00:00Z");
const tx = (date: string, amount: number, description: string) => ({
  amount,
  date: new Date(date),
  description,
  accountId: "acc1",
  institution: "Itaú",
});

const plans = buildCommitments(
  [
    tx("2026-09-18", 32.22, "Mp *Aliexpress 3/4"),
    tx("2026-10-18", 32.22, "Mp *Aliexpress 4/4"),
    tx("2026-09-20", 30.77, "Mp *Aliexpress 2/4"),
    tx("2026-10-20", 30.77, "Mp *Aliexpress 3/4"),
    tx("2026-11-20", 30.77, "Mp *Aliexpress 4/4"),
  ],
  now,
);

// Dois planos separados, nenhum com remaining > total.
assert.equal(plans.length, 2, "esperava 2 planos");
for (const p of plans) {
  assert.ok(p.total !== null && p.remaining <= p.total, `remaining ${p.remaining} > total ${p.total}`);
}
const byCount = [...plans].sort((a, b) => a.remaining - b.remaining);
assert.deepEqual(
  byCount.map((p) => [p.remaining, p.total]),
  [[2, 4], [3, 4]],
  "esperava planos 2/4 e 3/4",
);
assert.equal(byCount[0].remainingAmount, 64.44); // 2× 32,22
assert.equal(byCount[1].remainingAmount, 92.31); // 3× 30,77

console.log("ok: commitments split por valor");

// Mercado Pago: description limpa (sem "N/M"), total (M) só sai via installmentNumber/
// totalInstallments — sem os campos estruturados, `total` ficaria null (regressão do fix).
{
  const mpPlans = buildCommitments(
    [
      { amount: 11.53, date: new Date("2026-09-29"), description: "MP*3PRODUTOS", accountId: "acc2", institution: "Mercado Pago", installmentNumber: 2, totalInstallments: 3 },
      { amount: 11.53, date: new Date("2026-10-29"), description: "MP*3PRODUTOS", accountId: "acc2", institution: "Mercado Pago", installmentNumber: 3, totalInstallments: 3 },
    ],
    now,
  );
  assert.equal(mpPlans.length, 1, "1 plano MP");
  assert.equal(mpPlans[0].total, 3, `total esperado 3, veio ${mpPlans[0].total}`);
  assert.equal(mpPlans[0].remaining, 2);
}
