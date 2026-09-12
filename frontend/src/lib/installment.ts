// Agrupa as parcelas de UMA compra de cartão a partir de uma parcela clicada.
// Pura (sem deps de ambiente) → testável via `npx tsx installment.test.ts`.

// "N/M" no fim da descrição (mesma regex de commitments.ts/notes.ts no backend).
export const PARCEL_RE = /(\d{1,2})\/(\d{1,2})\s*$/;

// Identidade estruturada da parcela: usa installmentNumber/totalInstallments (creditCardMetadata
// da Pluggy) quando presentes; cai pro "N/M" no fim da descrição como fallback. Necessário
// porque a Pluggy limpa/normaliza a description pra alguns bancos (ex.: Mercado Pago), removendo
// o "N/M" original do texto — ver backend/src/modules/transactions/parcelInfo.ts (mesma regra).
export function parcelInfo(t: {
  description: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
}): { n: number; m: number } | null {
  if (t.installmentNumber != null && t.totalInstallments != null) {
    return { n: t.installmentNumber, m: t.totalInstallments };
  }
  const m = PARCEL_RE.exec(t.description);
  return m ? { n: Number(m[1]), m: Number(m[2]) } : null;
}

// Base da compra: descrição sem "N/M", sem acento, normalizada — junta as parcelas.
export const parcelBase = (d: string) =>
  d.replace(PARCEL_RE, "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();

// As parcelas de uma mesma compra variam alguns centavos entre si (prod real: TAP 5¢,
// Mercadolivre*25best 7¢). Compras distintas no mesmo lugar ficam a reais de distância
// (AliExpress 30,77 vs 32,22). Casa por |Δvalor|<=TOL: junta o drift, separa compras.
// ponytail: duas compras a <10¢ no mesmo estabelecimento+M se fundiriam — não ocorre na
// base real; se aparecer, subir pra atribuição por sequência N.
export const CENT_TOL = 0.1;

export type ParcelTx = {
  amount: string | number;
  date: string;
  description: string;
  account: { id: string; type: string };
  installmentNumber?: number | null;
  totalInstallments?: number | null;
};

export type InstallmentGroup<T extends ParcelTx> = {
  M: number; // total de parcelas
  N: number; // nº da parcela clicada
  base: string;
  siblings: T[]; // parcelas da compra, ascendente por data
  total: number;
  pago: number;
  falta: number;
  paidCount: number;
};

// Mesma compra por tolerância (conta + base + valor±TOL) — espelha notes.sameGroup no backend.
// Usado pra propagar categoria do usuário no cliente (otimista) igual o backend faz.
export function sameChargeGroup(a: ParcelTx, b: ParcelTx): boolean {
  return (
    a.account.id === b.account.id &&
    parcelBase(a.description) === parcelBase(b.description) &&
    Math.abs(Number(a.amount) - Number(b.amount)) <= CENT_TOL
  );
}

// null se a transação não for uma parcela de cartão (cartão + "N/M" na descrição, ou
// installmentNumber/totalInstallments estruturados — ver parcelInfo).
export function installmentGroup<T extends ParcelTx>(
  origin: T,
  all: T[],
  now: number = Date.now(),
): InstallmentGroup<T> | null {
  const isCard = (t: ParcelTx) => t.account.type === "CREDIT";
  const originParcel = parcelInfo(origin);
  if (!(isCard(origin) && originParcel)) return null;

  const M = originParcel.m;
  const base = parcelBase(origin.description);
  const originAmt = Math.abs(Number(origin.amount));

  const seen = new Set<string>();
  const siblings = all
    .filter((t) => {
      if (!isCard(t) || t.account.id !== origin.account.id) return false;
      if (parcelBase(t.description) !== base) return false;
      if (parcelInfo(t)?.m !== M) return false;
      if (Math.abs(Math.abs(Number(t.amount)) - originAmt) > CENT_TOL) return false;
      const dk = `${t.date.slice(0, 10)}|${Number(t.amount)}|${t.description}`; // dedup churn da MeuPluggy
      if (seen.has(dk)) return false;
      seen.add(dk);
      return true;
    })
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));

  let pago = 0,
    faltaPresent = 0,
    paidCount = 0;
  for (const t of siblings) {
    const v = Math.abs(Number(t.amount));
    +new Date(t.date) <= now ? ((pago += v), paidCount++) : (faltaPresent += v);
  }
  const missing = Math.max(0, M - siblings.length); // parcelas ainda não sincronizadas ⇒ futuras
  const falta = faltaPresent + missing * originAmt;

  return { M, N: originParcel.n, base, siblings, total: pago + falta, pago, falta, paidCount };
}
