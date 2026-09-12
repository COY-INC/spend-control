// Rode com: npx tsx src/modules/transactions/anticipation.test.ts
import assert from "node:assert";
import { anticipationKey, applyAnticipations } from "./anticipation";

const tx = (description: string, amount: number, accountId = "a1") => ({ accountId, description, amount });

// Chave: parcela específica (N/M) + valor; distingue 8/8 de 7/8 e compras concorrentes por valor.
assert.equal(anticipationKey(tx("Tap Air Port0018067078 8/8", 37.94)), "a1|TAP AIR PORT0018067078|8/8|37.94");
assert.notEqual(
  anticipationKey(tx("Tap Air Port 8/8", 37.94)),
  anticipationKey(tx("Tap Air Port 7/8", 37.94)),
  "8/8 difere de 7/8",
);
assert.notEqual(
  anticipationKey(tx("Mp *Aliexpress 4/4", 32.22)),
  anticipationKey(tx("Mp *Aliexpress 4/4", 30.77)),
  "compras concorrentes /4 separadas por valor",
);
assert.equal(anticipationKey(tx("Spotify", 21.9)), null, "sem N/M → sem chave");

// Mercado Pago: description limpa pela Pluggy (sem "N/M"), mas installmentNumber/
// totalInstallments (creditCardMetadata) presentes → ainda gera chave (parcela antecipável).
const mpTx = { accountId: "a1", description: "MERCADOLIVRE", amount: 24.98, installmentNumber: 3, totalInstallments: 6 };
assert.equal(anticipationKey(mpTx), "a1|MERCADOLIVRE|3/6|24.98", "MP sem N/M no texto usa os campos estruturados");

// applyAnticipations: só a parcela marcada assume `at`; demais intactas.
const at = new Date("2026-09-01T12:00:00Z");
const oct = new Date("2026-10-02T00:00:00Z");
const rows = [
  { ...tx("Tap Air Port 8/8", 37.94), date: oct },
  { ...tx("Tap Air Port 7/8", 37.94), date: new Date("2026-08-27T00:00:00Z") },
  { ...tx("Spotify", 21.9), date: oct },
];
const flags = new Map([[anticipationKey(rows[0])!, at]]);
const out = applyAnticipations(rows, flags);
assert.equal(+out[0].date, +at, "8/8 marcada vira `at`");
assert.equal(+out[1].date, +new Date("2026-08-27T00:00:00Z"), "7/8 intacta");
assert.equal(+out[2].date, +oct, "sem N/M intacta");
assert.equal(applyAnticipations(rows, new Map()), rows, "sem flags devolve o mesmo array");

console.log("anticipation: todos os checks passaram ✓");
