import { Router } from "express";
import { prisma } from "../transactions/transaction.repository";
import { detectSubscriptions } from "./subscriptions";

// Assinaturas / recorrências detectadas nos últimos 6 meses (compartilhado do casal).
export const subscriptionsRouter = Router();

subscriptionsRouter.get("/subscriptions", async (_req, res) => {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const txs = await prisma.transaction.findMany({
    where: { date: { gte: from } },
    select: {
      amount: true,
      date: true,
      description: true,
      category: true,
      installmentNumber: true,
      totalInstallments: true,
      account: { select: { type: true, id: true, item: { select: { institution: true } } } },
    },
  });
  const subs = detectSubscriptions(
    txs.map((t) => ({
      amount: t.amount,
      date: t.date,
      description: t.description,
      category: t.category,
      accountType: t.account.type,
      institution: t.account.item.institution,
      accountId: t.account.id,
      installmentNumber: t.installmentNumber,
      totalInstallments: t.totalInstallments,
    })),
    now,
  );
  // Anexa o comentário do grupo (resolvido pela identidade da cobrança mais recente).
  const notes = await prisma.transactionNote.findMany({
    where: { key: { in: subs.map((s) => s.key) } },
    select: { key: true, note: true },
  });
  const noteMap = new Map(notes.map((n) => [n.key, n.note]));
  res.json(subs.map(({ key, ...s }) => ({ ...s, note: noteMap.get(key) ?? null })));
});
