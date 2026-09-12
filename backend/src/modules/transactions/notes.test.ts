// Rode com: npx tsx src/modules/transactions/notes.test.ts
import assert from "node:assert";
import { annotationKey, baseLabel, findNote, sameGroup } from "./notes";

// baseLabel remove "N/M" (com espaço e colado) e normaliza.
assert.equal(baseLabel("Mp*Aliexpress 1/7"), "MP*ALIEXPRESS");
assert.equal(baseLabel("CAETANOENX05/07"), "CAETANOENX");
assert.equal(baseLabel("  spotify  "), "SPOTIFY");

// As 7 parcelas (mesma base + mesmo valor + mesma conta) geram a MESMA key.
const p1 = annotationKey({ accountId: "acc1", description: "Mp*Aliexpress 1/7", amount: 42.9 });
const p7 = annotationKey({ accountId: "acc1", description: "Mp*Aliexpress 7/7", amount: 42.9 });
assert.equal(p1, p7);
assert.equal(p1, "acc1|MP*ALIEXPRESS|42.90");

// Valor diferente = compra distinta = key distinta.
const outro = annotationKey({ accountId: "acc1", description: "Mp*Aliexpress 1/3", amount: 99.9 });
assert.notEqual(p1, outro);

// Conta diferente = key distinta.
const outraConta = annotationKey({ accountId: "acc2", description: "Mp*Aliexpress 1/7", amount: 42.9 });
assert.notEqual(p1, outraConta);

// --- Tolerância (±10¢): comentário e categoria se replicam apesar do drift de centavos. ---
const A = (description: string, amount: number, accountId = "acc1") => ({ accountId, description, amount });

// sameGroup: parcelas da mesma compra com drift juntam; compra distinta (valor a reais) separa.
assert.ok(sameGroup(A("Amazon 1/4", 32.62), A("Amazon 2/4", 32.66)), "drift de 4¢ = mesmo grupo");
assert.ok(sameGroup(A("TAP AIR 5/8", 37.94), A("TAP AIR 6/8", 37.99)), "drift de 5¢ = mesmo grupo");
assert.ok(!sameGroup(A("Mp *Aliexpress 3/4", 32.22), A("Mp *Aliexpress 2/4", 30.77)), "1,45 = compras distintas");
assert.ok(!sameGroup(A("Amazon 1/4", 32.62, "acc1"), A("Amazon 1/4", 32.62, "acc2")), "conta distinta separa");

// findNote: uma nota posta numa parcela alcança as parcelas com drift; escolhe a mais próxima.
const notes = [
  { key: annotationKey(A("Amazon 2/4", 32.66)), note: "presente" },
  { key: annotationKey(A("Mp *Aliexpress 3/4", 30.77)), note: "capinha" },
];
assert.equal(findNote(notes, A("Amazon 1/4", 32.62)), "presente", "parcela de 32,62 herda a nota de 32,66");
assert.equal(findNote(notes, A("Amazon 4/4", 32.66)), "presente");
assert.equal(findNote(notes, A("Mp *Aliexpress 4/4", 30.79)), "capinha", "drift de 2¢ herda");
assert.equal(findNote(notes, A("Mp *Aliexpress 3/4", 32.22)), null, "compra distinta (32,22) não herda");
assert.equal(findNote(notes, A("Spotify", 21.9)), null, "outro estabelecimento não herda");

console.log("notes: todos os checks passaram ✓");
