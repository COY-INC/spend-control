// frontend/src/views/sections/Resumo.tsx
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  brl,
  signedBalance,
  accountMatchesFilter,
  applyTxFilters,
  overviewFilter,
  incomeValue,
  expenseValue,
  effectiveCategory,
  type CreditCard,
  type CommitmentPlan,
  type PendingSummary,
} from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DueRemindersBanner } from "@/components/DueRemindersBanner";
import { BankChip } from "@/components/BankChip";
import { toPeriod } from "@/components/MonthYearPicker";
import { useDashboard } from "@/dashboard/DashboardContext";

// Tile clicável: eyebrow, valor grande em ledger e uma linha de contexto; leva à seção de origem.
function KpiTile({
  label,
  value,
  hint,
  to,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  to: string;
  tone?: "positive" | "negative";
}) {
  const toneCls =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-500"
      : tone === "negative"
        ? "text-rose-600 dark:text-rose-500"
        : "text-foreground";
  // Link de verdade: navega, então suporta ⌘/ctrl/middle-click e teclado nativo.
  return (
    <Link
      to={to}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
    >
      <Card className="h-full hover:ring-2 hover:ring-brand/30">
        <CardHeader>
          <CardTitle>{label}</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className={`ledger text-2xl font-semibold tracking-tight ${toneCls}`}>{value}</div>
          {hint && <span className="mt-1 block text-xs text-muted-foreground">{hint}</span>}
        </CardContent>
      </Card>
    </Link>
  );
}

export function Resumo() {
  const { accounts, investments, transactions, filter, scope, userId, ym } = useDashboard();
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [commitments, setCommitments] = useState<CommitmentPlan[]>([]);
  const [budgets, setBudgets] = useState<Record<string, number>>({});

  // Pendências do mês selecionado (recarrega ao trocar de mês).
  const [pending, setPending] = useState<PendingSummary | null>(null);
  useEffect(() => {
    api.pending(toPeriod(ym)).then(setPending).catch(console.error);
  }, [ym]);

  const dismissPending = async () => {
    try {
      await api.dismissPending();
      setPending({ total: 0, banks: [] });
    } catch (e) {
      console.error(e);
    }
  };

  const user = scope === "my" ? userId : undefined;
  useEffect(() => {
    api.cards(user).then(setCards).catch(console.error);
    api.commitments(user).then(setCommitments).catch(console.error);
    api.budgets().then(setBudgets).catch(console.error);
  }, [user]);

  // Patrimônio por banco (respeita filtro de banco). O total é a soma; o breakdown é a
  // assinatura — mostra de relance de onde vem o patrimônio, banco a banco.
  const byBank = useMemo(() => {
    const gf = overviewFilter(filter);
    const m = new Map<string, number>();
    for (const a of accounts) {
      if (!accountMatchesFilter(a.institution, a.type, gf)) continue;
      m.set(a.institution, (m.get(a.institution) ?? 0) + signedBalance(a));
    }
    for (const i of investments) {
      if (!accountMatchesFilter(i.institution, "INVESTMENT", gf)) continue;
      m.set(i.institution, (m.get(i.institution) ?? 0) + i.balance);
    }
    return [...m.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  }, [accounts, investments, filter]);
  const netWorth = byBank.reduce((s, [, v]) => s + v, 0);

  // Fluxo do mês (entradas − saídas) sobre as transações filtradas.
  const flow = useMemo(() => {
    const f = applyTxFilters(transactions, overviewFilter(filter));
    const inc = f.reduce((s, t) => s + incomeValue(t, filter.incluirInternos), 0);
    const exp = f.reduce((s, t) => s + expenseValue(t, filter.incluirInternos), 0);
    return { inc, exp, net: inc - exp };
  }, [transactions, filter]);

  const cardsFiltered = filter.banco ? cards.filter((c) => c.bank === filter.banco) : cards;
  const openInvoices = cardsFiltered.reduce((s, c) => s + c.openInvoice.amount, 0);

  const commitmentsFiltered = filter.banco
    ? commitments.filter((p) => p.bank === filter.banco)
    : commitments;
  const committed = commitmentsFiltered.reduce((s, p) => s + p.remainingAmount, 0);

  // Gasto vs orçamento: espelha o BudgetCard (seção /gastos) — gasto só das categorias
  // com limite, por categoria efetiva (sem internos), sobre as transações do mês SEM filtro
  // de banco (mesma base que o card usa).
  const budget = useMemo(() => {
    const spentByCat: Record<string, number> = {};
    for (const t of transactions) {
      const e = expenseValue(t);
      if (e > 0) spentByCat[effectiveCategory(t)] = (spentByCat[effectiveCategory(t)] ?? 0) + e;
    }
    const limit = Object.values(budgets).reduce((s, v) => s + v, 0);
    const spent = Object.keys(budgets).reduce((s, c) => s + (spentByCat[c] ?? 0), 0);
    return { limit, spent, ratio: limit > 0 ? spent / limit : null };
  }, [transactions, budgets]);

  return (
    <div className="space-y-4">
      <DueRemindersBanner />

      {pending && pending.total > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                {pending.total} transaç{pending.total === 1 ? "ão" : "ões"} sem comentário
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {pending.banks.map((b) => `${b.institution} ${b.count}`).join(" · ")}
              </p>
            </div>
            <button
              onClick={dismissPending}
              className="min-h-9 shrink-0 rounded-md border border-border/50 px-3 text-sm text-muted-foreground hover:bg-accent"
            >
              Dispensar por agora
            </button>
          </CardContent>
        </Card>
      )}

      {/* Herói: patrimônio líquido + breakdown por banco (a assinatura). */}
      <Card className="hover:shadow-sm">
        <CardHeader>
          <CardTitle>Patrimônio líquido</CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <div className="ledger text-4xl font-semibold tracking-tight tabular-nums">
            {brl(netWorth)}
          </div>
          {byBank.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-border/50 pt-4">
              {byBank.slice(0, 6).map(([bank, val]) => (
                <BankChip key={bank} institution={bank} value={brl(val)} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPIs secundários. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <KpiTile
          label="Fluxo do mês"
          value={brl(flow.net)}
          hint={`entradas ${brl(flow.inc)} · saídas ${brl(flow.exp)}`}
          to="/gastos"
          tone={flow.net >= 0 ? "positive" : "negative"}
        />
        <KpiTile
          label="Faturas em aberto"
          value={brl(openInvoices)}
          hint={`${cardsFiltered.length} cartão${cardsFiltered.length === 1 ? "" : "es"}`}
          to="/cartoes"
          tone="negative"
        />
        <KpiTile
          label="Comprometido em parcelas"
          value={brl(committed)}
          hint={`${commitmentsFiltered.length} parcelamento${commitmentsFiltered.length === 1 ? "" : "s"}`}
          to="/cartoes"
          tone="negative"
        />
        {budget.ratio !== null && (
          <KpiTile
            label="Gasto vs orçamento"
            value={`${Math.round(budget.ratio * 100)}%`}
            hint={`${brl(budget.spent)} de ${brl(budget.limit)}`}
            to="/gastos"
            tone={budget.ratio > 1 ? "negative" : undefined}
          />
        )}
      </div>
    </div>
  );
}
