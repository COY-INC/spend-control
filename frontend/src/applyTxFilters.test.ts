// Rode com: npx tsx src/applyTxFilters.test.ts
import assert from "node:assert";
import { applyTxFilters, EMPTY_FILTER, effectiveCategory, effectiveCategories, type Transaction } from "./api";

const tx = (p: { amount: string; type: string; category?: string; description?: string }): Transaction => ({
  id: Math.random().toString(),
  amount: p.amount,
  date: "2026-08-15",
  description: p.description ?? "x",
  category: p.category ?? "Outros",
  userCategories: [],
  account: { id: "a", type: p.type, name: null, item: { institution: "Mercado Pago", userId: "u" } },
});

const pixEntrada = tx({ amount: "728.44", type: "BANK", description: "Pix recebido" });
const pixSaida = tx({ amount: "-50", type: "BANK", description: "Pix enviado" });
const compraCartao = tx({ amount: "24.98", type: "CREDIT", description: "MERCADOLIVRE" });

const pix = applyTxFilters([pixEntrada, pixSaida, compraCartao], { ...EMPTY_FILTER, tipo: "pix" });
// método "pix" inclui entrada E saída de conta, e exclui cartão.
assert.ok(pix.includes(pixEntrada), "pix deve incluir a entrada via conta (728,44)");
assert.ok(pix.includes(pixSaida), "pix deve incluir a saída via conta");
assert.ok(!pix.includes(compraCartao), "pix não deve incluir cartão");

const credito = applyTxFilters([pixEntrada, pixSaida, compraCartao], { ...EMPTY_FILTER, tipo: "credito" });
assert.deepEqual(credito, [compraCartao], "credito deve conter só o cartão");

console.log("OK: applyTxFilters (pix/credito = método)");

// --- Categorias múltiplas ---
const semUser = tx({ amount: "-10", type: "BANK", category: "Outros" });
const comUser = { ...tx({ amount: "-10", type: "BANK", category: "Outros" }), userCategories: ["Uber", "Viagem"] };

// principal = 1ª do usuário; sem userCategories cai na Pluggy
assert.equal(effectiveCategory(comUser), "Uber", "principal = 1ª do usuário");
assert.equal(effectiveCategory(semUser), "Outros", "sem userCategories usa a Pluggy");
assert.deepEqual(effectiveCategories(comUser), ["Uber", "Viagem"], "lista completa do usuário");
assert.deepEqual(effectiveCategories(semUser), ["Outros"], "sem userCategories = [Pluggy]");

// filtro múltiplo = E: a tx precisa ter TODAS as selecionadas (pode ter outras além)
const semFiltro = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: [] });
assert.equal(semFiltro.length, 2, "sem categorias selecionadas passa tudo");
const soViagem = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Viagem"] });
assert.deepEqual(soViagem, [comUser], "uma categoria: casa quem a contém");
const uberEViagem = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Uber", "Viagem"] });
assert.deepEqual(uberEViagem, [comUser], "E: casa quem tem TODAS (Uber e Viagem)");
const uberEPresente = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Uber", "Presente"] });
assert.equal(uberEPresente.length, 0, "E: falta Presente -> não casa, mesmo tendo Uber");
const semMatch = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Presente"] });
assert.equal(semMatch.length, 0, "nenhuma tx tem Presente -> filtrada");

console.log("OK: applyTxFilters (categorias múltiplas = E)");
