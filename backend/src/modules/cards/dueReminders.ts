// Lembretes de vencimento de fatura de cartão.
//
// Para cada cartão, olha a fatura FECHADA mais recente e gera um lembrete se ela:
//  - tem valor > 0;
//  - NÃO está paga (heurística: nenhuma transação no cartão casa com o total da fatura
//    após o fechamento — mesma lógica de quitação usada na fatura em aberto);
//  - vence na janela [hoje - 60d, hoje + 7d] (a vencer ou vencida recente).

type Bill = { closingDate: Date | null; dueDate: Date; totalAmount: unknown };
type Tx = { amount: unknown; date: Date };
type CardInput = { bank: string; cardName: string | null; bills: Bill[]; transactions: Tx[] };

export type DueReminder = {
  bank: string;
  cardName: string | null;
  amount: number;
  dueDate: string; // ISO
  daysUntil: number; // negativo = já venceu
};

const PAID_TOL = 0.02;
const WINDOW_AHEAD = 7;
const WINDOW_BEHIND = 60;

const startOfDayUTC = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

export function dueReminders(cards: CardInput[], now: Date = new Date()): DueReminder[] {
  const out: DueReminder[] = [];
  for (const c of cards) {
    // bills vem ordenado por closingDate desc → a primeira com closingDate é a mais recente fechada.
    const bill = c.bills.find((b) => b.closingDate);
    if (!bill || !bill.closingDate) continue;
    const total = Number(bill.totalAmount);
    if (!(total > 0)) continue; // fatura zerada não gera lembrete

    const paid = c.transactions.some((t) => {
      const v = Number(t.amount);
      return v < 0 && Math.abs(Math.abs(v) - total) <= PAID_TOL && t.date > bill.closingDate!;
    });
    if (paid) continue;

    const daysUntil = Math.round((startOfDayUTC(bill.dueDate) - startOfDayUTC(now)) / 86_400_000);
    if (daysUntil > WINDOW_AHEAD || daysUntil < -WINDOW_BEHIND) continue;

    out.push({
      bank: c.bank,
      cardName: c.cardName,
      amount: total,
      dueDate: bill.dueDate.toISOString(),
      daysUntil,
    });
  }
  // mais urgente/vencida primeiro (daysUntil menor)
  return out.sort((a, b) => a.daysUntil - b.daysUntil);
}
