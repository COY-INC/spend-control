import {
  prisma,
  upsertAccounts,
  upsertBills,
  upsertTransactions,
  upsertInvestments,
} from "../transactions/transaction.repository";
import { triggerItemUpdate, fetchItemData } from "../pluggy/pluggy.service";

// Sincroniza um Item: puxa contas/transações/faturas/investimentos atuais do Pluggy/
// MeuPluggy e faz upsert. Usado pelo endpoint manual (/items/:id/sync) e pelo agendador.
export async function syncItem(item: { id: string; pluggyItemId: string }) {
  const status = await triggerItemUpdate(item.pluggyItemId);
  const { institution, accounts, transactions, bills, investments } = await fetchItemData(
    item.pluggyItemId,
  );
  await upsertAccounts(item.id, accounts);
  await upsertBills(bills);
  await upsertInvestments(item.id, investments);
  const result = await upsertTransactions(item.id, transactions);
  // Só marca "modificação" quando o sync trouxe transação nova/alterada — não em todo sync
  // (o updatedAt já cobre "sincronizado"; lastChangeAt cobre "mudou de verdade").
  const changed = result.created + result.updated;
  const updated = await prisma.item.update({
    where: { id: item.id },
    data: {
      status,
      institution,
      ...(changed > 0 ? { lastChangeAt: new Date(), lastChangeCount: changed } : {}),
    },
  });
  return {
    status: updated.status,
    accounts: accounts.length,
    bills: bills.length,
    investments: investments.length,
    ...result,
  };
}

// Sincroniza todos os Items. Serial e tolerante a falha por item (um banco fora do ar
// não derruba os demais). Usado pelo agendador.
export async function syncAllItems() {
  const items = await prisma.item.findMany({
    select: { id: true, pluggyItemId: true, institution: true },
  });
  for (const item of items) {
    try {
      const r = await syncItem(item);
      console.log(`[sync] ${item.institution}: +${r.created} novas, ${r.updated} atualizadas, ${r.bills} faturas`);
    } catch (e) {
      console.error(`[sync] falhou para ${item.institution}: ${(e as Error).message}`);
    }
  }
}

// Agendador in-process: roda ~30s após o boot e a cada SYNC_INTERVAL_HOURS (default 6h),
// mantendo bills/transações frescas sem reconexão manual. Sem sobreposição de execuções.
// Desligue com SYNC_INTERVAL_HOURS=0. Não roda em modo mock.
export function startSyncScheduler() {
  if (process.env.PLUGGY_MOCK === "1") return;
  const hours = Number(process.env.SYNC_INTERVAL_HOURS ?? 6);
  if (!(hours > 0)) return;

  let running = false;
  const run = async () => {
    if (running) return; // não sobrepõe se um ciclo demorar mais que o intervalo
    running = true;
    try {
      await syncAllItems();
    } catch (e) {
      console.error(`[sync] ciclo falhou: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };

  setTimeout(run, 30_000).unref();
  setInterval(run, hours * 3_600_000).unref();
  console.log(`[sync] agendador ativo: a cada ${hours}h`);
}
