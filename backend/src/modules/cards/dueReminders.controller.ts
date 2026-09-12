import { Router } from "express";
import { prisma } from "../transactions/transaction.repository";
import { dueReminders } from "./dueReminders";

// Lembretes de vencimento de fatura de cartão (a vencer / vencidas não pagas).
export const dueRemindersRouter = Router();

dueRemindersRouter.get("/due-reminders", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const accounts = await prisma.account.findMany({
    where: { type: "CREDIT", ...(userId ? { item: { userId } } : {}) },
    include: {
      item: { select: { institution: true } },
      bills: { orderBy: { closingDate: "desc" } },
      transactions: { select: { amount: true, date: true } },
    },
  });

  // Nome do cartão só aparece quando há mais de um no mesmo banco (igual ao /cards).
  const perBank = new Map<string, number>();
  for (const a of accounts) perBank.set(a.item.institution, (perBank.get(a.item.institution) ?? 0) + 1);

  const reminders = dueReminders(
    accounts.map((a) => ({
      bank: a.item.institution,
      cardName: (perBank.get(a.item.institution) ?? 0) > 1 ? a.name : null,
      bills: a.bills,
      transactions: a.transactions,
    })),
  );
  res.json(reminders);
});
