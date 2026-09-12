import { Router } from "express";
import { prisma } from "../transactions/transaction.repository";

// Lista de categorias personalizável pelo usuário (compartilhada do casal), usada nos
// dropdowns de "Minha categoria" e no editor de orçamentos.
export const categoriesRouter = Router();

categoriesRouter.get("/categories", async (_req, res) => {
  const categories = await prisma.category.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  res.json(categories.map((c) => c.name));
});

// Substitui o conjunto inteiro (mesmo padrão de /budgets): upserta os nomes enviados e
// remove os ausentes. Não toca em Transaction.userCategories/Budget.category — remover
// uma categoria daqui só a tira do dropdown, não apaga dado já gravado.
categoriesRouter.put("/categories", async (req, res) => {
  const body = req.body;
  const names = [
    ...new Set(
      (Array.isArray(body) ? body : [])
        .map((n) => String(n).trim())
        .filter(Boolean),
    ),
  ];

  await prisma.$transaction([
    names.length
      ? prisma.category.deleteMany({ where: { name: { notIn: names } } })
      : prisma.category.deleteMany({}),
    ...names.map((name) => prisma.category.upsert({ where: { name }, update: {}, create: { name } })),
  ]);

  res.json(names.sort((a, b) => a.localeCompare(b, "pt-BR")));
});
