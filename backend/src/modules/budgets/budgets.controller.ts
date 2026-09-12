import { Router } from "express";
import { prisma } from "../transactions/transaction.repository";

// Orçamento mensal por categoria (compartilhado do casal). O gasto vs limite é calculado
// no frontend a partir das transações do mês; aqui só guardamos os limites.
export const budgetsRouter = Router();

// Mapa { categoria: limite }.
budgetsRouter.get("/budgets", async (_req, res) => {
  const budgets = await prisma.budget.findMany({ select: { category: true, limit: true } });
  const map: Record<string, number> = {};
  for (const b of budgets) map[b.category] = Number(b.limit);
  res.json(map);
});

// Substitui o conjunto: upserta os limites > 0 e remove os ausentes/zerados.
budgetsRouter.put("/budgets", async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const entries = Object.entries(body)
    .map(([category, limit]) => [category, Number(limit)] as const)
    .filter(([, limit]) => Number.isFinite(limit) && limit > 0);
  const keep = entries.map(([c]) => c);

  await prisma.$transaction([
    keep.length
      ? prisma.budget.deleteMany({ where: { category: { notIn: keep } } })
      : prisma.budget.deleteMany({}),
    ...entries.map(([category, limit]) =>
      prisma.budget.upsert({
        where: { category },
        update: { limit },
        create: { category, limit },
      }),
    ),
  ]);

  const map: Record<string, number> = {};
  for (const [c, l] of entries) map[c] = l;
  res.json(map);
});
