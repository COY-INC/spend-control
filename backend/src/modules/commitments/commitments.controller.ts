import { Router } from "express";
import { prisma } from "../transactions/transaction.repository";
import { applyAnticipations } from "../transactions/anticipation";
import { buildCommitments } from "./commitments";
import { buildSuggestions } from "./suggestions";

// Compromissos futuros: parcelas de cartão datadas no futuro, agrupadas por compra.
// O frontend soma o total e filtra por banco (mesmo padrão dos cards de cartão/reservas).
export const commitmentsRouter = Router();

commitmentsRouter.get("/commitments", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const future = await prisma.transaction.findMany({
    where: {
      date: { gt: new Date() },
      account: { type: "CREDIT", ...(userId ? { item: { userId } } : {}) },
    },
    select: {
      amount: true,
      date: true,
      description: true,
      accountId: true,
      installmentNumber: true,
      totalInstallments: true,
      manual: true,
      account: { select: { item: { select: { institution: true } } } },
    },
  });
  const flags = new Map(
    (await prisma.anticipatedInstallment.findMany({ select: { key: true, at: true } })).map(
      (f) => [f.key, f.at] as const,
    ),
  );
  const mapped = future.map((t) => ({
    amount: t.amount,
    date: t.date,
    description: t.description,
    accountId: t.accountId,
    installmentNumber: t.installmentNumber,
    totalInstallments: t.totalInstallments,
    institution: t.account.item.institution,
  }));
  // applyAnticipations move a parcela antecipada para `at` (≤ agora); como buildCommitments
  // filtra `date > now`, ela sai de compromissos sozinha (não some por engano — some porque
  // deixou de ser futura).
  const plans = buildCommitments(applyAnticipations(mapped, flags));
  res.json(plans);
});

// Sugestões de parcelas futuras (bancos que não projetam, ex.: Bradesco/MP): derivadas do
// metadata N/M das parcelas reais. Não entram em Compromissos sozinhas — viram sugestão aqui.
commitmentsRouter.get("/commitments/suggestions", async (req, res) => {
  const userId = req.query.userId as string | undefined;
  const rows = await prisma.transaction.findMany({
    where: { account: { type: "CREDIT", ...(userId ? { item: { userId } } : {}) } },
    select: {
      id: true,
      accountId: true,
      amount: true,
      date: true,
      description: true,
      installmentNumber: true,
      totalInstallments: true,
      manual: true,
      cardNumber: true,
      account: { select: { additionalCards: true, item: { select: { institution: true } } } },
    },
  });
  const dismissed = new Set((await prisma.dismissedSuggestion.findMany({ select: { key: true } })).map((d) => d.key));
  const suggestions = buildSuggestions(
    rows.map((t) => ({ ...t, institution: t.account.item.institution, additionalCards: t.account.additionalCards })),
    dismissed,
  );
  res.json(suggestions);
});

// Aceite/inserção manual: cria uma linha `manual` por parcela (datada no futuro). Vira linha
// real de Transaction → aparece em Compromissos/lista como as dos outros bancos.
commitmentsRouter.post("/commitments/manual", async (req, res) => {
  const { accountId, label, totalInstallments, cardNumber, installments } = req.body ?? {};
  if (!accountId || !label || !Array.isArray(installments) || installments.length === 0) {
    return res.status(400).json({ error: "accountId, label e installments[] são obrigatórios." });
  }
  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { id: true } });
  if (!account) return res.status(404).json({ error: "Conta não encontrada." });

  await prisma.transaction.createMany({
    data: installments.map((p: { n: number; date: string; amount: number }) => ({
      accountId,
      amount: p.amount,
      date: new Date(p.date),
      description: label,
      category: "",
      userCategories: [],
      installmentNumber: p.n,
      totalInstallments: totalInstallments ?? null,
      cardNumber: cardNumber ?? null,
      manual: true,
    })),
  });
  res.status(201).json({ created: installments.length });
});

// Recusar uma sugestão: persiste a identidade da compra pra ela não reaparecer no próximo scan.
commitmentsRouter.post("/commitments/suggestions/dismiss", async (req, res) => {
  const key = (req.body ?? {}).key as string | undefined;
  if (!key) return res.status(400).json({ error: "key é obrigatória." });
  await prisma.dismissedSuggestion.upsert({ where: { key }, update: {}, create: { key } });
  res.json({ key, dismissed: true });
});

// Apagar uma parcela manual (aceite errado). Só linhas manuais — nunca toca dado do banco.
commitmentsRouter.delete("/commitments/manual/:id", async (req, res) => {
  const r = await prisma.transaction.deleteMany({ where: { id: req.params.id, manual: true } });
  if (r.count === 0) return res.status(404).json({ error: "Parcela manual não encontrada." });
  res.json({ deleted: r.count });
});
