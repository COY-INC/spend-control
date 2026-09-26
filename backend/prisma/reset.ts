import type { PrismaClient } from "@prisma/client";

/**
 * Apaga todas as tabelas populadas pelos seeds, na ordem das dependências (FKs).
 * Compartilhado por seed.ts e seed-mock.ts para evitar que um novo model quebre só um dos dois.
 */
export async function resetDatabase(prisma: PrismaClient) {
  await prisma.transactionNote.deleteMany();
  await prisma.anticipatedInstallment.deleteMany();
  await prisma.dismissedSuggestion.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.creditCardBill.deleteMany();
  await prisma.account.deleteMany();
  await prisma.investment.deleteMany();
  await prisma.item.deleteMany();
  await prisma.user.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.category.deleteMany();
  await prisma.appState.deleteMany();
}
