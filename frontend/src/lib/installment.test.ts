// Rode com: npx tsx src/lib/installment.test.ts
import assert from "node:assert";
import { installmentGroup, parcelInfo, type ParcelTx } from "./installment";

const now = Date.UTC(2026, 9, 1); // 2026-10-01
const tx = (description: string, amount: number, date: string): ParcelTx & { account: { id: string; type: string } } => ({
  amount,
  date,
  description,
  account: { id: "acc1", type: "CREDIT" },
});

// Compra AMAZON completa (/4) com drift de centavos + uma parcela duplicada (churn MeuPluggy).
const amazon = [
  tx("Amazon 1/4", 32.62, "2026-07-15"),
  tx("Amazon 2/4", 32.66, "2026-08-15"),
  tx("Amazon 2/4", 32.66, "2026-08-15"), // duplicata → deve ser deduplicada
  tx("Amazon 3/4", 32.62, "2026-09-15"),
  tx("Amazon 4/4", 32.66, "2026-10-15"), // futura
];
// Duas compras AliExpress distintas (/4 cada), separadas só pelo valor (caso real de prod).
const aliA = [tx("Mp *Aliexpress 3/4", 32.22, "2026-09-18"), tx("Mp *Aliexpress 4/4", 32.22, "2026-10-18")];
const aliB = [
  tx("Mp *Aliexpress 2/4", 30.77, "2026-09-20"),
  tx("Mp *Aliexpress 3/4", 30.77, "2026-10-20"),
  tx("Mp *Aliexpress 4/4", 30.77, "2026-11-20"),
];
const all = [...amazon, ...aliA, ...aliB];

// 1) AMAZON: drift de 4¢ mantém as 4 juntas; duplicata sai; total/pago/falta corretos.
const a = installmentGroup(amazon[1], all, now)!;
assert.equal(a.siblings.length, 4, "AMAZON: 4 parcelas (dedup da duplicata)");
assert.equal(a.M, 4);
assert.equal(a.N, 2);
assert.equal(a.paidCount, 3, "3 parcelas já venceram até 01/10");
assert.equal(a.pago.toFixed(2), "97.90");
assert.equal(a.falta.toFixed(2), "32.66");
assert.equal(a.total.toFixed(2), "130.56");

// 2) AliExpress: a tolerância separa as duas compras (32,22 vs 30,77 = 1,45 > 10¢).
const b = installmentGroup(aliA[0], all, now)!;
assert.equal(b.siblings.length, 2, "só as parcelas de 32,22");
assert.ok(b.siblings.every((t) => Number(t.amount) === 32.22), "nenhuma de 30,77 vazou");

// 3) Estimativa de parcelas ainda não sincronizadas: M=4, só 2 presentes ⇒ falta soma 2×valor.
const partial = [tx("Geladeira 3/4", 100, "2026-09-05"), tx("Geladeira 4/4", 100, "2026-10-05")];
const p = installmentGroup(partial[0], partial, now)!;
assert.equal(p.siblings.length, 2);
assert.equal(p.total.toFixed(2), "400.00", "total estima as 4 parcelas");
assert.equal(p.pago.toFixed(2), "100.00");
assert.equal(p.falta.toFixed(2), "300.00", "1 futura presente + 2 ainda não sincronizadas");

// 4) Não é parcelamento ⇒ null.
assert.equal(installmentGroup(tx("Spotify", 21.9, "2026-09-01"), all, now), null, "cartão sem N/M");
const bankTx: ParcelTx = { amount: -50, date: "2026-09-01", description: "Pix 1/4", account: { id: "b1", type: "BANK" } };
assert.equal(installmentGroup(bankTx, [bankTx], now), null, "conta (não-cartão) com N/M");

// 5) Mercado Pago: description LIMPA pela Pluggy (sem "N/M"), mas installmentNumber/
//    totalInstallments (creditCardMetadata) presentes → ainda agrupa e mostra N/M certos.
const mp = [1, 2, 3].map((n) => ({
  ...tx("MERCADOLIVRE", 24.98, `2026-0${7 + n}-29`),
  installmentNumber: n,
  totalInstallments: 3,
}));
const mpGroup = installmentGroup(mp[0], mp, Date.UTC(2026, 9, 1))!;
assert.equal(mpGroup.M, 3, "MP: M vem do totalInstallments, não do texto");
assert.equal(mpGroup.N, 1, "MP: N vem do installmentNumber");
assert.equal(mpGroup.siblings.length, 3, "MP: as 3 parcelas se agrupam mesmo sem N/M no texto");
assert.equal(parcelInfo({ description: "Spotify" }), null, "sem N/M e sem metadata → não é parcela");

console.log("installment: todos os checks passaram ✓");
