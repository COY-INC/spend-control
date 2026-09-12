import { brl, expenseValue, incomeValue, type Transaction } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Fluxo do mês = entradas − saídas no período já filtrado (calculado a partir das transações).
export function MonthFlowCard({
  transactions,
  includeInternal = false,
}: {
  transactions: Transaction[];
  includeInternal?: boolean;
}) {
  const income = transactions.reduce((s, t) => s + incomeValue(t, includeInternal), 0);
  const expense = -transactions.reduce((s, t) => s + expenseValue(t, includeInternal), 0);
  const net = income + expense;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fluxo do mês</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div
            className={`ledger text-2xl font-semibold tracking-tight ${
              net < 0 ? "text-rose-600 dark:text-rose-500" : "text-emerald-600 dark:text-emerald-500"
            }`}
          >
            {brl(net)}
          </div>
          <div className="text-xs text-muted-foreground">Entradas − Saídas no período</div>
        </div>
        <div className="flex gap-6 text-sm">
          <div>
            <div className="text-muted-foreground">Entradas</div>
            <div className="ledger font-medium text-emerald-600 dark:text-emerald-500">
              {brl(income)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">Saídas</div>
            <div className="ledger font-medium text-rose-600 dark:text-rose-500">
              {brl(expense)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
