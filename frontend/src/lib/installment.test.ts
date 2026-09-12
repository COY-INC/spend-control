import { installmentGroup, parcelInfo, type ParcelTx } from "./installment";

const now = Date.UTC(2026, 9, 1); // 2026-10-01
const tx = (description: string, amount: number, date: string): ParcelTx & { account: { id: string; type: string } } => ({
  amount,
  date,
  description,
  account: { id: "acc1", type: "CREDIT" },
});

describe("installmentGroup", () => {
  it("AMAZON: drift de 4¢ mantém as 4 juntas; duplicata sai; total/pago/falta corretos", () => {
    // Compra AMAZON completa (/4) com drift de centavos + uma parcela duplicada (churn MeuPluggy).
    const amazon = [
      tx("Amazon 1/4", 32.62, "2026-07-15"),
      tx("Amazon 2/4", 32.66, "2026-08-15"),
      tx("Amazon 2/4", 32.66, "2026-08-15"), // duplicata → deve ser deduplicada
      tx("Amazon 3/4", 32.62, "2026-09-15"),
      tx("Amazon 4/4", 32.66, "2026-10-15"), // futura
    ];
    const aliA = [tx("Mp *Aliexpress 3/4", 32.22, "2026-09-18"), tx("Mp *Aliexpress 4/4", 32.22, "2026-10-18")];
    const aliB = [
      tx("Mp *Aliexpress 2/4", 30.77, "2026-09-20"),
      tx("Mp *Aliexpress 3/4", 30.77, "2026-10-20"),
      tx("Mp *Aliexpress 4/4", 30.77, "2026-11-20"),
    ];
    const all = [...amazon, ...aliA, ...aliB];

    const a = installmentGroup(amazon[1], all, now)!;
    expect(a.siblings).toHaveLength(4);
    expect(a.M).toBe(4);
    expect(a.N).toBe(2);
    expect(a.paidCount).toBe(3);
    expect(a.pago.toFixed(2)).toBe("97.90");
    expect(a.falta.toFixed(2)).toBe("32.66");
    expect(a.total.toFixed(2)).toBe("130.56");
  });

  it("AliExpress: a tolerância separa as duas compras (32,22 vs 30,77 = 1,45 > 10¢)", () => {
    const aliA = [tx("Mp *Aliexpress 3/4", 32.22, "2026-09-18"), tx("Mp *Aliexpress 4/4", 32.22, "2026-10-18")];
    const aliB = [
      tx("Mp *Aliexpress 2/4", 30.77, "2026-09-20"),
      tx("Mp *Aliexpress 3/4", 30.77, "2026-10-20"),
      tx("Mp *Aliexpress 4/4", 30.77, "2026-11-20"),
    ];
    const all = [...aliA, ...aliB];

    const b = installmentGroup(aliA[0], all, now)!;
    expect(b.siblings).toHaveLength(2);
    expect(b.siblings.every((t) => Number(t.amount) === 32.22)).toBe(true);
  });

  it("estimativa de parcelas ainda não sincronizadas: M=4, só 2 presentes ⇒ falta soma 2×valor", () => {
    const partial = [tx("Geladeira 3/4", 100, "2026-09-05"), tx("Geladeira 4/4", 100, "2026-10-05")];
    const p = installmentGroup(partial[0], partial, now)!;
    expect(p.siblings).toHaveLength(2);
    expect(p.total.toFixed(2)).toBe("400.00");
    expect(p.pago.toFixed(2)).toBe("100.00");
    expect(p.falta.toFixed(2)).toBe("300.00");
  });

  it("não é parcelamento ⇒ null", () => {
    const amazon = [
      tx("Amazon 1/4", 32.62, "2026-07-15"),
      tx("Amazon 2/4", 32.66, "2026-08-15"),
      tx("Amazon 3/4", 32.62, "2026-09-15"),
      tx("Amazon 4/4", 32.66, "2026-10-15"),
    ];
    // pool com transações de parcelamento de outras compras, para garantir que não há match falso.
    expect(installmentGroup(tx("Spotify", 21.9, "2026-09-01"), amazon, now)).toBeNull();
    const bankTx: ParcelTx = { amount: -50, date: "2026-09-01", description: "Pix 1/4", account: { id: "b1", type: "BANK" } };
    expect(installmentGroup(bankTx, [bankTx], now)).toBeNull();
  });

  it("Mercado Pago: description LIMPA pela Pluggy (sem 'N/M'), mas installmentNumber/totalInstallments (creditCardMetadata) presentes → ainda agrupa e mostra N/M certos", () => {
    const mp = [1, 2, 3].map((n) => ({
      ...tx("MERCADOLIVRE", 24.98, `2026-0${7 + n}-29`),
      installmentNumber: n,
      totalInstallments: 3,
    }));
    const mpGroup = installmentGroup(mp[0], mp, Date.UTC(2026, 9, 1))!;
    expect(mpGroup.M).toBe(3);
    expect(mpGroup.N).toBe(1);
    expect(mpGroup.siblings).toHaveLength(3);
    expect(parcelInfo({ description: "Spotify" })).toBeNull();
  });
});
