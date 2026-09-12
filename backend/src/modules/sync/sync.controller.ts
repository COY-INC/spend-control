import { Router } from "express";
import { prisma } from "../transactions/transaction.repository";
import { syncItem } from "./sync.service";

// Status das conexões bancárias (Items) e sincronização manual de um Item.
export const itemsRouter = Router();

// Saúde das conexões bancárias: cada Item (banco conectado) e seu status de sync.
itemsRouter.get("/items/status", async (_req, res) => {
  const items = await prisma.item.findMany({
    orderBy: { institution: "asc" },
    select: {
      id: true,
      pluggyItemId: true,
      institution: true,
      status: true,
      updatedAt: true,
      lastChangeAt: true,
      lastChangeCount: true,
      user: { select: { name: true } },
      _count: { select: { accounts: true } },
    },
  });
  res.json(
    items.map((i) => ({
      id: i.id,
      pluggyItemId: i.pluggyItemId,
      institution: i.institution,
      status: i.status,
      updatedAt: i.updatedAt,
      lastChangeAt: i.lastChangeAt,
      lastChangeCount: i.lastChangeCount,
      owner: i.user.name,
      accounts: i._count.accounts,
    })),
  );
});

// Força a sincronização de um Item específico (trigger na Pluggy + re-upsert das transações).
itemsRouter.post("/items/:id/sync", async (req, res) => {
  const item = await prisma.item.findUnique({ where: { id: req.params.id } });
  if (!item) return res.status(404).json({ error: "Item não encontrado." });
  try {
    const result = await syncItem(item);
    res.json({ id: item.id, ...result });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});
