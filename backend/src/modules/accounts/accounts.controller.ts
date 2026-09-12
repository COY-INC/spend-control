import { Router } from "express";
import { prisma } from "../transactions/transaction.repository";

// Leituras de usuários, contas, saldo consolidado e saldo reservado.
export const accountsRouter = Router();

// Lista os usuários (casal)
accountsRouter.get("/users", async (_req, res) => {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  res.json(users);
});

// Contas de um usuário (via seus Items)
accountsRouter.get("/users/:userId/accounts", async (req, res) => {
  const accounts = await prisma.account.findMany({
    where: { item: { userId: req.params.userId } },
    include: { item: { select: { institution: true } } },
  });
  res.json(accounts);
});

// Patrimônio consolidado do casal (contas − dívidas + investimentos), breakdown por usuário
accountsRouter.get("/balance/consolidated", async (_req, res) => {
  const users = await prisma.user.findMany({
    include: { items: { include: { accounts: true, investments: true } } },
  });

  // CREDIT/LOAN são passivos: entram no patrimônio como negativo (dívida).
  const signed = (a: { type: string; balance: unknown }) =>
    (a.type === "CREDIT" || a.type === "LOAN" ? -1 : 1) * Number(a.balance);

  let total = 0;
  const byUser = users.map((u) => {
    const accts = u.items.flatMap((i) => i.accounts).reduce((sum, a) => sum + signed(a), 0);
    const invest = u.items.flatMap((i) => i.investments).reduce((sum, i) => sum + Number(i.balance), 0);
    const balance = accts + invest;
    total += balance;
    return { userId: u.id, name: u.name, balance };
  });

  res.json({ total, byUser });
});

// Todas as contas (opcionalmente por usuário) com banco e dono — usado nos
// cards de saldo que respeitam os filtros (inclui o consolidado do casal).
accountsRouter.get("/accounts", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const accounts = await prisma.account.findMany({
    where: userId ? { item: { userId } } : {},
    include: { item: { select: { institution: true, userId: true, user: { select: { name: true } } } } },
  });
  res.json(
    accounts.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      balance: a.balance,
      institution: a.item.institution,
      userId: a.item.userId,
      userName: a.item.user.name,
    })),
  );
});

// Saldo reservado (caixinhas/cofrinhos) por conta, achatado em uma lista de reservas.
// O frontend soma o total e filtra por banco (mesmo padrão dos cards de cartão).
accountsRouter.get("/reserved", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const accounts = await prisma.account.findMany({
    where: userId ? { item: { userId } } : {},
    include: { item: { select: { institution: true } } },
  });
  const items = accounts.flatMap((a) =>
    ((a.reservedBalances as { name: string; amount: number }[] | null) ?? []).map((r) => ({
      bank: a.item.institution,
      name: r.name,
      amount: r.amount,
    })),
  );
  res.json(items);
});
