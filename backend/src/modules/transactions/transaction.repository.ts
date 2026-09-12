import { PrismaClient } from "@prisma/client";
import type {
  NormalizedTx,
  NormalizedAccount,
  NormalizedBill,
  NormalizedInvestment,
} from "../pluggy/pluggy.service";
import { manualRowsToDelete } from "../commitments/suggestions";

const prisma = new PrismaClient();

// Substitui a carteira de investimentos do Item (posições mudam/fecham) — apaga e recria.
export async function upsertInvestments(ourItemId: string, investments: NormalizedInvestment[]) {
  await prisma.investment.deleteMany({ where: { itemId: ourItemId } });
  if (investments.length > 0) {
    await prisma.investment.createMany({
      data: investments.map((i) => ({
        itemId: ourItemId,
        pluggyInvestmentId: i.pluggyInvestmentId,
        name: i.name,
        type: i.type,
        balance: i.balance,
      })),
      skipDuplicates: true,
    });
  }
  return { investments: investments.length };
}

// Upsert das faturas fechadas dos cartões (por pluggyBillId), resolvendo a conta.
export async function upsertBills(bills: NormalizedBill[]) {
  for (const b of bills) {
    const account = await prisma.account.findUnique({
      where: { pluggyAccountId: b.pluggyAccountId },
      select: { id: true },
    });
    if (!account) continue;
    await prisma.creditCardBill.upsert({
      where: { pluggyBillId: b.pluggyBillId },
      update: { closingDate: b.closingDate, dueDate: b.dueDate, totalAmount: b.totalAmount, accountId: account.id },
      create: {
        pluggyBillId: b.pluggyBillId,
        accountId: account.id,
        closingDate: b.closingDate,
        dueDate: b.dueDate,
        totalAmount: b.totalAmount,
      },
    });
  }
  return { bills: bills.length };
}

// Upsert das contas de um Item com saldo/tipo reais (por pluggyAccountId).
export async function upsertAccounts(ourItemId: string, accounts: NormalizedAccount[]) {
  for (const a of accounts) {
    await prisma.account.upsert({
      where: { pluggyAccountId: a.pluggyAccountId },
      update: { type: a.type, name: a.name, brand: a.brand, balance: a.balance, reservedBalances: a.reservedBalances, additionalCards: a.additionalCards, itemId: ourItemId },
      create: {
        pluggyAccountId: a.pluggyAccountId,
        itemId: ourItemId,
        type: a.type,
        name: a.name,
        brand: a.brand,
        balance: a.balance,
        reservedBalances: a.reservedBalances,
        additionalCards: a.additionalCards,
      },
    });
  }
  return { accounts: accounts.length };
}

// Casa cada transação primeiro pelo id da Pluggy; se não achar, casa por CONTEÚDO no
// mesmo dia (mesma conta, descrição e valor). A MeuPluggy reatribui pluggyTransactionId
// em transações recentes/pendentes entre syncs — sem o fallback por conteúdo a mesma
// transação reentra como duplicata (ex.: "Pagamento recebido" aparecendo 2×).
export async function upsertTransactions(ourItemId: string, txs: NormalizedTx[]) {
  let created = 0;
  let updated = 0;

  for (const t of txs) {
    // Garante que a conta existe localmente (cria mínima se o webhook trouxe conta nova).
    const account = await prisma.account.upsert({
      where: { pluggyAccountId: t.pluggyAccountId },
      update: {},
      create: {
        pluggyAccountId: t.pluggyAccountId,
        itemId: ourItemId,
        type: "UNKNOWN",
        balance: 0,
      },
    });

    // 1) id da Pluggy (caminho normal).
    let existingId =
      (
        await prisma.transaction.findUnique({
          where: { pluggyTransactionId: t.pluggyTransactionId },
          select: { id: true },
        })
      )?.id ?? null;

    // 2) id reatribuído: casa por conteúdo no MESMO INSTANTE (data+hora exata, não só o dia).
    // O timestamp é o único campo que distingue duas transações REAIS idênticas (ex.: 2 PIX de
    // R$50 pra mesma pessoa no mesmo dia) do churn de pluggyTransactionId da MeuPluggy (mesma tx,
    // id novo, mesmo timestamp). Casar só pelo dia colapsava as duas reais numa (UPDATE em vez de
    // CREATE) e sumia com uma — ver PIX Maria Fernanda 07/09.
    // ponytail: ceiling — bancos que reportam data sem hora (00:00) ainda colapsam idênticas do
    // mesmo dia; a chave real é o pluggyTransactionId, este fallback é heurístico por natureza.
    if (!existingId) {
      const candidates = await prisma.transaction.findMany({
        where: { accountId: account.id, description: t.description, date: t.date },
        select: { id: true, amount: true },
      });
      existingId = candidates.find((c) => Math.abs(Number(c.amount) - t.amount) < 0.005)?.id ?? null;
    }

    const data = {
      pluggyTransactionId: t.pluggyTransactionId,
      amount: t.amount,
      date: t.date,
      description: t.description,
      category: t.category,
      cardNumber: t.cardNumber,
      installmentNumber: t.installmentNumber,
      totalInstallments: t.totalInstallments,
      billId: t.billId,
      status: t.status,
      accountId: account.id,
    };

    if (existingId) {
      await prisma.transaction.update({ where: { id: existingId }, data });
      updated++;
    } else {
      await prisma.transaction.create({ data });
      created++;
    }
  }

  await reconcileManual(txs);
  return { created, updated, total: txs.length };
}

// Quando a parcela REAL finalmente entra (ex.: Bradesco cobra a 9/12), a linha `manual`
// projetada pra ela vira duplicata → apaga. Roda só nas contas que este sync tocou, casando
// as manuais futuras contra as reais recém-postadas (ver manualRowsToDelete).
async function reconcileManual(txs: NormalizedTx[]) {
  const pluggyAccountIds = [...new Set(txs.map((t) => t.pluggyAccountId))];
  if (pluggyAccountIds.length === 0) return;
  const accounts = await prisma.account.findMany({
    where: { pluggyAccountId: { in: pluggyAccountIds } },
    select: { id: true },
  });
  const accountIds = accounts.map((a) => a.id);
  if (accountIds.length === 0) return;

  const manualRows = await prisma.transaction.findMany({
    where: { accountId: { in: accountIds }, manual: true },
    select: { id: true, accountId: true, amount: true, date: true, description: true, installmentNumber: true, totalInstallments: true },
  });
  if (manualRows.length === 0) return;

  // Reais recém-postadas (últimos 60 dias): a parcela que acabou de entrar cai aqui.
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const realRows = await prisma.transaction.findMany({
    where: { accountId: { in: accountIds }, manual: false, date: { gte: since } },
    select: { id: true, accountId: true, amount: true, date: true, description: true, installmentNumber: true, totalInstallments: true },
  });

  const toDelete = manualRowsToDelete(manualRows, realRows);
  if (toDelete.length) await prisma.transaction.deleteMany({ where: { id: { in: toDelete } } });
}

export { prisma };
