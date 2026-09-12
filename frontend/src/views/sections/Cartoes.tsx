import { useMemo, useState } from "react";
import { applyTxFilters, overviewFilter } from "@/api";
import { CreditCardInvoicesCard } from "@/components/CreditCardInvoicesCard";
import { FutureCommitmentsCard } from "@/components/FutureCommitmentsCard";
import { InstallmentSuggestionsCard } from "@/components/InstallmentSuggestionsCard";
import { PaymentMethodSplitCard } from "@/components/PaymentMethodSplitCard";
import { useDashboard } from "@/dashboard/DashboardContext";

export function Cartoes() {
  const { transactions, filter, scope, userId } = useDashboard();
  const filtered = useMemo(() => applyTxFilters(transactions, overviewFilter(filter)), [transactions, filter]);
  const user = scope === "my" ? userId : undefined;
  // Aceitar uma sugestão cria parcelas → remonta o card de compromissos pra refletir na hora.
  const [refresh, setRefresh] = useState(0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CreditCardInvoicesCard userId={user} bank={filter.banco} />
        <PaymentMethodSplitCard transactions={filtered} includeInternal={filter.incluirInternos} />
      </div>
      <InstallmentSuggestionsCard userId={user} bank={filter.banco} onChange={() => setRefresh((r) => r + 1)} />
      <FutureCommitmentsCard key={refresh} userId={user} bank={filter.banco} />
    </div>
  );
}
