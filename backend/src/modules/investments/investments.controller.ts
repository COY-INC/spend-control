import { Router } from "express";
import { prisma } from "../transactions/transaction.repository";

// Investimentos importados (compartilhado do casal): posição achatada com banco e dono.
// O frontend soma o total e filtra por banco (mesmo padrão dos cards de cartão/reservas).
export const investmentsRouter = Router();

investmentsRouter.get("/investments", async (_req, res) => {
  const investments = await prisma.investment.findMany({
    include: { item: { select: { institution: true, user: { select: { name: true } } } } },
    orderBy: { balance: "desc" },
  });
  res.json(
    investments.map((i) => ({
      institution: i.item.institution,
      name: i.name,
      type: i.type,
      balance: Number(i.balance),
      userName: i.item.user.name,
    })),
  );
});
