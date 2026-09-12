import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { Transaction } from "@/api";
import { brl, expenseValue, incomeValue } from "@/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Fluxo: entradas vs saídas, com sinal ciente do tipo de conta (cartão vs conta).
export function IncomeExpenseBar({
  transactions,
  includeInternal = false,
}: {
  transactions: Transaction[];
  includeInternal?: boolean;
}) {
  const data = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const t of transactions) {
      entradas += incomeValue(t, includeInternal);
      saidas += expenseValue(t, includeInternal);
    }
    return [
      { name: "Entradas", value: entradas, fill: "#059669" },
      { name: "Saídas", value: saidas, fill: "#e11d48" },
    ];
  }, [transactions, includeInternal]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entradas vs. Saídas</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data}>
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(v) => brl(Number(v))} width={90} />
            <Tooltip formatter={(v) => brl(Number(v))} />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
