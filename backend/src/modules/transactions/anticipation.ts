import { baseLabel } from "./notes";
import { parcelInfo, type ParcelIdent } from "./parcelInfo";

// "N/M" no fim da descrição (mesma regex de notes.ts/commitments.ts).
const PARCEL_RE = /(\d{1,2})\/(\d{1,2})\s*$/;

type TxIdent = ParcelIdent & { accountId: string; amount: unknown };

// Identidade da parcela ESPECÍFICA antecipada: conta | base | "N/M" | valor.
// null se a transação não é uma parcela (sem "N/M" no texto nem installmentNumber/
// totalInstallments estruturados — ver parcelInfo).
export function anticipationKey(tx: TxIdent): string | null {
  if (!parcelInfo(tx)) return null;
  // Preserva o formato exato do "N/M" do texto (zero à esquerda incluso) quando ele existe, pra
  // não invalidar chaves já persistidas; só recorre aos campos estruturados quando o texto NÃO
  // tem o sufixo (é exatamente o caso que eles resolvem, ex.: Mercado Pago).
  const m = PARCEL_RE.exec(tx.description);
  const nm = m ? `${m[1]}/${m[2]}` : `${tx.installmentNumber}/${tx.totalInstallments}`;
  return `${tx.accountId}|${baseLabel(tx.description)}|${nm}|${Number(tx.amount).toFixed(2)}`;
}

// Sobrescreve a data das parcelas marcadas (date -> at). Puro; NÃO altera o banco.
export function applyAnticipations<T extends TxIdent & { date: Date }>(
  txs: T[],
  flags: Map<string, Date>,
): T[] {
  if (flags.size === 0) return txs;
  return txs.map((t) => {
    const k = anticipationKey(t);
    const at = k ? flags.get(k) : undefined;
    return at ? { ...t, date: at } : t;
  });
}
