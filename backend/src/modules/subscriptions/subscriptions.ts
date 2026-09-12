// Detecção de assinaturas / recorrências.
//
// Uma assinatura = mesmo estabelecimento cobrando um valor PARECIDO em >=3 meses distintos
// dos últimos 6. A similaridade de valor é o que separa assinatura (preço fixo, ex.: Spotify)
// de um estabelecimento usado com frequência mas valores variados (ex.: Mercado Livre).
//
// Considera só DESPESAS (cartão amount>0; conta amount<0), exclui parcelamentos (descrição
// com "N/M" — já estão em Compromissos) e movimentações internas (transferência/fatura/reserva).

import { annotationKey } from "../transactions/notes";
import { parcelInfo } from "../transactions/parcelInfo";

type Tx = {
  amount: unknown;
  date: Date;
  description: string;
  category: string;
  accountType: string;
  institution: string;
  accountId: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
};

export type Subscription = {
  label: string; // estabelecimento (descrição mais recente do grupo)
  bank: string; // instituição da cobrança mais recente
  key: string; // identidade (annotationKey) da cobrança mais recente — resolve o comentário
  monthlyAmount: number; // mediana das cobranças na faixa
  monthlyTotals: Record<string, number>; // "YYYY-MM" -> total gasto naquele mês
  occurrences: number; // meses distintos com cobrança
  lastDate: string; // ISO da última cobrança
  months: string[]; // "YYYY-MM" em que apareceu
};

const PARCEL_RE = /(\d{1,2})\/(\d{1,2})\s*$/;
const RESERVE_RE = /^\s*dinheiro (reservado|retirado)\b/i;
const INTERNAL_CATEGORIES = new Set(["Transfer - Internal", "Same person transfer"]);
const MONTHS_WINDOW = 6;
const MIN_MONTHS = 3;
const TOLERANCE = 0.15; // ±15% da mediana

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Chave do estabelecimento: normaliza pra agrupar as cobranças do mesmo vendedor.
function merchantKey(desc: string): string {
  return desc
    .replace(PARCEL_RE, " ")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(PIX|TRANSFERENCIA|COMPRA|PAGAMENTO|MENSALIDADE|DE|DA|DO)\b/g, " ")
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Despesa de uma transação (>0) ou 0 se não for despesa "de vendedor".
function expenseAmount(t: Tx): number {
  if (INTERNAL_CATEGORIES.has(t.category) || RESERVE_RE.test(t.description)) return 0;
  if (/fatura/i.test(t.description)) return 0; // pagamento de fatura: interno
  const v = Number(t.amount);
  if (t.accountType === "CREDIT") return v > 0 ? v : 0; // compra no cartão
  return v < 0 ? -v : 0; // saída da conta
}

export function detectSubscriptions(transactions: Tx[], now: Date = new Date()): Subscription[] {
  const oldest = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS_WINDOW - 1), 1));

  // Agrupa despesas elegíveis (na janela, não parcelamento) por estabelecimento.
  const groups = new Map<string, { amount: number; rawAmount: number; date: Date; desc: string; institution: string; accountId: string }[]>();
  for (const t of transactions) {
    if (t.date < oldest) continue;
    if (parcelInfo(t)) continue; // parcelamento → Compromissos
    const amt = expenseAmount(t);
    if (amt <= 0) continue;
    const key = merchantKey(t.description);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push({ amount: amt, rawAmount: Number(t.amount), date: t.date, desc: t.description, institution: t.institution, accountId: t.accountId });
  }

  const subs: Subscription[] = [];
  for (const items of groups.values()) {
    const med = median(items.map((i) => i.amount));
    if (med <= 0) continue;
    // Só as cobranças dentro da faixa de ±TOLERANCE da mediana (tira outliers de valor).
    const inBand = items.filter((i) => Math.abs(i.amount - med) <= med * TOLERANCE);
    const months = [...new Set(inBand.map((i) => monthKey(i.date)))].sort();
    if (months.length < MIN_MONTHS) continue; // não recorre o bastante

    const last = inBand.reduce((a, b) => (b.date > a.date ? b : a));
    // Recorrência sumida: sem cobrança nos últimos 2 meses (mês atual + anterior) → não exibe.
    const recentCutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    if (last.date < recentCutoff) continue;
    // Total gasto por mês (YYYY-MM) — o card mostra o do mês selecionado.
    const monthlyTotals: Record<string, number> = {};
    for (const i of inBand) monthlyTotals[monthKey(i.date)] = (monthlyTotals[monthKey(i.date)] ?? 0) + i.amount;
    subs.push({
      label: last.desc,
      bank: last.institution,
      key: annotationKey({ accountId: last.accountId, description: last.desc, amount: last.rawAmount }),
      monthlyAmount: median(inBand.map((i) => i.amount)),
      monthlyTotals,
      occurrences: months.length,
      lastDate: last.date.toISOString(),
      months,
    });
  }

  return subs.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}
