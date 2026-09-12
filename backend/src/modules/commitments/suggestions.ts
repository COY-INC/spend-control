// Sugestões de parcelas futuras + reconciliação das linhas manuais.
//
// Bancos como Bradesco/Mercado Pago (via MeuPluggy) só registram a parcela que JÁ entrou na
// fatura — não projetam as futuras como transações datadas à frente (Nubank/Itaú projetam).
// Aqui derivamos as parcelas que faltam a partir do metadata N/M das parcelas reais e
// oferecemos como SUGESTÃO (o usuário aceita/recusa/adapta; aceitar cria linhas `manual`).
//
// Detecção é bank-agnostic: `remaining = M - maxN observado`. Como Nubank/Itaú já têm as
// futuras como linhas, o maxN deles já chega em M → remaining 0 → nenhuma sugestão. Só quem
// não projeta sobra. Uma vez aceita, as linhas manuais sobem o maxN pra M → a sugestão some.

import { parcelInfo } from "../transactions/parcelInfo";
import { baseLabel } from "../transactions/notes";
import { cardOwner } from "../cards/openInvoice";

// Mesma tolerância de notes.ts: parcelas da mesma compra derivam alguns centavos entre si.
const CENT_TOL = 0.1;

export type SuggestionTx = {
  id?: string;
  accountId: string;
  amount: unknown;
  date: Date;
  description: string;
  installmentNumber?: number | null;
  totalInstallments?: number | null;
  manual?: boolean;
  institution?: string;
  cardNumber?: string | null;
  additionalCards?: string[]; // 4 últimos dígitos dos cartões dependentes da conta (p/ separar portador)
};

export type Suggestion = {
  key: string; // identidade da COMPRA (accountId|base|M) — estável entre scans
  accountId: string;
  bank: string;
  cardNumber: string | null;
  label: string;
  cardOwner: "principal" | "dependente" | null; // portador do cartão; null = cartão sem dependente
  installmentAmount: number;
  totalInstallments: number;
  nextInstallmentNumber: number;
  existing: { n: number; date: string; amount: number }[]; // parcelas que JÁ estão no banco (não serão inseridas)
  installments: { n: number; date: string; amount: number }[]; // as parcelas que faltam (serão inseridas)
};

// Chave da compra parcelada. Só M (não a parcela N nem o valor exato) → sobrevive a mais
// parcelas postando e ao drift de centavos, mantendo o dismissal estável entre scans.
// ponytail: teto — duas compras distintas no mesmo cartão/estabelecimento com o MESMO total
// de parcelas colapsam na mesma chave; subir pra incluir valor/data só se aparecer na base.
export function purchaseKey(t: SuggestionTx): string | null {
  const p = parcelInfo(t);
  return p ? `${t.accountId}|${baseLabel(t.description)}|${p.m}` : null;
}

// Soma meses preservando o dia (em UTC, como o monthKey do resto do app), com clamp pro
// último dia do mês quando estoura (ex.: 31/jan + 1 mês → 28/fev).
export function addMonthsUTC(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getUTCDate();
  r.setUTCDate(1);
  r.setUTCMonth(r.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(day, lastDay));
  return r;
}

export function buildSuggestions(
  txs: SuggestionTx[],
  dismissedKeys: Set<string> = new Set(),
): Suggestion[] {
  // Agrupa por identidade da compra (só as que são parcela — têm N/M).
  const groups = new Map<string, SuggestionTx[]>();
  for (const t of txs) {
    const key = purchaseKey(t);
    if (!key) continue;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(t);
  }

  const out: Suggestion[] = [];
  for (const [key, rows] of groups) {
    if (dismissedKeys.has(key)) continue;
    const m = parcelInfo(rows[0])!.m;
    // Dedup por número de parcela (churn da MeuPluggy reatribui id): 1 linha por N.
    const byN = new Map<number, SuggestionTx>();
    for (const r of rows) byN.set(parcelInfo(r)!.n, r);
    // Parcela mais avançada já vista (real ou manual).
    const maxN = Math.max(...byN.keys());
    const last = byN.get(maxN)!;
    const remaining = m - maxN;
    if (remaining <= 0) continue; // banco já projetou tudo (ou usuário já aceitou) → nada a sugerir

    const existing = [...byN.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([n, r]) => ({ n, date: r.date.toISOString(), amount: Number(r.amount) }));

    const amount = Number(last.amount);
    const installments = Array.from({ length: remaining }, (_, i) => {
      const n = maxN + 1 + i;
      return { n, date: addMonthsUTC(last.date, n - maxN).toISOString(), amount };
    });
    out.push({
      key,
      accountId: last.accountId,
      bank: last.institution ?? "",
      cardNumber: last.cardNumber ?? null,
      label: baseLabel(last.description),
      cardOwner: cardOwner(last.cardNumber ?? null, last.additionalCards ?? []),
      installmentAmount: amount,
      totalInstallments: m,
      nextInstallmentNumber: maxN + 1,
      existing,
      installments,
    });
  }

  return out.sort((a, b) => b.installmentAmount * b.installments.length - a.installmentAmount * a.installments.length);
}

const sameMonthUTC = (a: Date, b: Date) =>
  a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();

// Reconciliação: quando a parcela REAL finalmente posta (Bradesco cobra a 9/12), a linha
// manual equivalente vira lixo — devolve os ids das manuais a apagar. Casa primeiro pela
// identidade estruturada (total+número da parcela); cai pro base+valor+mês quando o banco
// não trouxe o N/M estruturado (ex.: Mercado Pago limpa o texto e não manda os campos).
export function manualRowsToDelete(
  manualRows: SuggestionTx[],
  realRows: SuggestionTx[],
): string[] {
  const ids: string[] = [];
  for (const mrow of manualRows) {
    const hit = realRows.some((r) => {
      if (r.accountId !== mrow.accountId) return false;
      const structural =
        r.totalInstallments != null &&
        r.installmentNumber != null &&
        r.totalInstallments === mrow.totalInstallments &&
        r.installmentNumber === mrow.installmentNumber;
      if (structural) return true;
      return (
        baseLabel(r.description) === baseLabel(mrow.description) &&
        Math.abs(Number(r.amount) - Number(mrow.amount)) <= CENT_TOL &&
        sameMonthUTC(r.date, mrow.date)
      );
    });
    if (hit && mrow.id) ids.push(mrow.id);
  }
  return ids;
}
