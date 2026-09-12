import { Router } from "express";
import { prisma } from "../transactions/transaction.repository";
import { anticipationKey, applyAnticipations } from "../transactions/anticipation";
import { findNote } from "../transactions/notes";
import { computeInvoices, cardOwner, type LineItem } from "./openInvoice";

// Cartões de crédito: fatura atual (aberta, calculada por ciclo) + faturas fechadas.
export const cardsRouter = Router();

cardsRouter.get("/cards", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const accounts = await prisma.account.findMany({
    where: { type: "CREDIT", ...(userId ? { item: { userId } } : {}) },
    include: {
      item: { select: { institution: true } },
      bills: { orderBy: { closingDate: "desc" } },
      transactions: {
        select: {
          id: true,
          amount: true,
          date: true,
          description: true,
          category: true,
          cardNumber: true,
          installmentNumber: true,
          totalInstallments: true,
          billId: true,
          status: true,
        },
      },
    },
  });

  const flags = new Map(
    (await prisma.anticipatedInstallment.findMany({ select: { key: true, at: true } })).map(
      (f) => [f.key, f.at] as const,
    ),
  );
  const notes = await prisma.transactionNote.findMany({ select: { key: true, note: true } });

  // Quantos cartões por banco — o nome do cartão só aparece quando há mais de um.
  const perBank = new Map<string, number>();
  for (const a of accounts) perBank.set(a.item.institution, (perBank.get(a.item.institution) ?? 0) + 1);

  const cards = accounts.map((a) => {
    // Faturas por ciclo: aberta (corrente), fechada-a-vencer e histórico das vencidas.
    // O ciclo rola pelo dia de fechamento — a MeuPluggy atrasa o Bill. Ver openInvoice.ts.
    const txs = applyAnticipations(
      a.transactions.map((t) => ({ ...t, accountId: a.id })),
      flags,
    );
    const { open, closed, future, history } = computeInvoices(txs, a.bills, Number(a.balance));

    // Anexa comentário (por identidade da compra), flag de antecipada e portador do cartão
    // (principal/dependente) a cada item — mesma semântica de GET /transactions, por fatura.
    const enrich = (it: LineItem) => {
      const ident = {
        accountId: a.id,
        description: it.description,
        amount: it.amount,
        installmentNumber: it.installmentNumber,
        totalInstallments: it.totalInstallments,
      };
      return { ...it, note: findNote(notes, ident), anticipated: flags.has(anticipationKey(ident) ?? ""), cardOwner: cardOwner(it.cardNumber, a.additionalCards) };
    };
    const enrichAll = <T extends { items: LineItem[] }>(o: T) => ({ ...o, items: o.items.map(enrich) });

    return {
      accountId: a.id,
      bank: a.item.institution,
      brand: a.brand,
      cardName: (perBank.get(a.item.institution) ?? 0) > 1 ? a.name : null,
      openInvoice: enrichAll(open),
      closedInvoice: closed && enrichAll(closed),
      future: future.map(enrichAll),
      history: history.slice(0, 6).map(enrichAll),
    };
  });
  res.json(cards);
});
