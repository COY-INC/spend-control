// Compromissos futuros: agrega as transações de cartão DATADAS NO FUTURO (o Pluggy já
// divide cada parcelamento em transações separadas, uma por data de cobrança) em "planos".
//
// Cada plano = uma compra parcelada (agrupada pela descrição-base, sem o sufixo "N/M"),
// com as parcelas que ainda vão vencer: quantas faltam, quanto falta e em que meses caem.

import { parcelInfo } from "../transactions/parcelInfo";

type Tx = {
  amount: unknown;
  date: Date;
  description: string;
  accountId: string;
  institution: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  manual?: boolean;
};

export type CommitmentPlan = {
  label: string; // descrição-base legível (ex.: "MERCADOLIVRE*FOZPANOS")
  bank: string;
  remaining: number; // nº de parcelas futuras
  remainingAmount: number; // soma das parcelas futuras
  total: number | null; // total de parcelas (o M de "N/M"), quando detectado
  months: Record<string, number>; // "YYYY-MM" (UTC) -> valor que cai no mês
  nextDate: string; // ISO da próxima parcela
  lastDate: string; // ISO da última parcela
  manual: boolean; // toda parcela do plano é manual (inserida/aceita pelo usuário) → selo na UI
};

// "N/M" no fim da descrição (ex.: "FOZPANOS 5/12" ou grudado "CAETANOENX05/07").
// Grupo 1 = N (parcela), grupo 2 = M (total). Sem \b: o número às vezes cola no texto.
const PARCEL_RE = /(\d{1,2})\/(\d{1,2})\s*$/;
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const baseLabel = (description: string) => description.replace(PARCEL_RE, "").trim() || description;

export function buildCommitments(transactions: Tx[], now: Date = new Date()): CommitmentPlan[] {
  const future = transactions.filter((t) => t.date > now);

  // Dedup por conteúdo (a MeuPluggy reatribui pluggyTransactionId entre syncs → duplicatas).
  const seen = new Set<string>();
  const deduped = future.filter((t) => {
    const key = `${t.accountId}|${t.date.toISOString().slice(0, 10)}|${Number(t.amount)}|${t.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Agrupa por conta + descrição-base + valor da parcela (a mesma compra parcelada).
  // O valor separa compras distintas do mesmo estabelecimento que colapsariam no mesmo
  // baseLabel (ex.: duas compras "Mp *Aliexpress" → antes dava "faltam 5 de 4").
  // ponytail: agrupa por valor; compras com parcelas de valores diferentes (juros/ajuste
  // de centavos) ou faixas de N complementares no mesmo valor precisariam de atribuição
  // por mês/sequência — subir pra isso só se aparecer na base real.
  const groups = new Map<string, Tx[]>();
  for (const t of deduped) {
    const gkey = `${t.accountId}|${baseLabel(t.description)}|${Number(t.amount).toFixed(2)}`;
    (groups.get(gkey) ?? groups.set(gkey, []).get(gkey)!).push(t);
  }

  const plans: CommitmentPlan[] = [];
  for (const txs of groups.values()) {
    txs.sort((a, b) => +a.date - +b.date);
    const months: Record<string, number> = {};
    let remainingAmount = 0;
    let total: number | null = null;
    for (const t of txs) {
      const v = Number(t.amount);
      remainingAmount += v;
      months[monthKey(t.date)] = (months[monthKey(t.date)] ?? 0) + v;
      const p = parcelInfo(t);
      if (p) total = Math.max(total ?? 0, p.m); // o M de "N/M"
    }
    plans.push({
      label: baseLabel(txs[0].description),
      bank: txs[0].institution,
      remaining: txs.length,
      remainingAmount,
      total,
      months,
      nextDate: txs[0].date.toISOString(),
      lastDate: txs[txs.length - 1].date.toISOString(),
      manual: txs.every((t) => t.manual === true),
    });
  }

  return plans.sort((a, b) => b.remainingAmount - a.remainingAmount);
}
