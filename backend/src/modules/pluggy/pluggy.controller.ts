import { Router } from "express";
import { fetchItemData, createConnectToken } from "./pluggy.service";
import { upsertTransactions, upsertAccounts, upsertBills, prisma } from "../transactions/transaction.repository";
import { requireAuth } from "../auth/requireAuth";

export const pluggyRouter = Router();

// Token temporário para o widget PluggyConnect no frontend.
// ?itemId=<nosso id> → modo update (re-autenticar/atualizar conexão existente — MeuPluggy proxy).
pluggyRouter.get("/connect-token", requireAuth, async (req, res) => {
  try {
    let pluggyItemId: string | undefined;
    const { itemId } = req.query;
    if (typeof itemId === "string" && itemId) {
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (!item) return res.status(404).json({ error: "Item não encontrado." });
      pluggyItemId = item.pluggyItemId;
    }
    const accessToken = await createConnectToken(pluggyItemId);
    res.json({ accessToken });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Salva um Item novo conectado pelo widget, vinculado ao usuário ativo.
// Body: { pluggyItemId, userId }
pluggyRouter.post("/items", requireAuth, async (req, res) => {
  const { pluggyItemId, userId } = req.body ?? {};
  if (!pluggyItemId || !userId) {
    return res.status(400).json({ error: "pluggyItemId e userId são obrigatórios" });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: `Usuário não encontrado: ${userId}` });

    // Busca dados do Item (inclui o nome real do banco derivado das contas).
    const { institution, accounts, transactions, bills } = await fetchItemData(pluggyItemId);
    const item = await prisma.item.upsert({
      where: { pluggyItemId },
      update: { institution, userId },
      create: { pluggyItemId, institution, userId },
    });

    await upsertAccounts(item.id, accounts);
    await upsertBills(bills);
    const result = await upsertTransactions(item.id, transactions);
    console.log(
      `[connect] item ${pluggyItemId}: ${accounts.length} contas, ${result.total} transações, ${bills.length} faturas`,
    );

    res.status(201).json({ ...item, imported: { accounts: accounts.length, ...result } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// Eventos da Pluggy que indicam que um Item tem transações novas/atualizadas.
const NEW_TX_EVENTS = new Set(["transactions/created", "transactions/updated", "item/updated"]);

// Webhook da Pluggy. Payload: { event, itemId, ... }
pluggyRouter.post("/webhook", async (req, res) => {
  const { event, itemId } = req.body ?? {};

  if (!itemId) return res.status(400).json({ error: "itemId ausente" });
  if (event && !NEW_TX_EVENTS.has(event)) {
    return res.json({ ignored: true, event });
  }

  // itemId do payload é o ID da Pluggy; achamos nosso Item por ele.
  const item = await prisma.item.findUnique({ where: { pluggyItemId: itemId } });
  if (!item) return res.status(404).json({ error: `Item não encontrado: ${itemId}` });

  const { institution, accounts, transactions, bills } = await fetchItemData(itemId);
  await prisma.item.update({ where: { id: item.id }, data: { institution } });
  await upsertAccounts(item.id, accounts);
  await upsertBills(bills);
  const result = await upsertTransactions(item.id, transactions);
  console.log(`[webhook] ${event} ${itemId}: ${accounts.length} contas, ${result.total} tx, ${bills.length} faturas`);

  res.json({ event, itemId, accounts: accounts.length, bills: bills.length, ...result });
});
