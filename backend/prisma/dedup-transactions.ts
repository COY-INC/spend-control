// Limpeza única das transações duplicadas já existentes no banco.
//
// Contexto: a MeuPluggy reatribui pluggyTransactionId em transações recentes/pendentes
// entre syncs, então antes do fix de ingestão a mesma transação entrava 2× (ids diferentes).
// A partir do fix novo isso não acontece mais; este script remove as duplicatas legadas.
//
// Duplicata = mesma conta, mesmo dia (UTC), mesmo valor (2 casas) e mesma descrição.
// Mantém 1 linha por grupo (preferindo a que tem userCategory definida, pra não perder a
// categorização do usuário) e remove as demais.
//
// Uso (dry-run por padrão):   railway run -- npm run dedup
//      aplicar de fato:        railway run -- npm run dedup -- --apply
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const all = await prisma.transaction.findMany({
    select: { id: true, accountId: true, date: true, amount: true, description: true, userCategory: true },
  });

  const groups = new Map<string, typeof all>();
  for (const t of all) {
    const day = t.date.toISOString().slice(0, 10);
    const key = `${t.accountId}|${day}|${Number(t.amount).toFixed(2)}|${t.description}`;
    const g = groups.get(key);
    if (g) g.push(t);
    else groups.set(key, [t]);
  }

  const toDelete: string[] = [];
  let dupGroups = 0;
  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    dupGroups++;
    const keeper = rows.find((r) => r.userCategory) ?? rows[0];
    for (const r of rows) if (r.id !== keeper.id) toDelete.push(r.id);
    console.log(
      `  x${rows.length}  ${Number(rows[0].amount).toFixed(2).padStart(10)}  ${rows[0].date.toISOString().slice(0, 10)}  ${rows[0].description}`,
    );
  }

  console.log(`\ngrupos duplicados: ${dupGroups} | linhas a remover: ${toDelete.length} | total de transações: ${all.length}`);
  if (toDelete.length === 0) {
    console.log("Nada a remover.");
  } else if (APPLY) {
    const { count } = await prisma.transaction.deleteMany({ where: { id: { in: toDelete } } });
    console.log(`Removidas: ${count} transações duplicadas.`);
  } else {
    console.log("DRY-RUN — nada foi alterado. Rode de novo com --apply para remover.");
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
