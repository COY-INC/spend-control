import { useEffect, useMemo, useState } from "react";
import { api, brl, type Investment } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const TYPE_LABEL: Record<string, string> = {
  FIXED_INCOME: "Renda fixa",
  EQUITY: "Ações",
  MUTUAL_FUND: "Fundos",
  ETF: "ETF",
  COE: "COE",
  SECURITY: "Títulos",
  OTHER: "Outros",
};
const typeLabel = (t: string) => TYPE_LABEL[t] ?? t;

// Investimentos importados (compartilhado do casal). Total + posições, respeitando o
// filtro de banco. Escondido quando não há nada (ou a MeuPluggy não expôs).
export function InvestmentsCard({ bank }: { bank?: string }) {
  const [all, setAll] = useState<Investment[]>([]);

  useEffect(() => {
    api.investments().then(setAll).catch(console.error);
  }, []);

  const items = useMemo(
    () => (bank ? all.filter((i) => i.institution === bank) : all),
    [all, bank],
  );
  const total = items.reduce((s, i) => s + i.balance, 0);

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>Investimentos</CardTitle>
          <span className="ledger text-lg font-semibold text-emerald-600 dark:text-emerald-400">
            {brl(total)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((inv, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{inv.name}</span>
                <span className="text-xs text-muted-foreground">
                  {typeLabel(inv.type)} · {inv.institution}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{brl(inv.balance)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
