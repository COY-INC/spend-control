import { Router } from "express";
import { prisma } from "./transaction.repository";
import { annotationKey, findNote, keyMatches, sameGroup } from "./notes";
import { anticipationKey, applyAnticipations } from "./anticipation";

// Leitura e edição de transações.
export const transactionsRouter = Router();

// Transações — filtros opcionais: ?userId= e ?month=1-12&year=YYYY
transactionsRouter.get("/transactions", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const month = Number(req.query.month); // 1-12
  const year = Number(req.query.year);
  const period = month >= 1 && month <= 12 && year > 0;

  // Sem filtro de data no banco: a antecipação sobrescreve a data efetiva, e o recorte por mês
  // é feito depois, pela data já sobrescrita. (ponytail: carrega tudo do usuário por request —
  // ok para o volume pessoal; paginar/estreitar só se crescer muito.)
  const transactions = await prisma.transaction.findMany({
    where: { ...(userId ? { account: { item: { userId } } } : {}) },
    include: { account: { include: { item: { select: { institution: true, userId: true } } } } },
  });

  const notes = await prisma.transactionNote.findMany({ select: { key: true, note: true } });
  const flags = new Map(
    (await prisma.anticipatedInstallment.findMany({ select: { key: true, at: true } })).map(
      (f) => [f.key, f.at] as const,
    ),
  );

  // Sobrescreve a data das parcelas antecipadas; recorta por mês (UTC) pela data efetiva; ordena.
  const withDates = applyAnticipations(transactions, flags);
  const start = period ? new Date(Date.UTC(year, month - 1, 1)) : null;
  const end = period ? new Date(Date.UTC(year, month, 1)) : null;
  const rows = (start && end ? withDates.filter((t) => t.date >= start && t.date < end) : withDates)
    .sort((a, b) => +b.date - +a.date);

  // Nota casa por tolerância (±10¢); `anticipated` = a parcela está marcada (independe da data).
  res.json(
    rows.map((t) => ({
      ...t,
      note: findNote(notes, t),
      anticipated: flags.has(anticipationKey(t) ?? ""),
    })),
  );
});

// Edita uma transação — userCategories (categorias do usuário) e/ou description.
// userCategories vazio ([]) volta a herdar a categoria da Pluggy.
transactionsRouter.patch("/transactions/:id", async (req, res) => {
  const { userCategories, description } = req.body ?? {};
  const data: { userCategories?: string[]; description?: string } = {};
  if (Array.isArray(userCategories)) {
    // trim, descarta vazios e dedupe preservando a ordem (1ª = principal). [] = herda Pluggy.
    data.userCategories = [...new Set(userCategories.map((c) => String(c).trim()).filter(Boolean))];
  }
  if (typeof description === "string" && description.trim()) data.description = description;
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "Envie userCategories e/ou description." });
  }
  try {
    const tx = await prisma.transaction.update({ where: { id: req.params.id }, data });
    // Categoria(s) do usuário valem pra compra toda: propaga pras parcelas do grupo (mesma
    // tolerância do modal). As parcelas futuras já existem como linhas, então updateMany
    // alcança o parcelamento inteiro.
    // ponytail: só linhas já sincronizadas; parcela futura herda a Pluggy até ser
    // recategorizada. Subir pra tabela de identidade se incomodar.
    if (data.userCategories !== undefined) {
      const cands = await prisma.transaction.findMany({
        where: { accountId: tx.accountId },
        select: { id: true, accountId: true, description: true, amount: true },
      });
      const ids = cands.filter((c) => sameGroup(c, tx)).map((c) => c.id);
      if (ids.length) {
        await prisma.transaction.updateMany({ where: { id: { in: ids } }, data: { userCategories: data.userCategories } });
      }
    }
    res.json(tx);
  } catch {
    res.status(404).json({ error: "Transação não encontrada." });
  }
});

