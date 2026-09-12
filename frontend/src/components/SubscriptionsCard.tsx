import { useEffect, useState } from "react";
import { api, brl, type Subscription } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const dm = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

// Assinaturas/recorrências detectadas nos últimos 6 meses (compartilhado do casal).
// Independente do seletor de mês; escondido quando não detecta nada.
export function SubscriptionsCard({ bank, month }: { bank?: string; month?: string }) {
  const [items, setItems] = useState<Subscription[]>([]);

  useEffect(() => {
    api.subscriptions().then(setItems).catch(console.error);
  }, []);

  const shown = bank ? items.filter((s) => s.bank === bank) : items;
  if (shown.length === 0) return null;
  // Total gasto no mês selecionado (fallback: mediana mensal, quando sem mês).
  const totalOf = (s: Subscription) => (month ? (s.monthlyTotals[month] ?? 0) : s.monthlyAmount);
  const total = shown.reduce((acc, x) => acc + totalOf(x), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle>Assinaturas e recorrências</CardTitle>
          <span className="ledger text-sm font-semibold text-rose-600 dark:text-rose-400">
            {month ? brl(total) : `~${brl(total)}/mês`}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {shown.map((s, i) => (
            <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{s.note ? s.note : s.label}</span>
                <span className="block text-xs text-muted-foreground">
                  visto em {s.occurrences}/6 meses · última {dm(s.lastDate)} · ~{brl(s.monthlyAmount)}/mês
                </span>
                {s.note && (
                  <span className="mt-0.5 block truncate text-xs italic text-muted-foreground">
                    💬 {s.note ? s.label : s.note}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums">{brl(totalOf(s))}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
