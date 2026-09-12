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

describe("applyTxFilters", () => {
  it("pix/credito = método", () => {
    const pixEntrada = tx({ amount: "728.44", type: "BANK", description: "Pix recebido" });
    const pixSaida = tx({ amount: "-50", type: "BANK", description: "Pix enviado" });
    const compraCartao = tx({ amount: "24.98", type: "CREDIT", description: "MERCADOLIVRE" });

    const pix = applyTxFilters([pixEntrada, pixSaida, compraCartao], { ...EMPTY_FILTER, tipo: "pix" });
    // método "pix" inclui entrada E saída de conta, e exclui cartão.
    expect(pix).toContain(pixEntrada);
    expect(pix).toContain(pixSaida);
    expect(pix).not.toContain(compraCartao);

    const credito = applyTxFilters([pixEntrada, pixSaida, compraCartao], { ...EMPTY_FILTER, tipo: "credito" });
    expect(credito).toEqual([compraCartao]);
  });

  it("categorias múltiplas = E", () => {
    const semUser = tx({ amount: "-10", type: "BANK", category: "Outros" });
    const comUser = { ...tx({ amount: "-10", type: "BANK", category: "Outros" }), userCategories: ["Uber", "Viagem"] };

    // principal = 1ª do usuário; sem userCategories cai na Pluggy
    expect(effectiveCategory(comUser)).toBe("Uber");
    expect(effectiveCategory(semUser)).toBe("Outros");
    expect(effectiveCategories(comUser)).toEqual(["Uber", "Viagem"]);
    expect(effectiveCategories(semUser)).toEqual(["Outros"]);

    // filtro múltiplo = E: a tx precisa ter TODAS as selecionadas (pode ter outras além)
    const semFiltro = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: [] });
    expect(semFiltro).toHaveLength(2);
    const soViagem = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Viagem"] });
    expect(soViagem).toEqual([comUser]);
    const uberEViagem = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Uber", "Viagem"] });
    expect(uberEViagem).toEqual([comUser]);
    const uberEPresente = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Uber", "Presente"] });
    expect(uberEPresente).toHaveLength(0);
    const semMatch = applyTxFilters([semUser, comUser], { ...EMPTY_FILTER, categorias: ["Presente"] });
    expect(semMatch).toHaveLength(0);
  });
});