// Comentário do usuário — ancorado na identidade da compra (vale pro grupo todo:
// parcelas/assinaturas/recorrências). note vazio ("") apaga o comentário do grupo.
transactionsRouter.put("/transactions/:id/note", async (req, res) => {
  const note = typeof req.body?.note === "string" ? req.body.note.trim() : "";
  const tx = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    select: { accountId: true, description: true, amount: true },
  });
  if (!tx) return res.status(404).json({ error: "Transação não encontrada." });
  // Colapsa o grupo por tolerância: uma nota só por compra, mesmo com drift de centavos entre
  // as parcelas. Reusa uma key já existente do grupo como âncora (estável) ou a da parcela.
  const existing = await prisma.transactionNote.findMany({ select: { key: true } });
  const groupKeys = existing.map((n) => n.key).filter((k) => keyMatches(k, tx));
  const anchor = groupKeys[0] ?? annotationKey(tx);
  if (!note) {
    await prisma.transactionNote.deleteMany({ where: { key: { in: groupKeys.length ? groupKeys : [anchor] } } });
    return res.json({ key: anchor, note: "" });
  }
  const dupes = groupKeys.filter((k) => k !== anchor);
  if (dupes.length) await prisma.transactionNote.deleteMany({ where: { key: { in: dupes } } });
  const saved = await prisma.transactionNote.upsert({
    where: { key: anchor },
    update: { note },
    create: { key: anchor, note },
  });
  res.json({ key: anchor, note: saved.note });
});

// Candidatas a "não sinalizadas": transações vistas depois da última marca de dispensa
// e ainda sem comentário. O frontend decide o que é "despesa relevante" (expenseValue/
// isInternalMovement) e agrupa por banco — classificação mora lá (fonte única).
transactionsRouter.get("/transactions/pending", async (req, res) => {
  const state = await prisma.appState.findUnique({ where: { id: "singleton" } });
  const since = state?.pendingDismissedAt ?? new Date(0);
  // Filtro opcional por mês (?month=1-12&year=YYYY) — badge da tela inicial por mês.
  const month = Number(req.query.month);
  const year = Number(req.query.year);
  const date =
    month >= 1 && month <= 12 && year
      ? { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) }
      : undefined;
  const transactions = await prisma.transaction.findMany({
    where: { createdAt: { gt: since }, ...(date ? { date } : {}) },
    orderBy: { date: "desc" },
    include: { account: { include: { item: { select: { institution: true, userId: true } } } } },
  });
  const notes = await prisma.transactionNote.findMany({ select: { key: true, note: true } });
  res.json(
    transactions
      .filter((t) => findNote(notes, t) === null) // "comentada" por tolerância, não valor exato
      .map((t) => ({ ...t, note: null })),
  );
});

// "Dispensar tudo agora": marca d'água = agora. Zera a contagem atual; transações vistas
// depois (createdAt > marca) voltam a aparecer.
transactionsRouter.post("/transactions/pending/dismiss", async (_req, res) => {
  const now = new Date();
  const state = await prisma.appState.upsert({
    where: { id: "singleton" },
    update: { pendingDismissedAt: now },
    create: { id: "singleton", pendingDismissedAt: now },
  });
  res.json({ pendingDismissedAt: state.pendingDismissedAt });
});

// Marca/desmarca uma parcela como antecipada (paga adiantado, para o ciclo aberto).
// anticipated=false remove a marca. Ancora na IDENTIDADE da parcela (sobrevive ao churn).
transactionsRouter.post("/transactions/:id/anticipate", async (req, res) => {
  const anticipated = req.body?.anticipated === true;
  const tx = await prisma.transaction.findUnique({
    where: { id: req.params.id },
    select: { accountId: true, description: true, amount: true, installmentNumber: true, totalInstallments: true },
  });
  if (!tx) return res.status(404).json({ error: "Transação não encontrada." });
  const key = anticipationKey(tx);
  if (!key) return res.status(400).json({ error: "Transação não é uma parcela (sem N/M)." });
  if (!anticipated) {
    await prisma.anticipatedInstallment.deleteMany({ where: { key } });
    return res.json({ key, anticipated: false });
  }
  await prisma.anticipatedInstallment.upsert({ where: { key }, update: {}, create: { key } });
  res.json({ key, anticipated: true });
});
