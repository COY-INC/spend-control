import { InvestmentsCard } from "@/components/InvestmentsCard";
import { useDashboard } from "@/dashboard/DashboardContext";

export function Investimentos() {
  const { filter } = useDashboard();
  return (
    <div className="space-y-6">
      <InvestmentsCard bank={filter.banco} />
    </div>
  );
}
