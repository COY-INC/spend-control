import { useMemo, useState } from "react";
import { applyTxFilters, isCard, overviewFilter } from "@/api";
import { MonthFlowCard } from "@/components/MonthFlowCard";
import { ExpensesDonut } from "@/components/charts/ExpensesDonut";
import { IncomeExpenseBar } from "@/components/charts/IncomeExpenseBar";
import { BudgetCard } from "@/components/BudgetCard";
import { SubscriptionsCard } from "@/components/SubscriptionsCard";
import { useDashboard } from "@/dashboard/DashboardContext";

// Fatia por meio de pagamento (independe do filtro global de tipo, que exige despesa):
// "cartao" = contas CREDIT; "conta" = demais (pix/débito/transferência). "todos" = ambos.
const MEIOS = [
  { v: "todos", label: "Todos" },
  { v: "cartao", label: "Cartão" },
  { v: "conta", label: "Pix/Transferência" },
] as const;
type Meio = (typeof MEIOS)[number]["v"];

export function Gastos() {
  const { transactions, filter, ym } = useDashboard();
  const filtered = useMemo(() => applyTxFilters(transactions, overviewFilter(filter)), [transactions, filter]);

  const [meio, setMeio] = useState<Meio>("todos");
  const byMeio = useMemo(
    () =>
      meio === "todos"
        ? filtered
        : filtered.filter((t) => (meio === "cartao" ? isCard(t) : !isCard(t))),
    [filtered, meio],
  );

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-md border border-border/50 p-0.5">
        {MEIOS.map((m) => (
          <button
            key={m.v}
            onClick={() => setMeio(m.v)}
            aria-pressed={meio === m.v}
            className={`min-h-9 rounded px-3 text-sm transition-colors ${
              meio === m.v ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-accent"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <MonthFlowCard transactions={byMeio} includeInternal={filter.incluirInternos} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ExpensesDonut transactions={byMeio} includeInternal={filter.incluirInternos} />
        <IncomeExpenseBar transactions={byMeio} includeInternal={filter.incluirInternos} />
      </div>
      <BudgetCard transactions={transactions} />
      <SubscriptionsCard bank={filter.banco} month={ym} />
    </div>
  );
}
