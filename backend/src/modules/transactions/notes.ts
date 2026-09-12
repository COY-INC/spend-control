// Identidade da compra para ancorar o comentário: "accountId|descrição-base|valor".
// Mesma ideia de agrupamento do commitments.ts (base sem "N/M" + valor da parcela),
// aqui com o accountId incluso — o comentário vale para o grupo todo (parcelas/recorrências).

// "N/M" no fim (ex.: "FOZPANOS 5/12" ou colado "CAETANOENX05/07").
const PARCEL_RE = /(\d{1,2})\/(\d{1,2})\s*$/;

export function baseLabel(description: string): string {
  const stripped = description.replace(PARCEL_RE, "").trim() || description;
  return stripped.toUpperCase().replace(/\s+/g, " ").trim();
}

export function annotationKey(t: { accountId: string; description: string; amount: unknown }): string {
  return `${t.accountId}|${baseLabel(t.description)}|${Number(t.amount).toFixed(2)}`;
}

// As parcelas de uma compra derivam alguns centavos entre si (prod real: TAP 5¢, Amazon 4¢).
// Casa por tolerância — MESMA regra do modal (frontend/src/lib/installment.ts): conta+base
// iguais e valor a ≤TOL. Compras distintas no mesmo lugar ficam a reais de distância.
// ponytail: o baseLabel daqui não tira acento (parcelBase do front tira) — diverge só em
// nomes acentuados, inexistentes na base real; subir se aparecer.
export const CENT_TOL = 0.1;

type TxIdent = { accountId: string; description: string; amount: unknown };

// Mesma compra: conta+base iguais e valor dentro da tolerância. Usado pra propagar categoria.
export function sameGroup(a: TxIdent, b: TxIdent): boolean {
  return (
    a.accountId === b.accountId &&
    baseLabel(a.description) === baseLabel(b.description) &&
    Math.abs(Number(a.amount) - Number(b.amount)) <= CENT_TOL
  );
}

// Uma key de nota (accountId|base|valor) pertence à mesma compra que t?
export function keyMatches(key: string, t: TxIdent): boolean {
  const first = key.indexOf("|");
  const last = key.lastIndexOf("|");
  return (
    key.slice(0, first) === t.accountId &&
    key.slice(first + 1, last) === baseLabel(t.description) &&
    Math.abs(Number(key.slice(last + 1)) - Number(t.amount)) <= CENT_TOL
  );
}

// Comentário da compra de t: a nota mais próxima em valor dentro da tolerância (ou null).
export function findNote(notes: { key: string; note: string }[], t: TxIdent): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const n of notes) {
    if (!keyMatches(n.key, t)) continue;
    const d = Math.abs(Number(n.key.slice(n.key.lastIndexOf("|") + 1)) - Number(t.amount));
    if (d < bestD) {
      bestD = d;
      best = n.note;
    }
  }
  return best;
}
