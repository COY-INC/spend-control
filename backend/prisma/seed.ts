import { PrismaClient } from "@prisma/client";
import { hashPin } from "../src/modules/auth/pin";

const prisma = new PrismaClient();

const CATEGORIES = ["Mercado", "Restaurante", "Transporte", "Salário", "Lazer", "Contas", "Saúde"];

function randomTransactions(accountId: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
    const isIncome = category === "Salário";
    const amount = isIncome ? 3000 + Math.random() * 4000 : -(10 + Math.random() * 400);
    const date = new Date();
    date.setDate(date.getDate() - i);
    return {
      accountId,
      amount: Number(amount.toFixed(2)),
      date,
      description: `${category} #${i + 1}`,
      category,
    };
  });
}

async function seedUser(
  name: string,
  institution: string,
  itemId: string,
  status = "UPDATED",
  pin = "0000",
) {
  const user = await prisma.user.create({ data: { name, pin: hashPin(pin) } });
  const item = await prisma.item.create({
    data: { userId: user.id, pluggyItemId: itemId, institution, status },
  });

  const checking = await prisma.account.create({
    data: { itemId: item.id, type: "CHECKING", balance: 2000 + Math.random() * 5000 },
  });
  const savings = await prisma.account.create({
    data: { itemId: item.id, type: "SAVINGS", balance: 5000 + Math.random() * 20000 },
  });

  await prisma.transaction.createMany({ data: randomTransactions(checking.id, 15) });
  await prisma.transaction.createMany({ data: randomTransactions(savings.id, 5) });
}

async function main() {
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.item.deleteMany();
  await prisma.user.deleteMany();

  await seedUser("Marido", "Nubank", "pluggy-item-marido", "UPDATED", "1234");
  await seedUser("Esposa", "Itaú", "pluggy-item-esposa", "WAITING_USER_INPUT", "5678");

  console.log("Seed concluído: 2 usuários, 4 contas, transações.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
