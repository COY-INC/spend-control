import { useMemo } from "react";
import { applyTxFilters } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TransactionFilters } from "@/components/TransactionFilters";
import { TransactionsTable } from "@/components/TransactionsTable";
import { useDashboard } from "@/dashboard/DashboardContext";

export function Transacoes() {
  const { transactions, filter, setFilter, banks, scope, userId, updateCategory, reload } = useDashboard();
  const filtered = useMemo(() => applyTxFilters(transactions, filter), [transactions, filter]);

  return (
    <div className="space-y-6">
      <TransactionFilters filter={filter} onChange={setFilter} banks={banks} />
      <Card>
        <CardHeader>
          <CardTitle>{scope === "couple" ? "Todas as transações" : "Transações"}</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionsTable
            transactions={filtered}
            onCategoryChange={updateCategory}
            userId={scope === "my" ? userId : undefined}
            includeInternal={filter.incluirInternos}
            onNoteSaved={reload}
            onDeleted={reload}
          />
        </CardContent>
      </Card>
    </div>
  );
}
